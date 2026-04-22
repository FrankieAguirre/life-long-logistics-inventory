const API_BASE = '/api';

let authToken = null;

export function setAuthToken(token) {
  authToken = token || null;
}

function buildHeaders(extra = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...extra,
  };

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  return headers;
}

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: options.method || 'GET',
    headers: buildHeaders(options.headers),
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await res.json() : null;

  if (!res.ok) {
    const message = payload?.error?.message || `Request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    err.code = payload?.error?.code || 'REQUEST_ERROR';
    err.details = payload?.error?.details || [];
    throw err;
  }

  return payload;
}

export const authApi = {
  login(username, password) {
    return request('/auth/login', {
      method: 'POST',
      body: { username, password },
    });
  },

  register(data) {
    return request('/auth/register', {
      method: 'POST',
      body: data,
    });
  },

  me() {
    return request('/auth/me');
  },
};

export const inventoryApi = {
  list(params = {}) {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.category) query.set('category', params.category);
    if (params.status) query.set('status', params.status);
    if (params.page) query.set('page', String(params.page));
    if (params.pageSize) query.set('pageSize', String(params.pageSize));
    const qs = query.toString();
    return request(`/inventory${qs ? `?${qs}` : ''}`, {
      signal: params.signal,
    });
  },

  summary() {
    return request('/inventory/summary');
  },

  create(item) {
    return request('/inventory', {
      method: 'POST',
      body: item,
    });
  },

  update(id, patch) {
    return request(`/inventory/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: patch,
    });
  },

  remove(id) {
    return request(`/inventory/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
};
