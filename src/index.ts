import type { Plugin } from "vue";
import type { RouteLocationNormalized, RouteLocationRaw, Router } from "vue-router";

export type Middleware = (context: MiddlewareContext) => any;
export type MiddlewareContext = {
	to: RouteLocationNormalized;
	from: RouteLocationNormalized;
	cancel(): boolean;
	next(): boolean;
	redirect(to: RouteLocationRaw): RouteLocationRaw;
};
export type MiddlewareOptions = {
	globalMiddlewares?: Middleware | Middleware[];
};

export function createMiddleware(options: MiddlewareOptions = {}): Plugin {
	return {
		install(app, vueOptions: MiddlewareOptions = {}) {
			const $router = app.config.globalProperties.$router;
			if (!$router) {
				console.warn("vue-router is required for vue3-middleware plugin to work.");
				return;
			}

			registerPlugin($router, mergeOptions(options, vueOptions));
		},
	};
}

function mergeOptions(
	option1: MiddlewareOptions = {},
	option2: MiddlewareOptions = {}
): MiddlewareOptions {
	const mergedMiddlewares = [];

	if (typeof option1 === "object" && option1.globalMiddlewares) {
		mergedMiddlewares.push(
			...(Array.isArray(option1.globalMiddlewares)
				? option1.globalMiddlewares
				: [option1.globalMiddlewares])
		);
	}

	if (typeof option2 === "object" && option2.globalMiddlewares) {
		mergedMiddlewares.push(
			...(Array.isArray(option2.globalMiddlewares)
				? option2.globalMiddlewares
				: [option2.globalMiddlewares])
		);
	}

	return {
		globalMiddlewares: mergedMiddlewares,
	};
}

function registerPlugin(router: Router, options?: MiddlewareOptions) {
	const global: Middleware[] = [];
	if (typeof options === "object" && options.globalMiddlewares) {
		global.push(
			...(Array.isArray(options.globalMiddlewares)
				? options.globalMiddlewares
				: [options.globalMiddlewares])
		);
	}

	router.beforeEach(async (to, from) => {
		const middlewaresToCall = [...global];

		for (let i = 0; i < to.matched.length; i++) {
			const route = to.matched[i];
			const middlewares = route.meta.middlewares as Middleware[] | Middleware;
			if (middlewares) {
				const middleware = Array.isArray(middlewares) ? middlewares : [middlewares];
				middlewaresToCall.push(...middleware);
			}
		}

		let i = 0;
		const context: MiddlewareContext = { to, from, cancel, next, redirect };
		while (i < middlewaresToCall.length) {
			const middleware = wrapMiddleware(middlewaresToCall[i], context);
			const response = await middleware();
			if (response !== true && response !== undefined) {
				return response;
			}
			i++;
		}
	});
}

function redirect(to: RouteLocationRaw) {
	return to;
}

function cancel() {
	return false;
}
function next() {
	return true;
}

function wrapMiddleware(fn: Middleware, context: MiddlewareContext) {
	return function () {
		try {
			const result = fn(context);
			if (result instanceof Promise) {
				return result;
			} else {
				return Promise.resolve(result);
			}
		} catch (error) {
			return Promise.reject(error);
		}
	};
}
