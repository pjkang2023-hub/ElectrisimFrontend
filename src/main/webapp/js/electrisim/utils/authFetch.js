/**
 * Attaches the api.electrisim.com bearer token to simulation-backend requests.
 *
 * The backend is called from ~93 sites across the codebase, 25 of which are
 * committed in minified form. Editing each call site is not practical and would
 * have to be redone after every `npm run minify`. This wraps window.fetch once
 * instead, so every current and future backend call carries the header with no
 * change at the call sites.
 *
 * Scope is deliberately narrow: the header is added ONLY for requests whose
 * origin matches the configured simulation backend. Requests to the auth/Stripe
 * API (which set their own Authorization header), to CDNs, and to cloud-storage
 * providers are passed through untouched - sending this token to a third party
 * would leak it.
 *
 * Load this before any module that calls the backend. It is idempotent.
 */

(function () {
    'use strict';

    if (window.__electrisimAuthFetchInstalled) return;
    window.__electrisimAuthFetchInstalled = true;

    var nativeFetch = window.fetch;
    if (typeof nativeFetch !== 'function') return;

    function originOf(url) {
        try {
            return new URL(url, window.location.href).origin;
        } catch (e) {
            return null;
        }
    }

    /** Origins that should receive the simulation token. */
    function backendOrigins() {
        var out = [];
        try {
            var primary = window.ENV && window.ENV.backendUrl;
            if (primary) {
                var o = originOf(primary);
                if (o) out.push(o);
            }
        } catch (e) { /* ENV not ready yet */ }

        // getBackendUrlCandidates() covers the local/tunnel fallback in dev.
        try {
            if (typeof window.getBackendUrlCandidates === 'function') {
                window.getBackendUrlCandidates().forEach(function (u) {
                    var o = originOf(u);
                    if (o && out.indexOf(o) === -1) out.push(o);
                });
            }
        } catch (e) { /* ignore */ }

        return out;
    }

    function isBackendRequest(url) {
        var target = originOf(url);
        if (!target) return false;
        return backendOrigins().indexOf(target) !== -1;
    }

    function token() {
        try {
            return localStorage.getItem('token') || null;
        } catch (e) {
            return null; // private mode / storage blocked
        }
    }

    window.fetch = function (input, init) {
        var url = (typeof input === 'string') ? input
            : (input && input.url) ? input.url
            : String(input);

        if (!isBackendRequest(url)) {
            return nativeFetch.apply(this, arguments);
        }

        var tok = token();
        if (!tok) {
            // Not signed in. Let it through: the backend decides whether to
            // allow unauthenticated calls (ELECTRISIM_AUTH_MODE).
            return nativeFetch.apply(this, arguments);
        }

        var opts = Object.assign({}, init || {});
        var headers = new Headers(
            (init && init.headers) || (input && input.headers) || {}
        );
        if (!headers.has('Authorization')) {
            headers.set('Authorization', 'Bearer ' + tok);
        }
        opts.headers = headers;

        // A Request object already froze its headers; rebuild from its URL.
        if (typeof input !== 'string' && input && input.url) {
            return nativeFetch.call(this, input.url, Object.assign({
                method: input.method,
                body: init && init.body,
                mode: input.mode,
                credentials: input.credentials
            }, opts));
        }

        return nativeFetch.call(this, url, opts);
    };

    console.log('✅ Electrisim auth fetch installed');
})();
