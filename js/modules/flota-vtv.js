// ============================================================
// Módulo Flota — VTV
// Historial de trámites de Verificación Técnica Vehicular.
//
// - "Registrar" (nueva) solo ofrece vehículos sin VTV vigente — evita
//   cargar un trámite de más mientras el actual sigue siendo válido.
// - "Editar" permite corregir fecha de trámite / resultado /
//   vencimiento de un registro existente sin crear uno nuevo — útil
//   para poner la fecha del trámite renovado una vez que la VTV
//   anterior venció.
// ============================================================
import { SB } from '../supabase-client.js';
import { VCS, loadVCS } from './flota-vehiculos.js';
import { toast, om, cm, fmt, today, descVehiculo, estadoVencimiento } from '../utils.js';

let VTVS = [];

export async function render() {
  const tb = document.getElementById('t-vtv');
  tb.innerHTML = '<tr><td colspan="6" class="loading">Cargando...</td></tr>';
  const { data, error } = await SB.from('compras_vtv').select('*, vehiculo:compras_vehiculos(patente,marca,modelo)').order('fecha_tramite', { ascending: false }).limit(100);
  if (error) { tb.innerHTML = `<tr><td colspan="6" style="color:var(--red);padding:12px">${error.message}</td></tr>`; return; }
  VTVS = data || [];
  if (!VTVS.length) { tb.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:18px;color:var(--muted)">Sin registros</td></tr>'; return; }
  tb.innerHTML = VTVS.map(r => {
    const est = estadoVencimiento(r.vencimiento);
    return `<tr>
      <td>${r.vehiculo ? r.vehiculo.patente + ' – ' + descVehiculo(r.vehiculo) : '–'}</td>
      <td>${fmt(r.fecha_tramite)}</td>
      <td>${r.resultado || '–'}</td>
      <td><span class="badge ${est.cls}">${est.label}</span></td>
      <td>${fmt(r.vencimiento)}</td>
      <td><button class="bsm" onclick="window.flotaVTV.editarVTV('${r.id}')">✏️ Editar</button></td>
    </tr>`;
  }).join('');
}

// Vehículos que ya tienen una VTV vigente (no vencida) no se ofrecen para
// registrar otra — se evita duplicar el trámite mientras la actual sigue
// siendo válida. v.vtv_vencimiento viene de compras_vw_vehiculos_vencimientos
// (ya cargado por loadVCS()).
function vehiculosSinVtvVigente() {
  const hoy = today();
  return VCS.filter(v => !v.vtv_vencimiento || v.vtv_vencimiento < hoy);
}

function resetModalComun() {
  document.getElementById('fVTV').reset();
  document.getElementById('vtv_id').value = '';
}

async function abrirVTV() {
  await loadVCS();
  resetModalComun();
  const disponibles = vehiculosSinVtvVigente();
  const sel = document.getElementById('vtv_vc');
  sel.innerHTML = '<option value="">Seleccionar...</option>' + disponibles.map(v => `<option value="${v.id}">${v.patente} – ${descVehiculo(v)}</option>`).join('');
  sel.disabled = false;
  if (!disponibles.length) toast('Todos los vehículos tienen VTV vigente', 'ok');
  document.getElementById('vtv_fecha').value = today();
  document.getElementById('mVTV_t').textContent = '🔍 Registrar VTV';
  document.getElementById('vtv_submit').textContent = 'Guardar';
  om('mVTV');
}

function editarVTV(id) {
  const r = VTVS.find(x => x.id === id);
  if (!r) return;
  resetModalComun();
  document.getElementById('vtv_id').value = r.id;
  const sel = document.getElementById('vtv_vc');
  sel.innerHTML = `<option value="${r.vehiculo_id}">${r.vehiculo ? r.vehiculo.patente + ' – ' + descVehiculo(r.vehiculo) : 'Vehículo'}</option>`;
  sel.disabled = true;
  document.getElementById('vtv_fecha').value = r.fecha_tramite || '';
  document.getElementById('vtv_resultado').value = r.resultado || 'Apto';
  document.getElementById('vtv_venc').value = r.vencimiento || '';
  document.getElementById('mVTV_t').textContent = '✏️ Editar VTV';
  document.getElementById('vtv_submit').textContent = 'Guardar cambios';
  om('mVTV');
}

async function guardarVTV(e) {
  e.preventDefault();
  const id = document.getElementById('vtv_id').value;
  const isEdit = !!id;
  const vcId = document.getElementById('vtv_vc').value;
  if (!vcId) { toast('Seleccioná un vehículo', 'er'); return; }

  if (!isEdit) {
    const { data: actual } = await SB.from('compras_vw_vtv_actual').select('vencimiento').eq('vehiculo_id', vcId).maybeSingle();
    if (actual?.vencimiento && actual.vencimiento >= today()) {
      toast(`Este vehículo ya tiene una VTV vigente hasta ${fmt(actual.vencimiento)}`, 'er');
      return;
    }
  }

  const payload = {
    fecha_tramite: document.getElementById('vtv_fecha').value,
    resultado: document.getElementById('vtv_resultado').value,
    vencimiento: document.getElementById('vtv_venc').value || null,
  };
  const { error } = isEdit
    ? await SB.from('compras_vtv').update(payload).eq('id', id)
    : await SB.from('compras_vtv').insert({ vehiculo_id: vcId, ...payload });
  if (error) { toast(error.message, 'er'); return; }
  toast(isEdit ? 'VTV actualizada ✓' : 'VTV registrada ✓');
  cm('mVTV');
  render();
}

export function init() {
  document.getElementById('btn-nuevo-vtv')?.addEventListener('click', abrirVTV);
  document.getElementById('fVTV')?.addEventListener('submit', guardarVTV);
  window.flotaVTV = { editarVTV };
}
