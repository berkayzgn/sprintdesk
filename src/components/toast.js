const DEFAULT_DURATION_MS = 4200;

let host = null;

export function showToast(message, kind = 'info', ms = DEFAULT_DURATION_MS) {
  if (!host) {
    host = document.createElement('div');
    host.className = 'toast-host';
    host.setAttribute('role', 'status');
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => el.remove(), ms);
}
