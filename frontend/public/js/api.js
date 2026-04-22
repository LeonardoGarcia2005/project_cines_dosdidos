// ============================================================
//  api.js - Cliente HTTP para el backend
//  Compartido entre login.js y seats.js
// ============================================================

const API_BASE = window.location.origin + '/api';

// Generar o recuperar el session ID de esta pestaña
function getSessionId() {
  let id = sessionStorage.getItem('sessionId');
  if (!id) {
    id = 'sess-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36);
    sessionStorage.setItem('sessionId', id);
  }
  return id;
}

// Headers comunes para todas las peticiones
function buildHeaders(includeAuth = true) {
  const headers = {
    'Content-Type': 'application/json',
    'x-session-id': getSessionId(),
  };
  if (includeAuth) {
    const token = localStorage.getItem('token');
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// ── Auth ────────────────────────────────────────────
const AuthAPI = {
  async login(username, password) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: buildHeaders(false),
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al iniciar sesión');
    return data;
  },

  async me() {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: buildHeaders(),
    });
    if (!res.ok) throw new Error('No autenticado');
    return res.json();
  },

  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/';
  },

  isLoggedIn() {
    return !!localStorage.getItem('token');
  },

  getUser() {
    try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
  },

  saveSession(token, user) {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
  }
};

// ── Seats ───────────────────────────────────────────
const SeatsAPI = {
  async getSeats(screeningId) {
    const res = await fetch(`${API_BASE}/seats/${screeningId}`, {
      headers: buildHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al cargar asientos');
    return data;
  },

  async holdSeat(screeningId, seatId) {
    const res = await fetch(`${API_BASE}/seats/${screeningId}/hold`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({ seatId }),
    });
    const data = await res.json();
    if (!res.ok) throw Object.assign(new Error(data.error), { code: data.code, status: res.status });
    return data;
  },

  async releaseSeat(screeningId, seatId) {
    const res = await fetch(`${API_BASE}/seats/${screeningId}/release`, {
      method: 'DELETE',
      headers: buildHeaders(),
      body: JSON.stringify({ seatId }),
    });
    return res.json();
  },

  async confirmReservation(screeningId, seatIds) {
    const res = await fetch(`${API_BASE}/seats/${screeningId}/confirm`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({ seatIds }),
    });
    const data = await res.json();
    if (!res.ok) throw Object.assign(new Error(data.error), { code: data.code });
    return data;
  },

  async getLogs(screeningId) {
    const res = await fetch(`${API_BASE}/seats/${screeningId}/logs`, {
      headers: buildHeaders(),
    });
    return res.json();
  }
};

// ── Backup ──────────────────────────────────────────
const BackupAPI = {
  async create() {
    const res = await fetch(`${API_BASE}/backup`, {
      method: 'POST',
      headers: buildHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al crear backup');
    return data;
  },

  async list() {
    const res = await fetch(`${API_BASE}/backups`, {
      headers: buildHeaders(),
    });
    return res.json();
  }
};
