// ============================================================
// Módulo Flota — Movimientos
// Historial de salidas/retornos registrados desde porteria.html.
// Vista de solo lectura para el área de Compras.
// ============================================================
import { SB } from '../supabase-client.js';
import { VCS, loadVCS } from './flota-vehiculos.js';
import { fmtDT, descVehiculo } from '../utils.js';

export async function render() {
  const tb = document.getElementById('t-movs');
  tb.innerHTML = '<tr><td colspan="7" class="loading">Cargando...</td></tr>';
  if (!VCS.length) await loadVCS();

  const sel = document.getElementById('f-mvc');
  if (sel && VCS.length && !sel.dataset.filled) {
    sel.innerHTML = '<option value="">Todos los vehículos</option>' + VCS.map(v => `<option value="${v.id}">${v.patente} – ${descVehiculo(v)}</option>`).join('');
    sel.dataset.filled = '1';
  }

  let q = SB.from('compras_movimientos').select('*').order('fecha_hora', { ascending: false }).limit(200);
  const fecha = document.getElementById('f-mfecha')?.value || '';
  const vcId = document.getElementById('f-mvc')?.value || '';
  const tipo = document.getElementById('f-mtipo')?.value || '';
  if (fecha) q = q.gte('fecha_hora', fecha + 'T00:00:00').lte('fecha_hora', fecha + 'T23:59:59');
  if (vcId) q = q.eq('vehiculo_id', vcId);
  if (tipo) q = q.eq('tipo', tipo);
  const { data, error } = await q;
  if (error) { tb.innerHTML = `<tr><td colspan="7" style="color:var(--red);padding:12px">${error.message}</td></tr>`; return; }
  if (!data?.length) { tb.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:18px;color:var(--muted)">Sin registros</td></tr>'; return; }
  tb.innerHTML = data.map(m => `<tr>
    <td>${fmtDT(m.fecha_hora)}</td>
    <td><span class="badge ${m.tipo.toLowerCase()}">${m.tipo}</span></td>
    <td>${m.vehiculo_desc}</td><td>${m.conductor}</td>
    <td>${m.km ? m.km.toLocaleString('es-AR') + ' km' : '–'}</td>
    <td>${m.registrado_por || '–'}</td>
    <td>${m.observacion || '–'}</td></tr>`).join('');
}

export function init() {
  ['f-mfecha', 'f-mvc', 'f-mtipo'].forEach(id => document.getElementById(id)?.addEventListener('change', render));
}
