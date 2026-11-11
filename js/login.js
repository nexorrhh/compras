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

import { animateElement, revealElement } from './motion.js';

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

  const card = document.getElementById('login-card');
  const content = document.getElementById('login-content');
  const welcome = document.getElementById('login-welcome');
  const profilesStatus = document.getElementById('login-profiles-status');
  const app = document.getElementById('app');
  let seleccionado = null;
  let modo = null;       // 'ENTRAR' (ya tiene PIN) | 'CREAR_1' | 'CREAR_2' (primera vez)
  let pinNuevo = null;   // candidato durante CREAR_1 → CREAR_2
  let ocupado = false;
  let finalizado = false;

  const mostrarError = (msg) => {
    errEl.textContent = msg;
    errEl.style.display = msg ? 'block' : 'none';
    pinInput.setAttribute('aria-invalid', String(!!msg && !!seleccionado));
    if (msg) {
      revealElement(errEl, { distance: 4, duration: 180 });
      if (seleccionado) animateElement(pinInput, [
        { transform: 'translateX(0)' }, { transform: 'translateX(-5px)' },
        { transform: 'translateX(5px)' }, { transform: 'translateX(0)' },
      ], { duration: 240 });
    }
  };

  function actualizarControles() {
    btnEntrar.disabled = ocupado || !seleccionado;
    pinInput.disabled = ocupado;
    pinWrap.setAttribute('aria-busy', String(ocupado));
    box.querySelectorAll('.login-perfil').forEach(btn => { btn.disabled = ocupado; });
    btnEntrar.textContent = ocupado ? 'Ingresando…'
      : modo === 'CREAR_1' ? 'Continuar'
      : modo === 'CREAR_2' ? 'Crear PIN y entrar' : 'Entrar';
  }

  // La misma pantalla vuelve a usarse al cerrar sesión.
  usuarioActual = null;
  cont.classList.remove('login-opening');
  if (content) content.hidden = false;
  if (welcome) welcome.hidden = true;
  if (profilesStatus) profilesStatus.hidden = false;
  box.replaceChildren();
  pinInput.value = '';
  pinWrap.style.display = 'none';
  mostrarError('');
  actualizarControles();
  cont.style.display = 'flex';
  revealElement(card, { distance: 14, duration: 420 });

  let usuarios;
  try {
    const { data, error } = await SB.from('compras_usuarios').select('*').eq('activo', true).order('nombre');
    if (error) throw error;
    if (!data?.length) throw new Error('No hay usuarios activos todavía.');
    usuarios = data;
  } catch (error) {
    mostrarError('No se pudo cargar la lista de usuarios. ' + error.message);
    return;
  } finally {
    if (profilesStatus) profilesStatus.hidden = true;
  }

  function pintarPerfiles() {
    box.replaceChildren(...usuarios.map(u => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'login-perfil';
      btn.dataset.id = u.id;
      btn.setAttribute('aria-pressed', 'false');
      btn.setAttribute('aria-controls', 'login-pin-wrap');
      const avatar = document.createElement('div');
      avatar.className = 'login-avatar';
      avatar.textContent = iniciales(u.nombre);
      const nombre = document.createElement('div');
      nombre.className = 'login-nombre';
      nombre.textContent = u.nombre;
      btn.append(avatar, nombre);
      if (!u.pin) {
        const badge = document.createElement('span');
        badge.className = 'login-badge';
        badge.textContent = 'Crear PIN';
        btn.append(badge);
      }
      btn.addEventListener('click', () => elegirPerfil(u));
      return btn;
    }));
    box.querySelectorAll('.login-perfil').forEach((btn, index) => {
      animateElement(btn, [
        { opacity: 0, transform: 'translateY(10px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ], { duration: 360, delay: Math.min(index, 7) * 55, fill: 'backwards' });
    });
  }

  function elegirPerfil(u) {
    if (ocupado || finalizado) return;
    const alturaAnterior = card?.getBoundingClientRect().height;
    card?.getAnimations?.().forEach(animation => animation.cancel());
    seleccionado = u;
    modo = u.pin ? 'ENTRAR' : 'CREAR_1';
    pinNuevo = null;
    mostrarError('');
    pinInput.value = '';
    box.querySelectorAll('.login-perfil').forEach(btn => {
      const selected = btn.dataset.id === String(u.id);
      btn.classList.toggle('sel', selected);
      btn.setAttribute('aria-pressed', String(selected));
    });
    pinWrap.style.display = '';
    pinLabel.textContent = modo === 'ENTRAR' ? `PIN de ${u.nombre.split(',')[0]}` : 'Elegí un PIN de 4 dígitos';
    pinInput.autocomplete = modo === 'ENTRAR' ? 'current-password' : 'new-password';
    actualizarControles();
    if (card) animateElement(card, [
      { height: `${alturaAnterior}px` }, { height: `${card.getBoundingClientRect().height}px` },
    ], { duration: 280 });
    pinInput.focus({ preventScroll: true });
    revealElement(pinWrap, { distance: 10, duration: 280 });
  }

  async function completarIngreso(usuario) {
    usuarioActual = usuario;
    if (app) {
      app.inert = true;
      app.setAttribute('aria-hidden', 'true');
    }
    pinInput.value = '';
    pinNuevo = null;
    mostrarError('');
    cont.classList.add('login-opening');
    await animateElement(content, [{ opacity: 1 }, { opacity: 0 }], { duration: 160 });
    if (content && welcome) {
      const alturaAnterior = card?.getBoundingClientRect().height;
      card?.getAnimations?.().forEach(animation => animation.cancel());
      const nombre = usuario.nombre.split(',').pop().trim();
      document.getElementById('login-welcome-title').textContent = `¡Bienvenido, ${nombre}!`;
      document.getElementById('login-welcome-avatar').textContent = iniciales(usuario.nombre);
      document.getElementById('login-welcome-status').textContent = 'Cargando tu tablero…';
      content.hidden = true;
      welcome.hidden = false;
      welcome.focus({ preventScroll: true });
      if (card) animateElement(card, [
        { height: `${alturaAnterior}px` }, { height: `${card.getBoundingClientRect().height}px` },
      ], { duration: 320 });
      await revealElement(welcome, { distance: 12, duration: 320 });
    }

    // La bienvenida permanece visible mientras se prepara la aplicación.
    await Promise.all([
      new Promise(resolve => setTimeout(resolve, 1150)),
      Promise.resolve().then(() => onOk()),
    ]);
    await animateElement(cont, [{ opacity: 1 }, { opacity: 0 }], { duration: 240 });
    cont.style.display = 'none';
    cont.classList.remove('login-opening');
    finalizado = true;
    if (app) {
      app.inert = false;
      app.removeAttribute('aria-hidden');
    }
    revealElement(app, { distance: 6, duration: 320 });
    document.getElementById('main-content')?.focus({ preventScroll: true });
  }

  async function confirmar() {
    if (!seleccionado || ocupado || finalizado) return;
    const val = pinInput.value.trim();
    if (!/^\d{4}$/.test(val)) { mostrarError('El PIN tiene que ser de 4 dígitos.'); return; }

    if (modo === 'ENTRAR') {
      if (val !== seleccionado.pin) {
        mostrarError('PIN incorrecto.');
        pinInput.value = '';
        pinInput.focus();
        return;
      }
    }

    if (modo === 'CREAR_1') {
      pinNuevo = val;
      modo = 'CREAR_2';
      pinInput.value = '';
      pinLabel.textContent = 'Repetí el PIN para confirmarlo';
      mostrarError('');
      actualizarControles();
      pinInput.focus();
      revealElement(pinWrap, { distance: 5, duration: 200 });
      return;
    }

    if (modo === 'CREAR_2') {
      if (val !== pinNuevo) {
        mostrarError('No coincide con el PIN anterior — probá de nuevo.');
        modo = 'CREAR_1';
        pinNuevo = null;
        pinInput.value = '';
        pinLabel.textContent = 'Elegí un PIN de 4 dígitos';
        actualizarControles();
        pinInput.focus();
        return;
      }
    }

    ocupado = true;
    actualizarControles();
    try {
      if (modo === 'CREAR_2') {
        btnEntrar.textContent = 'Guardando PIN…';
        const { data, error } = await SB.from('compras_usuarios').update({ pin: val }).eq('id', seleccionado.id).select().single();
        if (error) throw error;
        Object.assign(seleccionado, data);
        modo = 'ENTRAR';
      }
      await completarIngreso(seleccionado);
    } catch (error) {
      usuarioActual = null;
      if (app) {
        app.style.display = 'none';
        app.inert = false;
        app.removeAttribute('aria-hidden');
      }
      if (content) content.hidden = false;
      if (welcome) welcome.hidden = true;
      cont.classList.remove('login-opening');
      mostrarError('No se pudo completar el ingreso. ' + error.message);
    } finally {
      if (!finalizado) {
        ocupado = false;
        actualizarControles();
        pinInput.focus();
      }
    }
  }

  btnEntrar.onclick = confirmar;
  pinInput.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      return confirmar();
    }
  };
  pinInput.oninput = () => mostrarError('');

  pintarPerfiles();
}
