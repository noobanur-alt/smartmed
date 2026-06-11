// ── SmartMed Auth Helper ──
// Include this in every page: <script src="auth.js"></script>

function logout() {
  localStorage.removeItem('smartmed_token');
  localStorage.removeItem('smartmed_user');
  window.location = 'index.html';
}

// Auto-logout when token expires (on any API 401 response)
async function smartFetch(url, options = {}) {
  const token = localStorage.getItem('smartmed_token');
  if (token) {
    options.headers = options.headers || {};
    options.headers['Authorization'] = `Bearer ${token}`;
    options.headers['Content-Type'] = options.headers['Content-Type'] || 'application/json';
  }
  const res = await fetch(url, options);
  if (res.status === 401) {
    alert('Session expired. Please login again.');
    logout();
    return null;
  }
  return res;
}