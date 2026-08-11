// ============================================================
// Módulo Flota — Dashboard
// KPIs generales + alertas de vencimiento (VTV/seguro a 30 días).
// ============================================================
import { SB } from '../supabase-client.js';
import { VCS, loadVCS, renderVCards } from './flota-vehiculos.js';
import { fmt, today } from '../utils.js';

export async function render() {
  document.getElementById('d-fecha').textContent = new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  document.getElementById('d-cards').innerHTML = '<div class="loading"><div class="spin"></div>Cargando...</div>';

  await loadVCS();
  document.getElementById('k-tot').textContent = VCS.length;
  document.getElementById('k-lib').textContent = VCS.filter(v => v.estado === 'LIBRE').length;
  document.getElementById('k-uso').textContent = VCS.filter(v => v.estado === 'EN USO').length;
  document.getElementById('k-man').textContent = VCS.filter(v => ['MANTENIMIENTO', 'FUERA DE SERVICIO'].includes(v.estado)).length;

  const { count: pend } = await SB.from('compras_solicitudes').select('*', { count: 'exact', head: true }).eq('estado', 'PENDIENTE');
  document.getElementById('k-pen').textContent = pend || 0;
  const bp = document.getElementById('badge-pend');
  if (bp) { if (pend > 0) { bp.textContent = pend; bp.style.display = 'inline'; } else { bp.style.display = 'none'; } }

  const todayStr = today();
  const { count: movHoy } = await SB.from('compras_movimientos').select('*', { count: 'exact', head: true }).gte('fecha_hora', todayStr + 'T00:00:00').lte('fecha_hora', todayStr + 'T23:59:59');
  document.getElementById('k-hoy').textContent = movHoy || 0;

  const enUnMes = new Date();
  enUnMes.setDate(enUnMes.getDate() + 30);
  const lim = enUnMes.toISOString().slice(0, 10);
  let alertas = '';
  VCS.forEach(v => {
    if (v.seguro_vencimiento && v.seguro_vencimiento <= lim) alertas += `<div class="alert-box">⚠ <strong>${v.patente}</strong>: seguro vence ${fmt(v.seguro_vencimiento)}</div>`;
    if (v.vtv_vencimiento && v.vtv_vencimiento <= lim) alertas += `<div class="alert-box">⚠ <strong>${v.patente}</strong>: VTV vence ${fmt(v.vtv_vencimiento)}</div>`;
  });
  document.getElementById('d-alertas').innerHTML = alertas;

  renderVCards(VCS, 'd-cards', true);
}

export function init() {
  document.getElementById('btn-ir-solicitudes')?.addEventListener('click', () => {
    document.querySelector('.nav-item[data-sec="sols"]')?.click();
  });
}
