// ============================================================
// Módulo Flota — Mantenimiento
// Historial de servicios/reparaciones por vehículo.
// ============================================================
import { SB } from '../supabase-client.js';
import { VCS, loadVCS } from './flota-vehiculos.js';
import { toast, om, cm, fmt, fmtM, today, descVehiculo } from '../utils.js';

export async function render() {
  const tb = document.getElementById('t-mant');
  tb.innerHTML = '<tr><td colspan="7" class="loading">Cargando...</td></tr>';
  const { data, error } = await SB.from('compras_mantenimientos').select('*, vehiculo:compras_vehiculos(patente,marca,modelo)').order('fecha', { ascending: false }).limit(100);
  if (error) { tb.innerHTML = `<tr><td colspan="7" style="color:var(--red);padding:12px">${error.message}</td></tr>`; return; }
  if (!data?.length) { tb.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:18px;color:var(--muted)">Sin registros</td></tr>'; return; }
  tb.innerHTML = data.map(m => `<tr>
    <td>${fmt(m.fecha)}</td><td>${m.vehiculo ? m.vehiculo.patente + ' – ' + descVehiculo(m.vehiculo) : '–'}</td>
    <td><span class="badge comp">${m.tipo || '–'}</span></td>
    <td>${m.detalle || '–'}</td>
    <td>${m.km ? m.km.toLocaleString('es-AR') + ' km' : '–'}</td>
    <td>${fmtM(m.costo)}</td>
    <td>${m.proximo_fecha ? fmt(m.proximo_fecha) : m.proximo_km ? m.proximo_km.toLocaleString('es-AR') + ' km' : '–'}</td></tr>`).join('');
}

async function abrirMAN() {
  await loadVCS();
  document.getElementById('ma_vc').innerHTML = '<option value="">Seleccionar...</option>' + VCS.map(v => `<option value="${v.id}">${v.patente} – ${descVehiculo(v)}</option>`).join('');
  document.getElementById('fMAN').reset();
  document.getElementById('ma_fecha').value = today();
  om('mMAN');
}

async function guardarMAN(e) {
  e.preventDefault();
  const vcId = document.getElementById('ma_vc').value;
  if (!vcId) { toast('Seleccioná un vehículo', 'er'); return; }
  const { error } = await SB.from('compras_mantenimientos').insert({
    vehiculo_id: vcId,
    tipo: document.getElementById('ma_tip').value,
    detalle: document.getElementById('ma_desc').value.trim() || null,
    fecha: document.getElementById('ma_fecha').value,
    km: parseInt(document.getElementById('ma_km').value) || null,
    costo: parseFloat(document.getElementById('ma_costo').value) || null,
    taller: document.getElementById('ma_prov').value.trim() || null,
    proximo_fecha: document.getElementById('ma_pfecha').value || null,
    proximo_km: parseInt(document.getElementById('ma_pkm').value) || null,
  });
  if (error) { toast(error.message, 'er'); return; }
  await SB.from('compras_vehiculos').update({ estado: 'MANTENIMIENTO' }).eq('id', vcId);
  toast('Mantenimiento registrado ✓');
  cm('mMAN');
  render();
}

export function init() {
  document.getElementById('btn-nuevo-man')?.addEventListener('click', abrirMAN);
  document.getElementById('fMAN')?.addEventListener('submit', guardarMAN);
}
