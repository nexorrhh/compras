// ============================================================
// Tablero de Compras — CIMOMET / CO.MO.ING
// Punto de entrada: conexión a Supabase, navegación y ciclo de
// vida de cada módulo (por ahora solo Flota está implementado;
// el resto de secciones del CLAUDE.md quedan como placeholder).
// ============================================================
import { initSupabaseConnection, SB } from './supabase-client.js';
import { om, cm } from './utils.js';
import { getUsuarioActual, mostrarLogin } from './login.js';
import { initInteractionMotion, setDisclosure } from './motion.js';

import * as dashboard from './modules/flota-dashboard.js';
import * as vehiculos from './modules/flota-vehiculos.js';
import * as solicitudes from './modules/flota-solicitudes.js';
import * as movimientos from './modules/flota-movimientos.js';
import * as gantt from './modules/flota-gantt.js';
import * as mantenimiento from './modules/flota-mantenimiento.js';
import * as vtv from './modules/flota-vtv.js';
import * as documentos from './modules/flota-documentos.js';
import * as oc from './modules/oc.js';
import * as stock from './modules/stock.js';
import * as proveedores from './modules/proveedores.js';
import * as notasPedido from './modules/notas-pedido.js';
import * as cotizaciones from './modules/cotizaciones.js';
import * as materot from './modules/materot.js';
import * as consolidado from './modules/consolidado.js';
import * as parametrizacion from './modules/parametrizacion.js';
import * as dolar from './modules/dolar.js';

const MODULES = {
  dash: dashboard, vcs: vehiculos, sols: solicitudes, movs: movimientos, gantt, mant: mantenimiento, vtv, doc: documentos,
  'oc-dash': oc, 'oc-abiertas': oc, 'oc-comp': oc, 'oc-todas': oc,
  'stock-dash': stock, 'stock-comprar': stock, 'stock-segui': stock, 'stock-todo': stock,
  'prov-grupos': proveedores, 'prov-directorio': proveedores, 'prov-pendientes': proveedores,
  'np-lista': notasPedido,
  'cot-lista': cotizaciones,
  'cot-pendientes': cotizaciones,
  'cot-historial': cotizaciones,
  'materot-dash': materot, 'materot-cards': materot, 'materot-grupos': materot,
  'consol-dash': consolidado, 'consol-semanas': consolidado,
  'param-usuarios': parametrizacion,
  'param-dolar': dolar,
};

const mobileNavigation = window.matchMedia('(max-width: 900px)');

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let navigationSequence = 0;
let navigationAnimation = null;
let appEntranceAnimation = null;

reducedMotion.addEventListener?.('change', () => {
  if (!reducedMotion.matches) return;
  navigationAnimation?.cancel();
  appEntranceAnimation?.cancel();
});

function fadeAppIn() {
  appEntranceAnimation?.cancel();
  const app = document.getElementById('app');
  if (!app || reducedMotion.matches || typeof app.animate !== 'function') return;
  const animation = app.animate([{ opacity: 0 }, { opacity: 1 }], {
    duration: 180,
    easing: 'cubic-bezier(.23, 1, .32, 1)',
  });
  appEntranceAnimation = animation;
  animation.finished.catch(() => {}).finally(() => {
    if (appEntranceAnimation === animation) appEntranceAnimation = null;
  });
}

function syncWorkspaceShortcuts() {
  const shortcuts = [...document.querySelectorAll('[data-shortcut][data-shortcut-group]')];
  shortcuts.forEach(shortcut => {
    const group = document.getElementById('nav-' + shortcut.dataset.shortcutGroup);
    shortcut.hidden = !group || group.hidden || group.style.display === 'none';
  });
  const section = document.getElementById('workspace-shortcuts');
  if (section) section.hidden = !shortcuts.some(shortcut => !shortcut.hidden);
}

function syncNavAccessibility({ animate = true } = {}) {
  document.querySelectorAll('.nav-group').forEach(group => {
    const parent = group.querySelector('.nav-parent');
    const children = group.querySelector('.nav-children');
    if (!parent || !children) return;
    if (!children.id) children.id = `${group.id}-children`;
    parent.setAttribute('aria-controls', children.id);
    setDisclosure(children, !group.classList.contains('collapsed'), { trigger: parent, display: 'block', animate });
  });
}

function setNavOpen(open, { returnFocus = false, focusFirst = false } = {}) {
  const isOpen = open && mobileNavigation.matches;
  const nav = document.getElementById('app-nav');
  const toggle = document.getElementById('menu-toggle');
  const backdrop = document.getElementById('nav-backdrop');
  document.body.classList.toggle('nav-open', isOpen);
  if (backdrop) backdrop.hidden = !isOpen;
  toggle?.setAttribute('aria-expanded', String(isOpen));
  toggle?.setAttribute('aria-label', isOpen ? 'Cerrar navegación' : 'Abrir navegación');
  if (nav) nav.inert = mobileNavigation.matches && !isOpen;
  const main = document.getElementById('main-content');
  if (main) main.inert = isOpen;

  if (isOpen && focusFirst) {
    const first = [...(nav?.querySelectorAll('button, a[href], [tabindex="0"]') || [])]
      .find(el => !el.disabled && el.getClientRects().length > 0);
    first?.focus();
  } else if (!isOpen && returnFocus) {
    toggle?.focus();
  }
}

async function go(secId, { closeDrawer = false, transition = true } = {}) {
  const next = document.getElementById('s-' + secId);
  if (!next) return;
  const sequence = ++navigationSequence;
  const previous = document.querySelector('.sec.on');
  const main = document.getElementById('main-content');
  const drawerWasOpen = closeDrawer && document.body.classList.contains('nav-open');
  const focusContent = drawerWasOpen || previous?.contains(document.activeElement);
  navigationAnimation?.cancel();
  navigationAnimation = null;

  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.remove('active');
    n.removeAttribute('aria-current');
  });
  const navItem = document.querySelector(`.nav-item[data-sec="${secId}"]`);
  navItem?.classList.add('active');
  navItem?.setAttribute('aria-current', 'page');

  // Solo el módulo activo despliega sus opciones. Inicio deja el índice compacto.
  const activeGroup = navItem?.closest('.nav-group');
  document.querySelectorAll('.nav-group').forEach(g => g.classList.toggle('collapsed', g !== activeGroup));
  syncNavAccessibility({ animate: transition });

  const context = document.getElementById('page-context');
  const groupLabel = activeGroup?.querySelector('.nav-parent')?.cloneNode(true);
  groupLabel?.querySelectorAll('svg, [aria-hidden="true"], .nav-chevron').forEach(el => el.remove());
  if (context) context.textContent = secId === 'inicio' ? 'Inicio' : groupLabel?.textContent.trim() || 'Compras';
  if (drawerWasOpen) setNavOpen(false);

  const changingSection = previous !== next;
  const canAnimate = transition && !reducedMotion.matches && typeof next.animate === 'function';
  if (changingSection && previous && canAnimate && typeof previous.animate === 'function') {
    main?.setAttribute('aria-busy', 'true');
    const exit = previous.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 90,
      easing: 'ease-out',
      fill: 'forwards',
    });
    navigationAnimation = exit;
    await exit.finished.catch(() => {});
    if (sequence !== navigationSequence) return;
    exit.cancel();
    navigationAnimation = null;
  }
  if (sequence !== navigationSequence) return;

  document.querySelectorAll('.sec').forEach(s => s.classList.remove('on'));
  next.classList.add('on');
  main?.removeAttribute('aria-busy');
  if (changingSection && main) main.scrollTop = 0;
  if (focusContent) main?.focus({ preventScroll: true });

  // Las consultas del módulo continúan con su ciclo habitual; la transición
  // no espera la red ni vuelve a solicitar datos para la pantalla de Inicio.
  try {
    const render = MODULES[secId]?.render?.(secId);
    render?.catch?.(error => console.error('No se pudo cargar la sección:', error));
  } catch (error) {
    console.error('No se pudo cargar la sección:', error);
  }

  if (changingSection && canAnimate && !reducedMotion.matches) {
    const entrance = next.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], {
      duration: 220,
      easing: 'cubic-bezier(.23, 1, .32, 1)',
    });
    navigationAnimation = entrance;
    entrance.finished.catch(() => {}).finally(() => {
      if (navigationAnimation === entrance) navigationAnimation = null;
    });
  }
}

function wireNav() {
  document.querySelectorAll('.nav-item[data-sec]').forEach(el => {
    el.addEventListener('click', () => go(el.dataset.sec, { closeDrawer: true }));
  });

  document.querySelectorAll('.nav-group').forEach(group => {
    group.querySelector('.nav-parent')?.addEventListener('click', () => {
      const wasCollapsed = group.classList.contains('collapsed');
      group.classList.toggle('collapsed');
      const defaultSec = group.dataset.defaultSec;
      if (wasCollapsed && defaultSec) go(defaultSec);
      else syncNavAccessibility();
    });
  });

  document.querySelectorAll('[data-shortcut][data-shortcut-group]').forEach(shortcut => {
    shortcut.addEventListener('click', () => {
      const group = document.getElementById('nav-' + shortcut.dataset.shortcutGroup);
      if (shortcut.hidden || !group || group.hidden || group.style.display === 'none') return;
      group.querySelector(`.nav-item[data-sec="${shortcut.dataset.shortcut}"]`)?.click();
    });
  });

  document.getElementById('menu-toggle')?.addEventListener('click', () => {
    setNavOpen(!document.body.classList.contains('nav-open'), { focusFirst: true });
  });
  document.getElementById('nav-backdrop')?.addEventListener('click', () => {
    setNavOpen(false, { returnFocus: true });
  });
  document.addEventListener('keydown', event => {
    if (!document.body.classList.contains('nav-open')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      setNavOpen(false, { returnFocus: true });
      return;
    }
    if (event.key !== 'Tab') return;

    const toggle = document.getElementById('menu-toggle');
    const nav = document.getElementById('app-nav');
    const focusable = [toggle, ...(nav?.querySelectorAll('button, a[href], [tabindex="0"]') || [])]
      .filter(el => el && !el.disabled && el.getClientRects().length > 0);
    if (!focusable.length) return;
    const index = focusable.indexOf(document.activeElement);
    const nextIndex = index === -1
      ? (event.shiftKey ? focusable.length - 1 : 0)
      : (index + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length;
    event.preventDefault();
    focusable[nextIndex].focus();
  });
  mobileNavigation.addEventListener('change', () => {
    const focusWasInNav = document.getElementById('app-nav')?.contains(document.activeElement);
    setNavOpen(false, { returnFocus: mobileNavigation.matches && focusWasInNav });
  });
  syncNavAccessibility({ animate: false });
  setNavOpen(false);
}

// ------------------------------------------------------------
// Instructivo de carga — antes de abrir el selector de archivo, un
// modal recuerda el camino exacto en el sistema de origen para bajar
// el informe (así no hay que acordarse el menú de memoria cada vez).
// Se dispara desde cualquier botón con data-instructivo="<clave>".
// ------------------------------------------------------------
const INSTRUCTIVOS = {
  oc: {
    titulo: '📤 Cómo bajar el archivo de Órdenes de Compra',
    pasos: [
      'Abrí <strong>Tango Gestión</strong>.',
      'Menú <strong>Compras → Informes → Órdenes de Compra → Emitidas</strong>.',
      'Elegí el rango de fechas que quieras exportar.',
      'Exportá el informe a Excel (.xlsx).',
    ],
    fileInputId: 'oc_file',
  },
  stock: {
    titulo: '📤 Cómo bajar el archivo de Stock',
    pasos: [
      'Abrí <strong>Capataz Software</strong>.',
      'Menú <strong>Stock → Movimientos → Gestión integral de Materiales → Por depósitos</strong>.',
      'Tocá <strong>Exportar a XLS</strong>.',
    ],
    fileInputId: 'sto_file',
  },
  cotizaciones: {
    titulo: '📤 Cómo bajar el archivo para armar una Cotización',
    pasos: [
      'Abrí <strong>Capataz Software</strong>.',
      'Menú <strong>Venta y Compras → Movimientos → Gestión personalizada de ventas y compras</strong>.',
      'Exportá el informe a Excel (.xlsx).',
    ],
    fileInputId: 'cot_file',
  },
  materot: {
    titulo: '📤 Cómo bajar el archivo de Materiales OT',
    pasos: [
      'Abrí <strong>Capataz Software</strong>.',
      'Menú <strong>Venta y Compras → Movimientos → Gestión personalizada de ventas y compras</strong> (la vista por OT, con columnas Cotizado/Planificado/Solicitado/Comprado).',
      'Exportá el informe a Excel (.xlsx).',
    ],
    fileInputId: 'mro_file',
  },
};

function wireInstructivos() {
  document.querySelectorAll('[data-instructivo]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cfg = INSTRUCTIVOS[btn.dataset.instructivo];
      if (!cfg) return;
      document.getElementById('mINSTR_t').textContent = cfg.titulo;
      document.getElementById('mINSTR_pasos').innerHTML = cfg.pasos.map(p => `<li>${p}</li>`).join('');
      document.getElementById('mINSTR_continuar').onclick = () => {
        cm('mINSTRUCTIVO');
        document.getElementById(cfg.fileInputId)?.click();
      };
      om('mINSTRUCTIVO');
    });
  });
}

const THEME_KEY = 'compras_tema';

function chartThemeColors() {
  const styles = getComputedStyle(document.documentElement);
  const tokens = ['--bg2', '--muted', '--border', '--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5', '--chart-6', '--green', '--red', '--yellow', '--orange', '--teal', '--purple', '--accent'];
  return Object.fromEntries(tokens.map(token => [token, styles.getPropertyValue(token).trim()]));
}

function updateChartTheme(previousColors) {
  if (typeof Chart === 'undefined') return;
  const colors = chartThemeColors();
  const replacements = new Map(Object.entries(previousColors)
    .filter(([, color]) => color)
    .map(([token, color]) => [color.toLowerCase(), colors[token]]));
  const replaceColor = value => Array.isArray(value)
    ? value.map(replaceColor)
    : typeof value === 'string' ? replacements.get(value.trim().toLowerCase()) || value : value;

  Chart.defaults.color = colors['--muted'];
  Chart.defaults.borderColor = colors['--border'];
  Object.values(Chart.instances || {}).forEach(chart => {
    (chart.data?.datasets || []).forEach(dataset => {
      if (dataset.backgroundColor != null) dataset.backgroundColor = replaceColor(dataset.backgroundColor);
      if (dataset.borderColor != null) dataset.borderColor = replaceColor(dataset.borderColor);
    });
    const options = chart.options;
    if (options) {
      options.color = colors['--muted'];
      const legend = options.plugins?.legend;
      if (legend && typeof legend === 'object') {
        if (!legend.labels) legend.labels = {};
        legend.labels.color = colors['--muted'];
      }
      Object.values(options.scales || {}).forEach(scale => {
        if (!scale || typeof scale !== 'object') return;
        if (!scale.ticks) scale.ticks = {};
        if (!scale.grid) scale.grid = {};
        if (!scale.border) scale.border = {};
        scale.ticks.color = colors['--muted'];
        scale.grid.color = colors['--border'];
        scale.border.color = colors['--border'];
      });
    }
    chart.update('none');
  });
}

function aplicarTema(tema) {
  const previousColors = chartThemeColors();
  document.documentElement.setAttribute('data-theme', tema);
  updateChartTheme(previousColors);
  const btn = document.getElementById('theme-toggle');
  if (btn) {
    const isDark = tema === 'dark';
    const label = isDark ? 'Activar tema claro' : 'Activar tema oscuro';
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
    btn.setAttribute('aria-pressed', String(isDark));
    btn.innerHTML = isDark
      ? '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>'
      : '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z"/></svg>';
  }
}

function initTheme() {
  aplicarTema(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const nuevo = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    try { localStorage.setItem(THEME_KEY, nuevo); } catch { /* El tema sigue funcionando sin almacenamiento. */ }
    aplicarTema(nuevo);
  });
}

function startClock() {
  const el = document.getElementById('clk');
  if (!el) return;
  setInterval(() => { el.textContent = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }, 1000);
}

function startAutoRefresh() {
  setInterval(() => {
    const sec = document.querySelector('.sec.on');
    if (sec?.id === 's-dash') dashboard.render();
  }, 30000);
}

// Oculta los grupos de nav que el perfil logueado no tiene habilitados
// (`compras_usuarios.modulos_habilitados`, ver módulo Parametrización) y
// devuelve la sección por defecto a la que hay que aterrizar en vez de
// "dash" (que vive dentro del grupo Flota — si ese grupo no está
// habilitado, aterrizar ahí mostraría contenido de un módulo oculto).
// `null` = sin restricción (admin, ve todo, no se oculta nada) — mismo
// comportamiento que tenían todos los perfiles antes de que existiera
// esta pantalla. Es una restricción de INTERFAZ únicamente, no de
// acceso a los datos (ver CLAUDE.md sección 12).
function aplicarPermisos() {
  // Se resetea primero (todos visibles) antes de restringir de nuevo —
  // necesario para "Cerrar sesión": si el perfil anterior tenía módulos
  // ocultos, el siguiente que entre (puede tener más acceso) no debería
  // arrastrar ese display:none.
  document.querySelectorAll('.nav-group[id^="nav-"]').forEach(g => { g.style.display = ''; });
  const habilitados = getUsuarioActual()?.modulos_habilitados;
  if (habilitados == null) {
    syncWorkspaceShortcuts();
    return null;
  }
  const set = new Set(habilitados);
  let primerSecDisponible = null;
  document.querySelectorAll('.nav-group[id^="nav-"]').forEach(group => {
    const modulo = group.id.replace(/^nav-/, '');
    const permitido = set.has(modulo);
    group.style.display = permitido ? '' : 'none';
    if (permitido && !primerSecDisponible) primerSecDisponible = group.dataset.defaultSec;
  });
  syncWorkspaceShortcuts();
  return primerSecDisponible;
}

// Se corre una vez al conectar y de nuevo cada vez que alguien entra
// después de "Cerrar sesión" — a diferencia de onConnected(), NO vuelve
// a inicializar los módulos (evitaría duplicar listeners), solo aplica
// los permisos del perfil recién elegido y abre Inicio.
async function entrarComoUsuarioActual() {
  const u = getUsuarioActual();
  const nombreEl = document.getElementById('usuario-actual');
  if (nombreEl) nombreEl.textContent = u?.nombre ? u.nombre.split(',')[0] : '';
  aplicarPermisos();
  await go('inicio', { transition: false });
  fadeAppIn();
}

// "Cerrar sesión" (pedido del usuario, 2026-09-28) — vuelve a mostrar la
// grilla de perfiles (mismo `mostrarLogin()` de siempre, se puede llamar
// de nuevo sin problema) para que otra persona pueda entrar con el suyo
// sin tener que recargar la página entera.
function cerrarSesion() {
  setNavOpen(false);
  document.getElementById('app').style.display = 'none';
  mostrarLogin(SB, () => {
    document.getElementById('app').style.display = 'block';
    return entrarComoUsuarioActual();
  });
}

async function onConnected() {
  [...new Set(Object.values(MODULES))].forEach(m => m.init?.());
  wireNav();
  wireInstructivos();
  initTheme();
  startClock();
  startAutoRefresh();
  document.getElementById('logout-btn')?.addEventListener('click', cerrarSesion);
  await entrarComoUsuarioActual();
}

window.cm = cm;
initInteractionMotion();
initSupabaseConnection(onConnected);
