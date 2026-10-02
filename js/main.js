// ============================================================
// Tablero de Compras — CIMOMET / CO.MO.ING
// Punto de entrada: conexión a Supabase, navegación y ciclo de
// vida de cada módulo (por ahora solo Flota está implementado;
// el resto de secciones del CLAUDE.md quedan como placeholder).
// ============================================================
import { initSupabaseConnection, SB } from './supabase-client.js';
import { om, cm } from './utils.js';
import { getUsuarioActual, mostrarLogin } from './login.js';

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
import * as ot from './modules/ot.js';
import * as materot from './modules/materot.js';
import * as parametrizacion from './modules/parametrizacion.js';

const MODULES = {
  dash: dashboard, vcs: vehiculos, sols: solicitudes, movs: movimientos, gantt, mant: mantenimiento, vtv, doc: documentos,
  'oc-dash': oc, 'oc-abiertas': oc, 'oc-comp': oc, 'oc-todas': oc,
  'stock-dash': stock, 'stock-comprar': stock, 'stock-segui': stock, 'stock-todo': stock,
  'prov-dash': proveedores, 'prov-agenda': proveedores, 'prov-ranking': proveedores, 'prov-clasificar': proveedores, 'prov-catalogo': proveedores,
  'np-lista': notasPedido,
  'cot-lista': cotizaciones,
  'cot-pendientes': cotizaciones,
  'ot-dash': ot, 'ot-cards': ot,
  'materot-dash': materot, 'materot-cards': materot, 'materot-grupos': materot,
  'param-usuarios': parametrizacion,
};

function go(secId) {
  document.querySelectorAll('.sec').forEach(s => s.classList.remove('on'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('s-' + secId)?.classList.add('on');
  const navItem = document.querySelector(`.nav-item[data-sec="${secId}"]`);
  navItem?.classList.add('active');

  // Acordeón: al navegar, solo queda desplegado el grupo que contiene la
  // sección activa — el resto se colapsa solo, para no tener varios
  // grupos abiertos a la vez sin razón.
  const activeGroup = navItem?.closest('.nav-group');
  document.querySelectorAll('.nav-group').forEach(g => g.classList.toggle('collapsed', g !== activeGroup));

  MODULES[secId]?.render?.(secId);
}

function wireNav() {
  document.querySelectorAll('.nav-item[data-sec]').forEach(el => {
    el.addEventListener('click', () => go(el.dataset.sec));
  });

  document.querySelectorAll('.nav-group').forEach(group => {
    group.querySelector('.nav-parent')?.addEventListener('click', () => {
      const wasCollapsed = group.classList.contains('collapsed');
      group.classList.toggle('collapsed');
      const defaultSec = group.dataset.defaultSec;
      if (wasCollapsed && defaultSec) go(defaultSec);
    });
  });
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

function aplicarTema(tema) {
  document.documentElement.setAttribute('data-theme', tema);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = tema === 'light' ? '☀️' : '🌙';
}

function initTheme() {
  aplicarTema(document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const nuevo = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    localStorage.setItem(THEME_KEY, nuevo);
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
  if (habilitados == null) return null;
  const set = new Set(habilitados);
  let primerSecDisponible = null;
  document.querySelectorAll('.nav-group[id^="nav-"]').forEach(group => {
    const modulo = group.id.replace(/^nav-/, '');
    const permitido = set.has(modulo);
    group.style.display = permitido ? '' : 'none';
    if (permitido && !primerSecDisponible) primerSecDisponible = group.dataset.defaultSec;
  });
  return primerSecDisponible;
}

// Se corre una vez al conectar y de nuevo cada vez que alguien entra
// después de "Cerrar sesión" — a diferencia de onConnected(), NO vuelve
// a inicializar los módulos (evitaría duplicar listeners), solo aplica
// los permisos del perfil recién elegido y aterriza en su primera
// sección disponible.
function entrarComoUsuarioActual() {
  const u = getUsuarioActual();
  const nombreEl = document.getElementById('usuario-actual');
  if (nombreEl) nombreEl.textContent = u?.nombre ? `👤 ${u.nombre.split(',')[0]}` : '';
  const primerDisponible = aplicarPermisos();
  go(primerDisponible || 'dash');
}

// "Cerrar sesión" (pedido del usuario, 2026-09-28) — vuelve a mostrar la
// grilla de perfiles (mismo `mostrarLogin()` de siempre, se puede llamar
// de nuevo sin problema) para que otra persona pueda entrar con el suyo
// sin tener que recargar la página entera.
function cerrarSesion() {
  document.getElementById('app').style.display = 'none';
  mostrarLogin(SB, () => {
    document.getElementById('app').style.display = 'block';
    entrarComoUsuarioActual();
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
  entrarComoUsuarioActual();
}

initSupabaseConnection(onConnected);
