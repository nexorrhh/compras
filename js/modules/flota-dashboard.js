// ============================================================
// Módulo Flota — Dashboard
// KPIs generales + alertas de vencimiento (VTV/seguro a 30 días).
// ============================================================
import { SB } from '../supabase-client.js';
import { VCS, loadVCS, renderVCards } from './flota-vehiculos.js';
import { escAttr, fmt, today } from '../utils.js';

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
    const vencimientos = [
      { tipo: 'Seguro', fecha: v.seguro_vencimiento },
      { tipo: 'VTV', fecha: v.vtv_vencimiento },
    ].filter(({ fecha }) => fecha && fecha <= lim);
    if (!vencimientos.length) return;
    const patente = escAttr(String(v.patente ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
    const vencido = vencimientos.some(({ fecha }) => fecha < todayStr);
    alertas += `<div class="expiry-alert${vencido ? ' is-overdue' : ''}" role="listitem" aria-label="Vencimientos de ${patente}">
      <div class="expiry-plate"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5m0 3v.01"/></svg><strong>${patente}</strong></div>
      <div class="expiry-items">${vencimientos.map(({ tipo, fecha }) => {
        const estaVencido = fecha < todayStr;
        return `<div class="expiry-row${estaVencido ? ' is-overdue' : ''}"><span class="expiry-kind">${tipo}${estaVencido ? ' <span class="expiry-status">vencido</span>' : ''}</span><time datetime="${escAttr(fecha)}">${fmt(fecha)}</time></div>`;
      }).join('')}</div>
    </div>`;
  });
  document.getElementById('d-alertas').innerHTML = alertas;

  renderVCards(VCS, 'd-cards', true);
}

export function init() {
  document.getElementById('btn-ir-solicitudes')?.addEventListener('click', () => {
    document.querySelector('.nav-item[data-sec="sols"]')?.click();
  });
}
