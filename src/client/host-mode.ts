const STORAGE_KEY = 'pdd-host-mode';

// Since the spec rules out auth beyond callsign sign-in, "host mode" is a
// non-cryptographic, per-browser capability: physical access to the server
// machine (localhost) implies host, or a browser that's visited the URL
// with ?host=1 once (persisted thereafter). Trusted-LAN philosophy -- not a
// real access-control boundary.
export function isHostMode(): boolean {
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return true;

  const params = new URLSearchParams(location.search);
  if (params.get('host') === '1') {
    localStorage.setItem(STORAGE_KEY, '1');
  }
  return localStorage.getItem(STORAGE_KEY) === '1';
}
