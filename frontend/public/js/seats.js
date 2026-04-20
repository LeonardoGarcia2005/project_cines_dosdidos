// ============================================================
//  seats.js - Lógica de selección de asientos
//  Manejo de concurrencia, holds y confirmación
// ============================================================

const SCREENING_ID = 1;
const ROWS         = ['M','L','K','J','I','H','G','F','E','D','C','B','A']; 

// Map UI column to DB column (UI 8-27 → DB 9-28, UI 1-7 → DB 1-7)
function uiColToDbCol(uiCol) {
  if (uiCol <= 7) return uiCol;
  return uiCol + 1; // UI 8 → DB 9, UI 27 → DB 28
}

// Map DB column to UI column (inverse)
function dbColToUiCol(dbCol) {
  if (dbCol <= 7) return dbCol;
  return dbCol - 1; // DB 9 → UI 8, DB 28 → UI 27
}

// Estado local
let seatsData   = [];   // todos los asientos del backend
let selectedIds = [];   // IDs en hold del usuario actual
let holdTimerInterval = null;
let holdExpiresAt     = null;
let pollInterval      = null;

// ── Inicialización ──────────────────────────────────
(async function init() {
  // Verificar autenticación
  if (!AuthAPI.isLoggedIn()) {
    window.location.href = '/';
    return;
  }

  const user = AuthAPI.getUser();
  if (user) document.getElementById('username-display').textContent = user.username;

  await loadSeats();
  await loadLogs();

  // Polling cada 4 segundos para refrescar estado
  pollInterval = setInterval(async () => {
    await loadSeats(false); // silencioso, sin re-render completo si no cambia
    await loadLogs();
  }, 4000);
})();

// ── Cargar asientos del backend ─────────────────────
async function loadSeats(fullRender = true) {
  try {
    const data = await SeatsAPI.getSeats(SCREENING_ID);
    seatsData = data.seats;

    if (data.screening && fullRender) {
      document.getElementById('movie-title').textContent = data.screening.title;
      const d = data.screening;
      const dt = new Date(d.starts_at).toLocaleString('es-VE', {
        weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
      });
      document.getElementById('movie-meta').textContent =
        `${d.room} · ${dt} · ${d.duration} min · ${d.rating}`;
    }

    updateStats(data.stats);
    renderGrid(fullRender);
    syncSelectedList();

    // Detectar si alguno de mis holds expiró
    const myHolds = seatsData.filter(s => s.is_mine);
    const expiredMySeats = selectedIds.filter(id => {
      const seat = seatsData.find(s => s.id === id);
      return !seat || !seat.is_mine;
    });
    if (expiredMySeats.length > 0) {
      selectedIds = selectedIds.filter(id => !expiredMySeats.includes(id));
      showToast('warning', '⚠️ Hold expirado', 'Uno o más asientos fueron liberados automáticamente.');
      syncSelectedList();
    }

  } catch (err) {
    if (err.message === 'No autenticado' || err.message?.includes('Token')) {
      AuthAPI.logout();
    }
    console.error('[loadSeats]', err);
  }
}

// ── Render de la cuadrícula ─────────────────────────
function renderGrid(fullRender) {
  const grid = document.getElementById('seats-grid');

  // Si ya existe la grilla, solo actualizamos clases
  if (!fullRender && grid.querySelector('.seat-row')) {
    seatsData.forEach(s => {
      const el = document.getElementById(`seat-${s.id}`);
      if (!el) return;
      const cls = getSeatClass(s);
      el.className = `seat ${cls}`;
      el.title = getSeatTitle(s);
    });
    return;
  }

  // Render completo
  grid.innerHTML = '';

  // Números de columna: 7 izq + pasillo + 20 der
  const colNums = document.getElementById('col-numbers');
  colNums.innerHTML = '';
  // Spacer para la etiqueta de fila
  const spacer = document.createElement('div');
  spacer.style.flexShrink = '0';
  colNums.appendChild(spacer);

  // Izquierda: columnas 1-7
  for (let c = 1; c <= 7; c++) {
    const num = document.createElement('div');
    num.className = 'col-num';
    num.textContent = c;
    colNums.appendChild(num);
  }
  // Pasillo
  const aisleNum = document.createElement('div');
  aisleNum.style.width = '30px'; aisleNum.style.flexShrink = '0';
  colNums.appendChild(aisleNum);
  // Derecha: columnas 8-27
  for (let c = 8; c <= 27; c++) {
    const num = document.createElement('div');
    num.className = 'col-num';
    num.textContent = c;
    colNums.appendChild(num);
  }

  // Filas de asientos
  ROWS.forEach(row => {
    const rowEl = document.createElement('div');
    rowEl.className = 'seat-row';

    // Etiqueta de fila
    const label = document.createElement('div');
    label.className = 'row-label';
    label.textContent = row;
    rowEl.appendChild(label);

    // Izquierda: columnas UI 1-7 → DB 1-7
    for (let uiCol = 1; uiCol <= 7; uiCol++) {
      const seat = seatsData.find(s => s.row_letter === row && s.col_number === uiCol);
      if (!seat) {
        const empty = document.createElement('div');
        empty.style.width = '24px'; empty.style.flexShrink = '0';
        rowEl.appendChild(empty);
        continue;
      }
      const el = document.createElement('div');
      el.id = `seat-${seat.id}`;
      el.className = `seat ${getSeatClass(seat)}`;
      el.title = getSeatTitle(seat);
      el.dataset.id = seat.id;
      el.addEventListener('click', () => handleSeatClick(seat.id));
      rowEl.appendChild(el);
    }

    // Pasillo central
    const gap = document.createElement('div');
    gap.className = 'aisle-gap';
    rowEl.appendChild(gap);

    // Derecha: columnas UI 8-27 → DB 9-28
    for (let uiCol = 8; uiCol <= 27; uiCol++) {
      const dbCol = uiColToDbCol(uiCol);
      const seat = seatsData.find(s => s.row_letter === row && s.col_number === dbCol);
      if (!seat) {
        const empty = document.createElement('div');
        empty.style.width = '24px'; empty.style.flexShrink = '0';
        rowEl.appendChild(empty);
        continue;
      }
      const el = document.createElement('div');
      el.id = `seat-${seat.id}`;
      el.className = `seat ${getSeatClass(seat)}`;
      el.title = getSeatTitle(seat);
      el.dataset.id = seat.id;
      el.addEventListener('click', () => handleSeatClick(seat.id));
      rowEl.appendChild(el);
    }

    grid.appendChild(rowEl);
  });
}

function getSeatClass(seat) {
  const isHandicap = seat.seat_type === 'handicap';
  if (seat.is_mine)              return `mine${isHandicap ? ' handicap' : ''}`;
  if (seat.status === 'reserved') return `reserved${isHandicap ? ' handicap' : ''} disabled`;
  if (seat.status === 'held')    return `held-other${isHandicap ? ' handicap' : ''} disabled`;
  if (seat.status === 'available') return `available${isHandicap ? ' handicap' : ''}`;
  return 'disabled';
}

function getSeatTitle(seat) {
  const uiCol = dbColToUiCol(seat.col_number);
  const label = `${seat.row_letter}${uiCol}`;
  if (seat.is_mine)               return `${label} - Tu selección`;
  if (seat.status === 'reserved') return `${label} - Reservado`;
  if (seat.status === 'held')     return `${label} - En selección por otro usuario`;
  return `${label} - Disponible`;
}

// ── Click en asiento ────────────────────────────────
async function handleSeatClick(seatId) {
  const seat = seatsData.find(s => s.id === seatId);
  if (!seat) return;

  // Si ya es mío → deseleccionar
  if (seat.is_mine) {
    await releaseSeat(seatId);
    return;
  }

  // Si no está disponible → ignorar
  if (seat.status !== 'available') return;

  // Intentar hold
  await holdSeat(seatId);
}

async function holdSeat(seatId) {
  const seat = seatsData.find(s => s.id === seatId);
  const label = seat ? `${seat.row_letter}${seat.col_number}` : `#${seatId}`;

  try {
    const result = await SeatsAPI.holdSeat(SCREENING_ID, seatId);

    if (!selectedIds.includes(seatId)) {
      selectedIds.push(seatId);
    }

    // Calcular cuándo expira
    const expiresIn = result.expiresIn || 60;
    holdExpiresAt = Date.now() + expiresIn * 1000;
    startHoldTimer();

    await loadSeats(false);
    syncSelectedList();

    showToast('success', '✅ Asiento seleccionado', `Asiento ${label} reservado temporalmente por ${expiresIn}s`);

  } catch (err) {
    await loadSeats(false); // Refrescar para ver el estado real

    if (err.code === 'ALREADY_RESERVED') {
      showToast('error', '❌ Asiento ocupado', err.message);
    } else if (err.code === 'HELD_BY_OTHER') {
      showToast('warning', '⚠️ Conflicto de concurrencia', err.message);
    } else {
      showToast('error', '❌ Error', err.message);
    }
  }
}

async function releaseSeat(seatId) {
  const seat = seatsData.find(s => s.id === seatId);
  const label = seat ? `${seat.row_letter}${seat.col_number}` : `#${seatId}`;

  try {
    await SeatsAPI.releaseSeat(SCREENING_ID, seatId);
    selectedIds = selectedIds.filter(id => id !== seatId);
    await loadSeats(false);
    syncSelectedList();

    if (selectedIds.length === 0) stopHoldTimer();

    showToast('info', 'ℹ️ Asiento liberado', `Asiento ${label} deseleccionado`);
  } catch (err) {
    console.error('[releaseSeat]', err);
  }
}

// ── Confirmar reserva ───────────────────────────────
async function confirmReservation() {
  if (selectedIds.length === 0) return;

  const btn = document.getElementById('confirm-btn');
  btn.disabled = true;
  btn.textContent = 'Procesando...';

  try {
    const result = await SeatsAPI.confirmReservation(SCREENING_ID, selectedIds);

    selectedIds = [];
    stopHoldTimer();
    syncSelectedList();

    await loadSeats(false);
    await loadLogs();

    showToast('success', '🎉 ¡Reserva confirmada!', result.message);

  } catch (err) {
    showToast('error', '❌ Error al confirmar', err.message);
    await loadSeats(false);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      Confirmar reserva
    `;
  }
}

// ── Sincronizar lista lateral ───────────────────────
function syncSelectedList() {
  const list   = document.getElementById('selected-list');
  const btn    = document.getElementById('confirm-btn');
  const timer  = document.getElementById('hold-timer-wrap');

  const mySeats = seatsData.filter(s => s.is_mine);
  // Actualizar selectedIds para que coincida con el servidor
  selectedIds = mySeats.map(s => s.id);

  if (mySeats.length === 0) {
    list.innerHTML = `
      <div class="empty-selection">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/>
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
        </svg>
        <p>Haz clic en un asiento<br>para seleccionarlo</p>
      </div>`;
    btn.classList.add('hidden');
    timer.classList.add('hidden');
    return;
  }

  list.innerHTML = mySeats.map(s => `
    <div class="selected-seat-item">
      <span class="seat-label-badge">
        Fila ${s.row_letter} · Asiento ${s.col_number}
        ${s.seat_type === 'handicap' ? ' ♿' : ''}
      </span>
      <button class="btn-remove-seat" onclick="releaseSeat(${s.id})" title="Liberar">×</button>
    </div>
  `).join('');

  btn.classList.remove('hidden');
  timer.classList.remove('hidden');
}

// ── Stats ───────────────────────────────────────────
function updateStats(stats) {
  document.getElementById('stat-available').textContent = stats.available;
  document.getElementById('stat-held').textContent      = stats.held;
  document.getElementById('stat-reserved').textContent  = stats.reserved;

  const myCount = seatsData.filter(s => s.is_mine).length;
  const mineWrap = document.getElementById('stat-mine-wrap');
  document.getElementById('stat-mine').textContent = myCount;
  mineWrap.style.display = myCount > 0 ? 'flex' : 'none';
}

// ── Hold timer ──────────────────────────────────────
function startHoldTimer() {
  if (holdTimerInterval) clearInterval(holdTimerInterval);

  holdTimerInterval = setInterval(() => {
    if (!holdExpiresAt) return;
    const remaining = Math.max(0, Math.ceil((holdExpiresAt - Date.now()) / 1000));
    const el = document.getElementById('hold-timer');
    if (el) el.textContent = remaining + 's';

    if (remaining <= 0) {
      stopHoldTimer();
      loadSeats(false);
    }
  }, 1000);
}

function stopHoldTimer() {
  if (holdTimerInterval) clearInterval(holdTimerInterval);
  holdTimerInterval = null;
  holdExpiresAt     = null;
}

// ── Transaction logs ────────────────────────────────
async function loadLogs() {
  try {
    const data = await SeatsAPI.getLogs(SCREENING_ID);
    renderLogs(data.logs || []);
  } catch {}
}

function renderLogs(logs) {
  const container = document.getElementById('logs-container');
  if (!logs.length) {
    container.innerHTML = '<div class="log-empty">Sin actividad reciente</div>';
    return;
  }

  const actionIcon = { held: '🔒', reserved: '✅', released: '🔓', conflict: '⚠️', expired: '⏱️' };

  container.innerHTML = logs.map(l => {
    const time = new Date(l.created_at).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return `
      <div class="log-entry ${l.action}">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
          <span class="log-action">${actionIcon[l.action] || '•'} ${l.action}</span>
          <span class="log-seat">${l.seat_label}</span>
          <span class="log-time" style="margin-left:auto">${time}</span>
        </div>
        <div><span class="log-user">${l.username}</span> · ${l.detail}</div>
      </div>`;
  }).join('');
}

// ── Toast notifications ─────────────────────────────
let toastTimeout;
function showToast(type, title, msg) {
  const toast = document.getElementById('toast');
  document.getElementById('toast-title').textContent = title;
  document.getElementById('toast-msg').textContent   = msg;

  toast.className = `toast ${type}`;
  toast.classList.remove('hidden');

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.add('hidden'), 5000);
}

// ── Utils ───────────────────────────────────────────
function logout() {
  if (pollInterval) clearInterval(pollInterval);
  stopHoldTimer();
  AuthAPI.logout();
}

function openSecondTab() {
  window.open(window.location.href, '_blank');
}
