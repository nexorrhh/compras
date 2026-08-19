// ============================================================
// Tablero de Compras — CIMOMET / CO.MO.ING
// Punto de entrada: conexión a Supabase, navegación y ciclo de
// vida de cada módulo (por ahora solo Flota está implementado;
// el resto de secciones del CLAUDE.md quedan como placeholder).
// ============================================================
import { initSupabaseConnection } from './supabase-client.js';

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

const MODULES = {
  dash: dashboard, vcs: vehiculos, sols: solicitudes, movs: movimientos, gantt, mant: mantenimiento, vtv, doc: documentos,
  'oc-dash': oc, 'oc-abiertas': oc, 'oc-comp': oc, 'oc-todas': oc,
  'stock-dash': stock, 'stock-comprar': stock, 'stock-segui': stock, 'stock-todo': stock,
  'prov-dash': proveedores, 'prov-agenda': proveedores, 'prov-ranking': proveedores, 'prov-clasificar': proveedores, 'prov-catalogo': proveedores,
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

async function onConnected() {
  [...new Set(Object.values(MODULES))].forEach(m => m.init?.());
  wireNav();
  initTheme();
  startClock();
  startAutoRefresh();
  go('dash');
}

initSupabaseConnection(onConnected);
