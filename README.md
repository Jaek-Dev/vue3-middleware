# Vue3 Middleware

`vue3-middleware` is a lightweight plugin for Vue 3 applications that provides middleware functionality. It allows you to add middleware functions that runs before each navigation, providing a powerful tool for handling authentication, authorization, logging, and other concerns. With just a few simple steps, you can add this plugin to your vue application.

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

**Note**: Registered global middlewares will run for every navigation.

```ts
import { createApp } from "vue";
import App from './App.vue';
import { createMiddleware } from "vue3-middleware";
import removeTrailingSlash from './middlewares/removeTrailingSlash';
import router from './router';

const app = createApp(App);
const middleware = createMiddleware();

// OR with options
// const middleware = createMiddleware({
//     globalMiddlewares: [
//         removeTrailingSlash
//     ],
//     // OR
//     // globalMiddlewares: removeTrailingSlash
// });

// Registration here
app.use(middleware);

// OR register with options
// app.use(middleware, {
//     globalMiddlewares: [
//         removeTrailingSlash
//     ],
//     // OR
//     // globalMiddlewares: removeTrailingSlash
// });

// Use middleware with the router
app.use(router);

app.mount('#app');
```

#### Defining Middleware

You can define middleware functions that will be executed before route changes. Middleware functions receive the `to`, `from`, `next`, `cancel` and `redirect` parameters, similar to Vue Router navigation guards.

```ts
// middleware/auth.ts
import { useUser } from '@/stores/user.ts';
import type { MiddlewareContext } from 'vue3-middleware';

export default function auth({ to, next, redirect }: MiddlewareContext) {
    const user = useUser();
    if (to.meta.requiresAuth && !user.isLoggedIn) {
        return redirect({ name: 'login' });
    } 
    return next();
}


// middleware/guest.ts
import { useUser } from '@/stores/user.ts';
import type { MiddlewareContext } from 'vue3-middleware';

export default function guest({ from, next, redirect }: MiddlewareContext) {
    const user = useUser();
    if (user.isLoggedIn) {
        return redirect(from);
    } 
    return next();
}


// middleware/removeTrailingSlash.ts
import { useUser } from '@/stores/user.ts';
import type { MiddlewareContext } from 'vue3-middleware';

export default function removeTrailingSlash({ to, next, redirect }: MiddlewareContext) {
    if (to.path.length > 1 && to.path.endsWith("/")) {
        return redirect(to.path.substring(0, to.path.length - 1));
    }
    return next();
}


// middleware/noLeaveNoTransfer.ts
import { useUser } from '@/stores/user.ts';
import type { MiddlewareContext } from 'vue3-middleware';

export default function noLeaveNoTransfer({ cancel }: MiddlewareContext) {
    // Explicitly cancel the navigation and terminate
    return cancel();
}
```

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
const middleware = createMiddleware();

app.use(middleware, {
    globalMiddlewares: [
        removeTrailingSlash
    ],
});

app.use(router);
app.mount('#app')


// middleware/auth.ts
import { useUser } from '@/stores/user.ts';
import type { MiddlewareContext } from 'vue3-middleware';

export default function auth({ to, next, redirect }: MiddlewareContext) {
    const user = useUser();
    if (to.meta.requiresAuth && !user.isLoggedIn) {
        return redirect({ name: 'login' });
    } 
    return next();
}


// middleware/guest.ts
import { useUser } from '@/stores/user.ts';
import type { MiddlewareContext } from 'vue3-middleware';

export default function guest({ from, next, redirect }: MiddlewareContext) {
    const user = useUser();
    if (user.isLoggedIn) {
        return redirect(from);
    } 
    return next();
}


// middleware/removeTrailingSlash.ts
import { useUser } from '@/stores/user.ts';
import type { MiddlewareContext } from 'vue3-middleware';

export default function removeTrailingSlash({ to, next, redirect }: MiddlewareContext) {
    if (to.path.length > 1 && to.path.endsWith("/")) {
        return redirect(to.path.substring(0, to.path.length - 1));
    }
    return next();
}


// middleware/noLeaveNoTransfer.ts
import { useUser } from '@/stores/user.ts';
import type { MiddlewareContext } from 'vue3-middleware';

export default function noLeaveNoTransfer({ cancel }: MiddlewareContext) {
    return cancel();
}


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
