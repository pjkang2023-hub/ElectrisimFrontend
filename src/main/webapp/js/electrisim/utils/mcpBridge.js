/**
 * Draws diagrams sent by the Electrisim MCP server.
 *
 * The MCP server runs beside the MCP client and cannot reach into the browser,
 * so it holds each diagram on a small local bridge (127.0.0.1:5503 by default)
 * and this script pulls them: poll for the next one, draw it with
 * buildDiagramFromModelJson, and report back what happened so the tool call can
 * tell the model whether the drawing worked.
 *
 * On by default only when Electrisim itself is served from this machine - a
 * hosted copy polling localhost would fill every visitor's console with
 * connection errors. Override per browser:
 *
 *     localStorage.setItem('electrisim.mcpBridge', 'on' | 'off')
 *     localStorage.setItem('electrisim.mcpBridgeUrl', 'http://127.0.0.1:5503')
 *
 * Idempotent; safe to load more than once.
 */

(function () {
    'use strict';

    if (window.__electrisimMcpBridgeInstalled) return;
    window.__electrisimMcpBridgeInstalled = true;

    var STORAGE_SWITCH = 'electrisim.mcpBridge';
    var STORAGE_URL = 'electrisim.mcpBridgeUrl';
    var DEFAULT_URL = 'http://127.0.0.1:5503';
    var POLL_MS = 1500;
    var MAX_BACKOFF_MS = 30000;

    function setting(key) {
        try {
            return localStorage.getItem(key);
        } catch (e) {
            return null; // storage blocked
        }
    }

    function enabled() {
        var forced = setting(STORAGE_SWITCH);
        if (forced === 'on') return true;
        if (forced === 'off') return false;
        return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
    }

    if (!enabled()) return;

    var base = (setting(STORAGE_URL) || DEFAULT_URL).replace(/\/+$/, '');
    var delay = POLL_MS;
    var announced = false;
    var warnedStatus = null;

    /** The live editor graph - the same lookup the performance optimizers use. */
    function editorGraph() {
        var app = window.App;
        return (app && app._editorUi && app._editorUi.editor && app._editorUi.editor.graph) ||
            (app && app._instance && app._instance.editor && app._instance.editor.graph) ||
            (window.editorUi && window.editorUi.editor && window.editorUi.editor.graph) ||
            window.optimizedGraph ||
            null;
    }

    /**
     * Whether a diagram file is open. Until one is, the editor's graph is a
     * placeholder behind the start dialog: anything drawn into it is thrown away
     * when a file is created or opened, so drawing then would report success for
     * a diagram the user never sees.
     */
    function diagramOpen() {
        var app = window.App;
        var candidates = [app && app._editorUi, app && app._instance, window.editorUi];
        for (var i = 0; i < candidates.length; i++) {
            var ui = candidates[i];
            if (ui && typeof ui.getCurrentFile === 'function') return !!ui.getCurrentFile();
        }
        // No editor to ask yet (still starting up). Not ready: "a graph exists"
        // is exactly the placeholder this check is here to rule out.
        return false;
    }

    function schedule(ms) {
        setTimeout(poll, ms);
    }

    function ack(body) {
        return fetch(base + '/ack', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }).catch(function () { /* the server will time the job out */ });
    }

    /** Draw one job, collecting any console errors raised while it runs. */
    function draw(job) {
        var graph = editorGraph();
        if (!diagramOpen()) {
            // The file was closed between the poll and now.
            return Promise.resolve({
                id: job.id, ok: false,
                error: 'No diagram is open in Electrisim. Open or create one and draw again.'
            });
        }
        if (!graph || typeof window.buildDiagramFromModelJson !== 'function') {
            return Promise.resolve({
                id: job.id, ok: false,
                error: 'The Electrisim editor is not ready. Open or create a diagram and try again.'
            });
        }

        var captured = [];
        var original = console.error;
        console.error = function () {
            captured.push(Array.prototype.map.call(arguments, String).join(' '));
            return original.apply(console, arguments);
        };
        var restore = function () { console.error = original; };

        return Promise.resolve()
            .then(function () {
                return window.buildDiagramFromModelJson(graph, job.model, job.layout || 'auto');
            })
            .then(function (result) {
                restore();
                result = result || {};
                return {
                    id: job.id,
                    // Nothing drawn is a failure even if nothing threw.
                    ok: result.cellsAdded > 0,
                    cellsAdded: result.cellsAdded,
                    layout: result.layout,
                    unplaced: result.unplaced || [],
                    error: result.cellsAdded > 0 ? null : 'The import ran but drew nothing.',
                    errors: captured
                };
            }, function (err) {
                restore();
                return {
                    id: job.id, ok: false,
                    error: (err && err.message) || String(err),
                    errors: captured
                };
            });
    }

    function poll() {
        // Still poll when no diagram is open, so the bridge knows the page is
        // here, but say so: the diagram then stays queued instead of being drawn
        // into the placeholder graph and lost.
        fetch(base + '/next' + (diagramOpen() ? '' : '?ready=0'), { cache: 'no-store' })
            .then(function (resp) {
                if (!announced) {
                    announced = true;
                    console.log('✅ Electrisim MCP bridge connected at ' + base);
                }
                delay = POLL_MS;
                if (resp.status === 204) return null;
                if (!resp.ok) {
                    // Reachable but refusing - a misconfiguration worth saying once.
                    if (warnedStatus !== resp.status) {
                        warnedStatus = resp.status;
                        resp.json().then(function (b) {
                            console.warn('Electrisim MCP bridge refused this page (' + resp.status +
                                '): ' + ((b && b.error) || 'no reason given'));
                        }, function () {});
                    }
                    throw new Error('bridge answered ' + resp.status);
                }
                return resp.json();
            })
            .then(function (job) {
                if (!job) return null;
                return draw(job).then(ack);
            })
            .then(function () { schedule(delay); }, function () {
                // Bridge not running (no MCP server yet) - back off quietly.
                delay = Math.min(delay * 2, MAX_BACKOFF_MS);
                schedule(delay);
            });
    }

    // Let the editor and the import modules finish loading first.
    schedule(POLL_MS);
})();
