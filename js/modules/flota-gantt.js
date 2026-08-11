// ============================================================
// Módulo Flota — Gantt de disponibilidad
// Basado en solicitudes APROBADAS (fecha_uso → fecha_devolucion).
// ============================================================
import { SB } from '../supabase-client.js';
import { VCS, loadVCS } from './flota-vehiculos.js';
import { today, descVehiculo } from '../utils.js';

let gOff = 0;

export async function render() {
  const DAYS = 21;
  const base = new Date();
  base.setDate(base.getDate() + gOff);
  const dates = Array.from({ length: DAYS }, (_, i) => { const d = new Date(base); d.setDate(d.getDate() + i); return d; });
  const todayStr = today();
  document.getElementById('g-rng').textContent = dates[0].toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) + ' – ' + dates[DAYS - 1].toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });

  const { data: sols } = await SB.from('compras_solicitudes').select('vehiculo_asignado_id,fecha_uso,fecha_devolucion').eq('estado', 'APROBADO');
  if (!VCS.length) await loadVCS();

  let html = `<div class="g-hdr"><div class="g-vc" style="font-size:10px;color:var(--muted);background:var(--bg3);border-bottom:1px solid var(--border)">Vehículo</div><div class="g-days">`;
  dates.forEach(d => {
    const ds = d.toISOString().slice(0, 10);
    const isH = ds === todayStr, isFds = d.getDay() === 0 || d.getDay() === 6;
    html += `<div class="g-dh ${isH ? 'hoy' : ''} ${isFds ? 'fds' : ''}" style="background:${isH ? 'rgba(59,130,246,.1)' : isFds ? 'rgba(0,0,0,.2)' : 'var(--bg3)'};border-bottom:1px solid var(--border)"><span>${d.getDate()}</span></div>`;
  });
  html += '</div></div>';
  VCS.forEach(v => {
    html += `<div class="g-row"><div class="g-vc">${v.patente}<br><span style="font-size:10px;color:var(--muted)">${descVehiculo(v)}</span></div><div class="g-days">`;
    dates.forEach(d => {
      const ds = d.toISOString().slice(0, 10);
      const isH = ds === todayStr;
      const ocu = sols?.some(s => s.vehiculo_asignado_id === v.id && ds >= s.fecha_uso && ds <= (s.fecha_devolucion || s.fecha_uso)) || (v.estado === 'EN USO' && isH);
      html += `<div class="g-cel ${ocu ? 'ocu' : ''} ${isH ? 'hoy' : ''}"></div>`;
    });
    html += '</div></div>';
  });
  document.getElementById('g-cont').innerHTML = html;
}

export function init() {
  document.getElementById('g-prev')?.addEventListener('click', () => { gOff -= 7; render(); });
  document.getElementById('g-next')?.addEventListener('click', () => { gOff += 7; render(); });
  document.getElementById('g-hoy')?.addEventListener('click', () => { gOff = 0; render(); });
}
