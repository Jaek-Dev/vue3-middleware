import type { Router } from "vue-router";
import type { Middleware, MiddlewareContext, MiddlewareOptions, MiddlewareReturn } from "./types";
import type { Plugin } from "vue";

const isProduction = typeof process !== "undefined" && process.env && process.env.NODE_ENV === "production";

const isServerEnv = typeof window === "undefined";

// Tracks routers that already have a guard installed, so a duplicate
// `app.use(createMiddleware(router, ...))` call (easy to trigger by
// accident with HMR or multi-entry SSR setups) warns instead of silently
// running the whole middleware chain twice per navigation.
const installedRouters = new WeakSet<Router>();

/**
 * Creates the Vue plugin. The router must be passed explicitly rather than
 * read off `app.config.globalProperties.$router`, because that property is
 * only guaranteed to exist if `app.use(router)` ran first — an ordering
 * dependency that's easy to get wrong, especially in SSR entry files where
 * app/router are constructed fresh per request.
 */
export function createMiddleware<TExtra = Record<string, unknown>>(router: Router, options: MiddlewareOptions<TExtra> = {}): Plugin {
    return {
        install(_app, vueOptions: MiddlewareOptions<TExtra> = {}) {
            registerPlugin(router, mergeOptions(options, vueOptions));
        },
    };
}

/** Typed authoring helper — purely for ergonomics/inference, does nothing at runtime. */
export function defineMiddleware<TExtra = Record<string, unknown>>(fn: Middleware<TExtra>): Middleware<TExtra> {
    return fn;
}

function mergeOptions<TExtra>(option1: MiddlewareOptions<TExtra> = {}, option2: MiddlewareOptions<TExtra> = {}): MiddlewareOptions<TExtra> {
    const mergedMiddlewares: Middleware<TExtra>[] = [];

    for (const option of [option1, option2]) {
        if (option?.global) {
            mergedMiddlewares.push(...(Array.isArray(option.global) ? option.global : [option.global]));
        }
    }

    return {
        global: mergedMiddlewares,
        extra: { ...(option1.extra ?? {}), ...(option2.extra ?? {}) } as TExtra,
        onError: option2.onError ?? option1.onError,
        onExternalRedirect: option2.onExternalRedirect ?? option1.onExternalRedirect,
        warnOnMissingReturn: option2.warnOnMissingReturn ?? option1.warnOnMissingReturn ?? true,
    };
}

/**
 * Registers the beforeEach guard on the router and returns an unregister
 * function. Call the returned function to remove the guard — useful for
 * Vite/webpack HMR (to avoid stacking duplicate guards on re-execution) and
 * for tests that install/uninstall the plugin between cases.
 */
function registerPlugin<TExtra = Record<string, unknown>>(router: Router, options?: MiddlewareOptions<TExtra>): () => void {
    if (installedRouters.has(router)) {
        warn(
            "createMiddleware/registerPlugin was called more than once for the same router instance. " +
                "This will run your middleware chain multiple times per navigation. " +
                "If this is intentional (e.g. HMR), make sure you call the unregister function " +
                "returned by the previous registration first.",
        );
    } else {
        installedRouters.add(router);
    }

    const global: Middleware<TExtra>[] = [];
    if (options?.global) {
        global.push(...(Array.isArray(options.global) ? options.global : [options.global]));
    }
    const extra = (options?.extra ?? {}) as TExtra;
    const onError = options?.onError;
    const onExternalRedirect = options?.onExternalRedirect;
    const warnOnMissingReturn = options?.warnOnMissingReturn ?? true;

    const unregister = router.beforeEach(async (to, from) => {
        const middlewaresToCall: Middleware<TExtra>[] = [...global];

        for (const route of to.matched) {
            const middlewares = route.meta.middlewares as Middleware<TExtra>[] | Middleware<TExtra> | undefined;
            if (middlewares) {
                middlewaresToCall.push(...(Array.isArray(middlewares) ? middlewares : [middlewares]));
            }
        }

        for (const middleware of middlewaresToCall) {
            // `calledSignal` tracks whether cancel/redirect/externalRedirect was
            // invoked during this middleware's execution, so we can warn if the
            // middleware forgot to `return` it.
            let calledSignal: MiddlewareReturn | typeof NOT_CALLED = NOT_CALLED;

            const context: MiddlewareContext<TExtra> = {
                to,
                from,
                isServer: isServerEnv,
                cancel: () => {
                    calledSignal = false;
                    return false;
                },
                next: () => {
                    calledSignal = true;
                    return true;
                },
                redirect: (target) => {
                    calledSignal = target;
                    return target;
                },
                externalRedirect: (url, status = 302) => {
                    calledSignal = false;
                    if (!isServerEnv) {
                        window.location.href = url;
                    } else if (onExternalRedirect) {
                        onExternalRedirect(url, status);
                    } else {
                        warn(
                            `externalRedirect("${url}") was called during SSR but no "onExternalRedirect" ` +
                                "handler was provided to createMiddleware/registerPlugin. The redirect will " +
                                "have no effect on the server response.",
                        );
                    }
                    return false;
                },
                ...extra,
            };

            try {
                const response = await runMiddleware(middleware, context);

                if (warnOnMissingReturn && !isProduction && calledSignal !== NOT_CALLED && response === undefined) {
                    warn(
                        "A middleware called cancel() / redirect() / externalRedirect() but did not " +
                            "`return` the result. Navigation will proceed as if nothing happened. " +
                            "Middleware must `return context.cancel()` (etc), not just call it.",
                    );
                }

                if (response !== true && response !== undefined) {
                    return response;
                }
            } catch (error) {
                if (onError) {
                    onError(error, to, from);
                    // Treat a handled error as "block navigation" rather than letting
                    // it fall through to router.onError. If you'd rather it still
                    // reach router.onError, rethrow inside your onError handler.
                    return false;
                }
                throw error;
            }
        }

        return undefined;
    });

    return () => {
        installedRouters.delete(router);
        unregister();
    };
}

const NOT_CALLED = Symbol("not-called");

async function runMiddleware<TExtra>(fn: Middleware<TExtra>, context: MiddlewareContext<TExtra>): Promise<MiddlewareReturn> {
    return await fn(context);
}

function warn(message: string) {
    if (!isProduction) {
        // eslint-disable-next-line no-console
        console.warn(`[vue3-middleware] ${message}`);
    }
}
