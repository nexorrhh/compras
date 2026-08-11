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

const MODULES = { dash: dashboard, vcs: vehiculos, sols: solicitudes, movs: movimientos, gantt, mant: mantenimiento, vtv, doc: documentos };

function go(secId) {
  document.querySelectorAll('.sec').forEach(s => s.classList.remove('on'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('s-' + secId)?.classList.add('on');
  document.querySelector(`.nav-item[data-sec="${secId}"]`)?.classList.add('active');
  MODULES[secId]?.render?.();
}

function wireNav() {
  document.querySelectorAll('.nav-item[data-sec]').forEach(el => {
    el.addEventListener('click', () => go(el.dataset.sec));
  });

  const flotaGroup = document.getElementById('nav-flota');
  flotaGroup?.querySelector('.nav-parent')?.addEventListener('click', () => {
    const wasCollapsed = flotaGroup.classList.contains('collapsed');
    flotaGroup.classList.toggle('collapsed');
    if (wasCollapsed) go('dash');
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
  Object.values(MODULES).forEach(m => m.init?.());
  wireNav();
  startClock();
  startAutoRefresh();
  go('dash');
}

initSupabaseConnection(onConnected);
