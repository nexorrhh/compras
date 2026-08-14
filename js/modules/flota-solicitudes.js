// ============================================================
// Módulo Flota — Solicitudes
// Aprobar / rechazar y asignar vehículo a los pedidos del personal
// (creados desde solicitud.html).
// ============================================================
import { SB } from '../supabase-client.js';
import { VCS, loadVCS } from './flota-vehiculos.js';
import { PERSONAL, loadPersonal } from './flota-personal.js';
import { toast, om, cm, fmt, today, descVehiculo } from '../utils.js';

export async function render() {
  const tb = document.getElementById('t-sols');
  tb.innerHTML = '<tr><td colspan="8" class="loading">Cargando...</td></tr>';
  let q = SB.from('compras_solicitudes').select('*').order('created_at', { ascending: false }).limit(100);
  const est = document.getElementById('f-sest')?.value || '';
  const fecha = document.getElementById('f-sfecha')?.value || '';
  if (est) q = q.eq('estado', est);
  if (fecha) q = q.eq('fecha_uso', fecha);
  const { data, error } = await q;
  if (error) { tb.innerHTML = `<tr><td colspan="8" style="color:var(--red);padding:12px">${error.message}</td></tr>`; return; }
  if (!data?.length) { tb.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:18px;color:var(--muted)">Sin solicitudes</td></tr>'; return; }
  const badgeMap = { PENDIENTE: 'pendiente', APROBADO: 'aprobado', RECHAZADO: 'rechazado' };
  tb.innerHTML = data.map(s => `<tr>
    <td>${fmt(s.fecha_uso)}${s.fecha_devolucion ? ' → ' + fmt(s.fecha_devolucion) : ''}</td>
    <td><strong>${s.solicitante}</strong><br><span style="font-size:11px;color:var(--muted)">${s.sector}</span></td>
    <td>${s.sector}</td>
    <td>${s.vehiculo_sugerido || s.vehiculo_desc || '–'}</td>
    <td>${s.vehiculo_asignado_desc || '–'}</td>
    <td>${s.ot || '–'}</td>
    <td><span class="badge ${badgeMap[s.estado] || ''}">${s.estado}</span></td>
    <td>
      ${s.estado === 'PENDIENTE' ? `<button class="bsm y" onclick="window.flotaSolicitudes.abrirApro('${s.id}')">⚖ Gestionar</button>` : ''}
      <button class="bsm d" onclick="window.flotaSolicitudes.eliminarSolicitud('${s.id}')">🗑️</button>
    </td>
  </tr>`).join('');
}

async function eliminarSolicitud(id) {
  if (!confirm('¿Eliminar esta solicitud? No se puede deshacer.')) return;
  const { error } = await SB.from('compras_solicitudes').delete().eq('id', id);
  if (error) { toast(error.message, 'er'); return; }
  toast('Solicitud eliminada');
  render();
}

async function abrirApro(id) {
  const { data: s } = await SB.from('compras_solicitudes').select('*').eq('id', id).single();
  if (!s) return;
  document.getElementById('apro_id').value = id;
  document.getElementById('apro_detail').innerHTML = `
    <strong>Solicitante:</strong> ${s.solicitante} (${s.sector})<br>
    <strong>Fechas:</strong> ${fmt(s.fecha_uso)}${s.fecha_devolucion ? ' → ' + fmt(s.fecha_devolucion) : ''}<br>
    <strong>Vehículo solicitado:</strong> ${s.vehiculo_sugerido || s.vehiculo_desc || '–'}<br>
    <strong>OT:</strong> ${s.ot || '–'}<br>
    <strong>Destino:</strong> ${s.destino || '–'}<br>
    <strong>Observaciones:</strong> ${s.observacion || '–'}`;
  await loadVCS();
  document.getElementById('apro_vc').innerHTML =
    '<option value="">Seleccionar vehículo a asignar...</option>' +
    VCS.map(v => `<option value="${v.id}" data-desc="${v.patente} – ${descVehiculo(v)}">${v.patente} – ${descVehiculo(v)} [${v.estado}]</option>`).join('');
  if (s.vehiculo_id) document.getElementById('apro_vc').value = s.vehiculo_id;
  document.getElementById('apro_nota').value = '';
  om('mAPRO');
}

async function aprobar() {
  const id = document.getElementById('apro_id').value;
  const vcSel = document.getElementById('apro_vc');
  const vcId = vcSel.value;
  const vcDesc = vcSel.options[vcSel.selectedIndex]?.dataset?.desc || '';
  const nota = document.getElementById('apro_nota').value.trim();
  if (!vcId) { toast('Seleccioná un vehículo', 'er'); return; }
  const { error } = await SB.from('compras_solicitudes').update({
    estado: 'APROBADO',
    vehiculo_asignado_id: vcId,
    vehiculo_asignado_desc: vcDesc,
    motivo_rechazo: nota || null,
    aprobado_por: 'Admin',
  }).eq('id', id);
  if (error) { toast(error.message, 'er'); return; }
  toast('Solicitud aprobada ✓');
  cm('mAPRO');
  render();
}

async function rechazar() {
  const id = document.getElementById('apro_id').value;
  const nota = document.getElementById('apro_nota').value.trim();
  const { error } = await SB.from('compras_solicitudes').update({
    estado: 'RECHAZADO',
    motivo_rechazo: nota || null,
    aprobado_por: 'Admin',
  }).eq('id', id);
  if (error) { toast(error.message, 'er'); return; }
  toast('Solicitud rechazada');
  cm('mAPRO');
  render();
}

// ============================================================
// NUEVA SOLICITUD — creada directo por Compras (para otra persona
// o para uno mismo), sin pasar por solicitud.html. Queda APROBADA
// de una porque quien la crea es quien la aprobaría de todos modos.
// ============================================================
async function abrirNueva() {
  await Promise.all([loadVCS(), loadPersonal()]);
  document.getElementById('ns_sol').innerHTML = '<option value="">Seleccionar...</option>' +
    PERSONAL.map(p => `<option value="${p.apellido_y_nombre}">${p.apellido_y_nombre} — ${p.empresa}</option>`).join('');
  document.getElementById('ns_vc').innerHTML = '<option value="">Seleccionar...</option>' +
    VCS.map(v => `<option value="${v.id}">${v.patente} – ${descVehiculo(v)} [${v.estado}]</option>`).join('');
  document.getElementById('fNUEVASOL').reset();
  document.getElementById('ns_fuso').value = today();
  om('mNUEVASOL');
}

function autofillSector() {
  const nombre = document.getElementById('ns_sol').value;
  const p = PERSONAL.find(p => p.apellido_y_nombre === nombre);
  document.getElementById('ns_sec').value = p?.desc_puesto || '';
}

async function guardarNueva(e) {
  e.preventDefault();
  const vcId = document.getElementById('ns_vc').value;
  const vc = VCS.find(v => v.id === vcId);
  if (!vcId) { toast('Seleccioná un vehículo', 'er'); return; }
  const solicitante = document.getElementById('ns_sol').value;
  if (!solicitante) { toast('Seleccioná el solicitante', 'er'); return; }
  const vcDesc = `${vc.patente} – ${descVehiculo(vc)}`;
  const payload = {
    solicitante,
    sector: document.getElementById('ns_sec').value.trim(),
    vehiculo_id: vcId,
    vehiculo_desc: vcDesc,
    vehiculo_sugerido: `${vcDesc} (${vc.empresa})`,
    fecha_uso: document.getElementById('ns_fuso').value,
    fecha_devolucion: document.getElementById('ns_fdev').value || null,
    ot: document.getElementById('ns_ot').value.trim() || null,
    destino: document.getElementById('ns_dest').value.trim(),
    observacion: document.getElementById('ns_obs').value.trim() || null,
    estado: 'APROBADO',
    vehiculo_asignado_id: vcId,
    vehiculo_asignado_desc: vcDesc,
    aprobado_por: 'Admin',
  };
  const { error } = await SB.from('compras_solicitudes').insert(payload);
  if (error) { toast(error.message, 'er'); return; }
  toast('Solicitud creada y asignada ✓');
  cm('mNUEVASOL');
  render();
}

export function init() {
  document.getElementById('f-sest')?.addEventListener('change', render);
  document.getElementById('f-sfecha')?.addEventListener('change', render);
  document.getElementById('btn-apro-cancelar')?.addEventListener('click', () => cm('mAPRO'));
  document.getElementById('btn-apro-rechazar')?.addEventListener('click', rechazar);
  document.getElementById('btn-apro-aprobar')?.addEventListener('click', aprobar);
  document.getElementById('btn-nueva-sol')?.addEventListener('click', abrirNueva);
  document.getElementById('fNUEVASOL')?.addEventListener('submit', guardarNueva);
  document.getElementById('ns_sol')?.addEventListener('change', autofillSector);
  window.flotaSolicitudes = { abrirApro, eliminarSolicitud };
}
