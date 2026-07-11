import type { RouteLocationNormalized, RouteLocationRaw } from "vue-router";

// ---------------------------------------------------------------------------
// Type augmentation so `meta.middlewares` is recognized by TS out of the box.
// ---------------------------------------------------------------------------
declare module "vue-router" {
    interface RouteMeta {
        middlewares?: Middleware<any> | Middleware<any>[];
    }
}

/**
 * Matches vue-router's own NavigationGuardReturn so this integrates cleanly
 * with router.beforeEach typing (an Error return is treated by vue-router
 * as "abort navigation and forward to router.onError").
 */
export type MiddlewareReturn = boolean | RouteLocationRaw | Error | void;

export type MiddlewareContext<TExtra = Record<string, unknown>> = {
    to: RouteLocationNormalized;
    from: RouteLocationNormalized;
    /** True when running during SSR (no `window`), false in the browser. */
    isServer: boolean;
    /** Blocks the navigation. You MUST `return` this call's result. */
    cancel(): false;
    /** Explicitly allows the navigation to continue. Equivalent to returning `undefined`. */
    next(): true;
    /**
     * Internal (same-app) redirect, resolved against the app's own route
     * table by vue-router. This CANNOT navigate cross-origin (e.g.
     * account.example.com -> auth.example.com) — vue-router has no concept
     * of another origin. Use `externalRedirect` for that.
     */
    redirect(to: RouteLocationRaw): RouteLocationRaw;
    /**
     * Cross-origin / full-page redirect. In the browser this sets
     * `window.location.href`. During SSR it calls the `onExternalRedirect`
     * handler you provided to `createMiddleware`/`registerPlugin`, so you can
     * wire it to whatever your server framework needs (Express `res.writeHead`,
     * h3/Nitro `sendRedirect`, a Cloudflare Worker `Response`, etc). You MUST
     * `return` this call's result to stop further middleware from running.
     */
    externalRedirect(url: string, status?: number): false;
} & TExtra;

export type Middleware<TExtra = Record<string, unknown>> = (context: MiddlewareContext<TExtra>) => MiddlewareReturn | Promise<MiddlewareReturn>;

export type MiddlewareErrorHandler = (error: unknown, to: RouteLocationNormalized, from: RouteLocationNormalized) => void;

/**
 * Called when `context.externalRedirect(url, status)` is invoked during SSR
 * (there is no `window` to redirect via on the server). Wire this to your
 * server framework's redirect mechanism. This library has no direct
 * dependency on Node's `http` types so it works with Express, h3/Nitro,
 * Cloudflare Workers, Deno, etc.
 *
 * IMPORTANT: after calling this, your SSR render entry point must check
 * whether a redirect was already issued (e.g. a flag you set inside this
 * handler) and skip rendering/streaming the app body — writing a response
 * body after headers/redirect are already sent will throw or corrupt the
 * response depending on your server.
 */
export type ExternalRedirectHandler = (url: string, status: number) => void;

export type MiddlewareOptions<TExtra = Record<string, unknown>> = {
    global?: Middleware<TExtra> | Middleware<TExtra>[];
    /**
     * Extra data merged into every MiddlewareContext. Use this on the server
     * to inject per-request data (req, res, cookies, auth token, etc.) so
     * middleware can make SSR-safe decisions without reaching for globals.
     * On the client this is typically omitted or set to `{}`.
     */
    extra?: TExtra;
    /**
     * Called whenever a middleware throws or its promise rejects.
     * Wire this to your error tracker (Sentry, etc.). If omitted, the error
     * is rethrown and surfaces via router.onError as before.
     */
    onError?: MiddlewareErrorHandler;
    /**
     * Required if any middleware calls `context.externalRedirect()` during
     * SSR. See `ExternalRedirectHandler` for details. Not needed for
     * client-only apps (client falls back to `window.location.href`).
     */
    onExternalRedirect?: ExternalRedirectHandler;
    /**
     * When true (default), warns via `console.warn` in non-production builds
     * if a middleware calls `cancel()` / `redirect()` / `externalRedirect()`
     * but forgets to `return` the result — a common footgun that otherwise
     * fails silently (navigation proceeds as if nothing happened). Detection
     * relies on `process.env.NODE_ENV`; set to `false` to disable entirely
     * (e.g. if your bundler doesn't define `process.env`).
     */
    warnOnMissingReturn?: boolean;
};
