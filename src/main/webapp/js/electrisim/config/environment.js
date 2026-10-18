const LOCAL_BACKEND_URL = 'http://127.0.0.1:5000';
const TUNNEL_BACKEND_URL = 'https://03dht3kc-5000.euw.devtunnels.ms';

function isLoopbackHost(host) {
    const h = String(host || '').toLowerCase();
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1';
}

function pageIsHttps() {
    try {
        return String(window.location.protocol || '').toLowerCase() === 'https:';
    } catch (_) {
        return false;
    }
}

function resolveDevBackendUrl() {
    let q = '';
    let stored = '';
    try {
        const params = new URLSearchParams(window.location.search);
        q = String(params.get('backend') || '').toLowerCase();
        stored = String(localStorage.getItem('electrisimBackend') || '').toLowerCase();
    } catch (_) { /* ignore */ }

    if (q === 'tunnel') return TUNNEL_BACKEND_URL;
    if (q === 'local' || q === 'localhost') return LOCAL_BACKEND_URL;

    const host = String(window.location.hostname || '');

    // Sticky localStorage 'tunnel' breaks local live-server whenever the
    // Dev Tunnel is down. Honor it only on HTTPS pages (mixed content blocks
    // http://127.0.0.1). On HTTP / loopback, drop the stale flag.
    if (stored === 'tunnel') {
        if (pageIsHttps() && !isLoopbackHost(host)) return TUNNEL_BACKEND_URL;
        try { localStorage.removeItem('electrisimBackend'); } catch (_) { /* ignore */ }
        console.warn('Cleared localStorage.electrisimBackend=tunnel; using local Flask at', LOCAL_BACKEND_URL);
    }
    if (stored === 'local' || stored === 'localhost') return LOCAL_BACKEND_URL;

    if (isLoopbackHost(host) || !pageIsHttps()) return LOCAL_BACKEND_URL;
    return TUNNEL_BACKEND_URL;
}

function stripSlash(url) {
    return String(url || '').replace(/\/+$/, '');
}

export function getBackendUrlCandidates() {
    const primary = stripSlash((typeof window !== 'undefined' && window.ENV?.backendUrl) || LOCAL_BACKEND_URL);
    const out = [primary];
    if (!pageIsHttps() && primary !== LOCAL_BACKEND_URL) out.push(LOCAL_BACKEND_URL);
    return out;
}

const config = {
    development: {
      // Local live-server talks straight to Flask so python app.py shows
      // request logs. Override: ?backend=tunnel or ?backend=local
      backendUrl: resolveDevBackendUrl(),
      isDevelopment: true
    },
    production: {
      // Backend simulation API (custom domain for sim service)
      backendUrl: 'https://sim.electrisim.com',
      isDevelopment: false
    }
  };
  
  // Auto-detect environment based on hostname
  const env = window.location.hostname === 'app.electrisim.com' ? 'production' : 'development';
const currentConfig = config[env];


window.ENV = currentConfig;
window.getBackendUrlCandidates = getBackendUrlCandidates;
console.log('Current environment:', env);
console.log('Using backend URL:', currentConfig.backendUrl);


export default currentConfig;
