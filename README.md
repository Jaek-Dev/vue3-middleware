# Vue3 Middleware

`vue3-middleware` is a lightweight plugin for Vue 3 applications that provides middleware functionality. It allows you to add middleware functions that run before each navigation, providing a powerful tool for handling authentication, authorization, logging, and other concerns. With just a few simple steps, you can add this plugin to your vue application.

### Installation

You can install `vue3-middleware` using npm or yarn.

**Please note that this plugin currently support only `vue` 3.x and `vue-router` 4.x**

```bash
# install using npm
npm install vue3-middleware

# or with yarn
yarn add vue3-middleware
```

### Usage

#### Setting Up Middleware

First, you need to set up the middleware in your Vue 3 application. Import `createMiddleware` from `vue3-middleware` and set it up in your main application file (typically main.js or main.ts).

`createMiddleware` requires the `router` instance as its first argument — it's passed explicitly rather than read off the app, because that avoids relying on `app.use(router)` having already run (an ordering issue that's easy to hit in SSR entry files where the app/router are constructed fresh per request).

**Note**: Registered global middlewares will run for every navigation.

```ts
import { createApp } from "vue";
import App from './App.vue';
import { createMiddleware } from "vue3-middleware";
import removeTrailingSlash from './middlewares/removeTrailingSlash';
import router from './router';

const app = createApp(App);
const middleware = createMiddleware(router);

// OR with options
// const middleware = createMiddleware(router, {
//     global: [
//         removeTrailingSlash
//     ],
//     // OR
//     // global: removeTrailingSlash
// });

// Registration here
app.use(middleware);

// OR register with options
// app.use(middleware, {
//     global: [
//         removeTrailingSlash
//     ],
//     // OR
//     // global: removeTrailingSlash
// });

app.use(router);

app.mount('#app');
```

#### Defining Middleware

You can define middleware functions that will be executed before route changes. Middleware functions receive a context with `to`, `from`, `isServer`, `next`, `cancel`, `redirect` and `externalRedirect`, similar to Vue Router navigation guards.

**Important**: if a middleware calls `cancel()`, `redirect()` or `externalRedirect()`, you must `return` the result. These calls don't take effect on their own — the return value is what tells the middleware chain (and vue-router) what to do. Calling one without returning it is a common footgun; by default the plugin warns via `console.warn` in development when it detects this (see `warnOnMissingReturn` below).

You can optionally wrap middleware in the `defineMiddleware` helper — it's purely for type inference and does nothing at runtime.

```ts
// middleware/auth.ts
import { useUser } from '@/stores/user.ts';
import { defineMiddleware } from 'vue3-middleware';

export default defineMiddleware(({ to, next, redirect }) => {
    const user = useUser();
    if (to.meta.requiresAuth && !user.isLoggedIn) {
        return redirect({ name: 'login' });
    }
    return next();
});


// middleware/guest.ts
import { useUser } from '@/stores/user.ts';
import { defineMiddleware } from 'vue3-middleware';

export default defineMiddleware(({ from, next, redirect }) => {
    const user = useUser();
    if (user.isLoggedIn) {
        return redirect(from);
    }
    return next();
});


// middleware/removeTrailingSlash.ts
import { defineMiddleware } from 'vue3-middleware';

export default defineMiddleware(({ to, next, redirect }) => {
    if (to.path.length > 1 && to.path.endsWith("/")) {
        return redirect(to.path.substring(0, to.path.length - 1));
    }
    return next();
});


// middleware/noLeaveNoTransfer.ts
import { defineMiddleware } from 'vue3-middleware';

export default defineMiddleware(({ cancel }) => {
    // Explicitly cancel the navigation and terminate
    return cancel();
});
```

`redirect` performs an internal (same-app) redirect resolved by vue-router, and can't navigate cross-origin. For cross-origin / full-page redirects, use `externalRedirect(url, status?)` instead — in the browser it sets `window.location.href`; during SSR it calls the `onExternalRedirect` handler you provide to `createMiddleware` (see [Options](#options) below).

#### Applying Middleware to Routes

You can apply middleware to specific routes by using the meta property in your route definitions.

```ts
import { createRouter, createWebHistory } from 'vue-router';
import Home from './views/Home.vue';
import Login from './views/Login.vue';
import auth from './middleware/auth';
import guest from './middlewares/guest';
import admin from './middlewares/admin';

const routes = [
    {
        path: '/',
        name: 'home',
        component: Home
    },
    {
        path: '/login',
        name: 'login',
        component: Login,
        meta: {
            middlewares: [guest],
            // OR
            // middlewares: guest
        }
    },
    {
        path: '/dashboard',
        name: 'dashboard',
        component: () => import('./views/Dashboard.vue'),
        meta: {
            middlewares: [auth]
        }
    },
    {
        path: '/admin',
        name: 'admin',
        redirect: {name: 'admin.dashboard'},
        meta: {
            middlewares: [auth, admin]
        }, 
        children: [
            {
                path: 'dashboard',
                name: 'admin.dashboard',
                component: () => import('./views/admin/Dashboard.vue'),
            },
            {
                path: 'users',
                name: 'admin.users',
                component: () => import('./views/admin/Users.vue'),
            }
        ]
    }
];

const router = createRouter({
    history: createWebHistory(),
    routes
});

export default router;
```

**Note**: A middleware that's defined on parent route will also guard children routes, so no you don't have to define it again on the children routes.

#### Options

`createMiddleware(router, options)` (and the second argument to `app.use(middleware, options)`) accepts:

| Option | Type | Description |
| --- | --- | --- |
| `global` | `Middleware \| Middleware[]` | Middleware that runs on every navigation, before any route-level middleware. |
| `extra` | `object` | Extra data merged into every `MiddlewareContext`. Handy on the server to inject per-request data (`req`, `res`, cookies, auth token, etc.) so middleware doesn't need to reach for globals. See [Typed extra context](#typed-extra-context) below. |
| `onError` | `(error, to, from) => void` | Called whenever a middleware throws or its promise rejects. Wire this to your error tracker. If omitted, the error is rethrown and surfaces via `router.onError`. |
| `onExternalRedirect` | `(url, status) => void` | Required if any middleware calls `context.externalRedirect()` during SSR. Wire it to your server framework's redirect mechanism (Express `res.writeHead`, h3/Nitro `sendRedirect`, a Cloudflare Worker `Response`, etc). Not needed for client-only apps. |
| `warnOnMissingReturn` | `boolean` (default `true`) | Warns via `console.warn` in non-production builds if a middleware calls `cancel()` / `redirect()` / `externalRedirect()` but forgets to `return` the result. Set to `false` to disable. |

Options passed to `createMiddleware(router, options)` and to `app.use(middleware, options)` are merged — `global` middlewares are concatenated, `extra` is shallow-merged, and the rest fall back from the `app.use` options to the `createMiddleware` options.

#### Typed extra context

If you use the `extra` option, pass its type as a generic to `createMiddleware` and `defineMiddleware` so it's available on `context` with full type-safety:

```ts
// main.ts
import { createMiddleware } from 'vue3-middleware';
import router from './router';

type ExtraContext = { userId: string | null };

const middleware = createMiddleware<ExtraContext>(router, {
    extra: { userId: null },
});
```

```ts
// middleware/auth.ts
import { defineMiddleware } from 'vue3-middleware';

type ExtraContext = { userId: string | null };

export default defineMiddleware<ExtraContext>(({ userId, next, redirect }) => {
    if (!userId) {
        return redirect({ name: 'login' });
    }
    return next();
});
```

### Example

Here's a full example that combines the setup, middleware definition, and route application.

```ts
// main.ts
import { createApp } from "vue";
import App from './App.vue';
import { createMiddleware } from "vue3-middleware";
import removeTrailingSlash from './middlewares/removeTrailingSlash';
import router from './router';

const app = createApp(App);
const middleware = createMiddleware(router);

app.use(middleware, {
    global: [
        removeTrailingSlash
    ],
});

app.use(router);
app.mount('#app')


// middleware/auth.ts
import { useUser } from '@/stores/user.ts';
import { defineMiddleware } from 'vue3-middleware';

export default defineMiddleware(({ to, next, redirect }) => {
    const user = useUser();
    if (to.meta.requiresAuth && !user.isLoggedIn) {
        return redirect({ name: 'login' });
    }
    return next();
});


// middleware/guest.ts
import { useUser } from '@/stores/user.ts';
import { defineMiddleware } from 'vue3-middleware';

export default defineMiddleware(({ from, next, redirect }) => {
    const user = useUser();
    if (user.isLoggedIn) {
        return redirect(from);
    }
    return next();
});


// middleware/removeTrailingSlash.ts
import { defineMiddleware } from 'vue3-middleware';

export default defineMiddleware(({ to, next, redirect }) => {
    if (to.path.length > 1 && to.path.endsWith("/")) {
        return redirect(to.path.substring(0, to.path.length - 1));
    }
    return next();
});


// middleware/noLeaveNoTransfer.ts
import { defineMiddleware } from 'vue3-middleware';

export default defineMiddleware(({ cancel }) => {
    return cancel();
});


// router/index.ts
import { createRouter, createWebHistory } from 'vue-router';
import Home from './views/Home.vue';
import Login from './views/Login.vue';
import auth from './middleware/auth';
import guest from './middlewares/guest';
import admin from './middlewares/admin';

const routes = [
    {
        path: '/',
        name: 'home',
        component: Home
    },
    {
        path: '/login',
        name: 'login',
        component: Login,
        meta: {
            middlewares: [guest],
        }
    },
    {
        path: '/dashboard',
        name: 'dashboard',
        component: () => import('./views/Dashboard.vue'),
        meta: {
            middlewares: [auth]
        }
    },
    {
        path: '/admin',
        name: 'admin',
        redirect: {name: 'admin.dashboard'},
        meta: {
            middlewares: [auth, admin]
        }, 
        children: [
            {
                path: 'dashboard',
                name: 'admin.dashboard',
                component: () => import('./views/admin/Dashboard.vue'),
            },
            {
                path: 'users',
                name: 'admin.users',
                component: () => import('./views/admin/Users.vue'),
            }
        ]
    }
];

const router = createRouter({
    history: createWebHistory(),
    routes
});

export default router;
```

### Contributing

Contributions are welcome! Please feel free to fork this package and contribute by submitting a pull request to enhance the functionalities.

### How can I thank you?

Why not star the github repo? I'd love the attention! Why not share the link for this repository on X (formerly Twitter) or HackerNews? Spread the word!

Don't forget to [follow me on X (formerly Twitter)](https://twitter.com/Jaek_Dev)! and also [follow me on LinkedIn](https://www.linkedin.com/in/Jaek-Dev)!

Thanks!
Jacob Eke.

### License

The MIT License (MIT). Please see [License File](LICENSE.md) for more information.
