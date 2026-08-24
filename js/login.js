// ============================================================
// Login por PIN — NO es autenticación real. Mismo criterio de
// seguridad que el resto del tablero: protegido por no compartir el
// link/anon key, no por login (cualquiera con conocimientos técnicos
// podría saltear esto leyendo el código). Sirve para saber QUIÉN está
// usando la sesión — sobre todo para que las Notas de Pedido queden
// con quién las autorizó (compras_notas_pedido.revisado_por).
//
// Se pide en CADA carga de página (no se persiste en localStorage a
// propósito, pedido del usuario) — por eso alcanza con guardar el
// usuario logueado en una variable de módulo: dura toda la sesión de
// la SPA (mientras no se recargue la página), que es exactamente lo
// que se pidió.
//
// Un perfil sin PIN todavía ("Crear PIN") deja que la propia persona
// lo defina la primera vez (se le pide dos veces para evitar typos) —
// así no hace falta que un admin precargue PINs a mano por SQL.
// ============================================================

let usuarioActual = null;

export function getUsuarioActual() {
  return usuarioActual;
}

function iniciales(nombre) {
  const [apellido, nombreProp] = String(nombre || '').split(',').map(s => s.trim());
  return ((apellido?.[0] || '') + (nombreProp?.[0] || '')).toUpperCase();
}

export async function mostrarLogin(SB, onOk) {
  const cont = document.getElementById('app-login');
  const box = document.getElementById('login-perfiles');
  const pinWrap = document.getElementById('login-pin-wrap');
  const pinLabel = document.getElementById('login-pin-label');
  const pinInput = document.getElementById('login-pin');
  const errEl = document.getElementById('login-error');
  const btnEntrar = document.getElementById('login-entrar');
  if (!cont || !box || !pinWrap || !pinLabel || !pinInput || !errEl || !btnEntrar) { onOk(); return; }

  const mostrarError = (msg) => {
    errEl.textContent = msg;
    errEl.style.display = msg ? 'block' : 'none';
  };

  const { data: usuarios, error } = await SB.from('compras_usuarios').select('*').eq('activo', true).order('nombre');
  if (error || !usuarios?.length) {
    mostrarError('No se pudo cargar la lista de usuarios' + (error ? `: ${error.message}` : ' (no hay ninguno activo todavía)') + '.');
    cont.style.display = 'flex';
    return;
  }

  let seleccionado = null;
  let modo = null;       // 'ENTRAR' (ya tiene PIN) | 'CREAR_1' | 'CREAR_2' (primera vez)
  let pinNuevo = null;   // candidato durante CREAR_1 → CREAR_2

  function pintarPerfiles() {
    box.innerHTML = usuarios.map(u => `
      <button type="button" class="login-perfil${seleccionado?.id === u.id ? ' sel' : ''}" data-id="${u.id}">
        <div class="login-avatar">${iniciales(u.nombre)}</div>
        <div class="login-nombre">${u.nombre}</div>
        ${u.pin ? '' : '<span class="login-badge">Crear PIN</span>'}
      </button>`).join('');
    box.querySelectorAll('.login-perfil').forEach(btn => {
      btn.addEventListener('click', () => elegirPerfil(usuarios.find(u => u.id === btn.dataset.id)));
    });
  }

  function elegirPerfil(u) {
    seleccionado = u;
    modo = u.pin ? 'ENTRAR' : 'CREAR_1';
    pinNuevo = null;
    mostrarError('');
    pinInput.value = '';
    pintarPerfiles();
    pinWrap.style.display = '';
    pinLabel.textContent = modo === 'ENTRAR' ? `PIN de ${u.nombre.split(',')[0]}` : 'Elegí un PIN de 4 dígitos';
    pinInput.focus();
  }

  async function confirmar() {
    const val = pinInput.value.trim();
    if (!/^\d{4}$/.test(val)) { mostrarError('El PIN tiene que ser de 4 dígitos.'); return; }

    if (modo === 'ENTRAR') {
      if (val !== seleccionado.pin) {
        mostrarError('PIN incorrecto.');
        pinInput.value = '';
        pinInput.focus();
        return;
      }
      usuarioActual = seleccionado;
      cont.style.display = 'none';
      onOk();
      return;
    }

    if (modo === 'CREAR_1') {
      pinNuevo = val;
      modo = 'CREAR_2';
      pinInput.value = '';
      pinLabel.textContent = 'Repetí el PIN para confirmarlo';
      mostrarError('');
      pinInput.focus();
      return;
    }

    if (modo === 'CREAR_2') {
      if (val !== pinNuevo) {
        mostrarError('No coincide con el PIN anterior — probá de nuevo.');
        modo = 'CREAR_1';
        pinNuevo = null;
        pinInput.value = '';
        pinLabel.textContent = 'Elegí un PIN de 4 dígitos';
        pinInput.focus();
        return;
      }
      const { data, error: upErr } = await SB.from('compras_usuarios').update({ pin: val }).eq('id', seleccionado.id).select().single();
      if (upErr) { mostrarError(upErr.message); return; }
      usuarioActual = data;
      cont.style.display = 'none';
      onOk();
    }
  }

  btnEntrar.onclick = confirmar;
  pinInput.onkeydown = (e) => { if (e.key === 'Enter') confirmar(); };

  pintarPerfiles();
  pinWrap.style.display = 'none';
  cont.style.display = 'flex';
}
