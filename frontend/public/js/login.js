// ============================================================
//  login.js - Lógica de inicio de sesión
// ============================================================

// Redirigir si ya está autenticado
if (AuthAPI.isLoggedIn()) {
  window.location.href = '/seats.html';
}

// Enter key en los campos
document.getElementById('username').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('password').focus();
});
document.getElementById('password').addEventListener('keydown', e => {
  if (e.key === 'Enter') handleLogin();
});

function showError(msg) {
  const box = document.getElementById('error-msg');
  document.getElementById('error-text').textContent = msg;
  box.classList.remove('hidden');
  box.style.animation = 'none';
  requestAnimationFrame(() => {
    box.style.animation = 'fadeDown .3s ease';
  });
}

function hideError() {
  document.getElementById('error-msg').classList.add('hidden');
}

function setLoading(isLoading) {
  const btn  = document.getElementById('login-btn');
  const text = btn.querySelector('.btn-text');
  const loader = btn.querySelector('.btn-loader');
  btn.disabled = isLoading;
  text.classList.toggle('hidden', isLoading);
  loader.classList.toggle('hidden', !isLoading);
}

async function handleLogin() {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  hideError();

  if (!username) { showError('Ingresa tu usuario o email'); return; }
  if (!password) { showError('Ingresa tu contraseña'); return; }

  setLoading(true);

  try {
    const data = await AuthAPI.login(username, password);
    AuthAPI.saveSession(data.token, data.user);

    // Animación antes de redirigir
    document.querySelector('.login-card').style.transform = 'scale(.98)';
    document.querySelector('.login-card').style.opacity = '.7';
    setTimeout(() => {
      window.location.href = '/seats.html';
    }, 300);

  } catch (err) {
    showError(err.message || 'Error al iniciar sesión');
    setLoading(false);
    // Shake animation
    const card = document.querySelector('.login-card');
    card.style.animation = 'none';
    requestAnimationFrame(() => {
      card.style.animation = 'shake .4s ease';
    });
  }
}

// Agregar keyframe de shake dinámicamente
const style = document.createElement('style');
style.textContent = `
  @keyframes shake {
    0%,100%{transform:translateX(0)}
    20%{transform:translateX(-8px)}
    40%{transform:translateX(8px)}
    60%{transform:translateX(-5px)}
    80%{transform:translateX(5px)}
  }
`;
document.head.appendChild(style);
