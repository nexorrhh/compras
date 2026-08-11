// ============================================================
// Módulo Flota — Vehículos
// Listado, alta, edición. Estado en memoria (VCS) reutilizado por
// el resto de los módulos de Flota (solicitudes, movimientos,
// gantt, mantenimiento, vtv, seguros, permisos).
// ============================================================
import { SB } from '../supabase-client.js';
import { toast, om, cm, fmt, descVehiculo, estadoVencimiento } from '../utils.js';

export const VCS = [];

export async function loadVCS() {
  const [{ data: vehiculos, error: e1 }, { data: venc, error: e2 }] = await Promise.all([
    SB.from('compras_vehiculos').select('*').eq('activo', true).order('patente'),
    SB.from('compras_vw_vehiculos_vencimientos').select('*'),
  ]);
  if (e1) { toast(e1.message, 'er'); }
  if (e2) { toast(e2.message, 'er'); }
  const vencMap = new Map((venc || []).map(v => [v.vehiculo_id, v]));
  const merged = (vehiculos || []).map(v => ({
    ...v,
    vtv_vencimiento: vencMap.get(v.id)?.vtv_vencimiento || null,
    seguro_vencimiento: vencMap.get(v.id)?.seguro_vencimiento || null,
  }));
  VCS.length = 0;
  VCS.push(...merged);
  return VCS;
}

export function renderVCards(vcs, containerId, fromDash) {
  const c = document.getElementById(containerId);
  if (!c) return;
  if (!vcs.length) { c.innerHTML = '<div style="color:var(--muted);padding:20px">Sin vehículos</div>'; return; }
  c.innerHTML = vcs.map(v => {
    const cls = v.empresa?.includes('Co.mo.ing') ? 'co' : 'ci';
    const scls = v.estado === 'LIBRE' ? 'libre' : v.estado === 'EN USO' ? 'enuso' : 'mant';
    return `<div class="vcard ${cls}">
      <div class="stripe"></div>
      <div class="vc-h">
        <div>
          <div class="vc-plate">${v.patente}</div>
          <div class="vc-mod">${descVehiculo(v)}${v.tipo ? ' · ' + v.tipo : ''}</div>
          <div class="vc-emp">${v.empresa || ''}</div>
        </div>
        <span class="sbadge ${scls}">${v.estado}</span>
      </div>
      <div style="font-size:11px;color:var(--muted);margin-top:7px">
        ${v.km_actual ? '📍 ' + v.km_actual.toLocaleString('es-AR') + ' km' : ''}
        ${v.vtv_vencimiento ? ' · VTV: ' + fmt(v.vtv_vencimiento) : ''}
      </div>
      <div class="vc-acts">
        ${fromDash ? '' : `<button class="bsm" onclick="window.flotaVehiculos.editVC('${v.id}')">✏ Editar</button>`}
      </div>
    </div>`;
  }).join('');
}

export async function render() {
  document.getElementById('vcs-grid').innerHTML = '<div class="loading"><div class="spin"></div>Cargando...</div>';
  await loadVCS();
  applyFilters();
}

function applyFilters() {
  let vcs = VCS;
  const pat = (document.getElementById('f-pat')?.value || '').toLowerCase();
  const emp = document.getElementById('f-emp')?.value || '';
  const est = document.getElementById('f-est')?.value || '';
  if (pat) vcs = vcs.filter(v => v.patente.toLowerCase().includes(pat) || descVehiculo(v).toLowerCase().includes(pat));
  if (emp) vcs = vcs.filter(v => v.empresa === emp);
  if (est) vcs = vcs.filter(v => v.estado === est);
  renderVCards(vcs, 'vcs-grid', false);
}

function nuevoVC() {
  document.getElementById('mVC_t').textContent = '+ Nuevo Vehículo';
  document.getElementById('vc_id').value = '';
  document.getElementById('fVC').reset();
  om('mVC');
}

function editVC(id) {
  const v = VCS.find(x => x.id === id);
  if (!v) return;
  document.getElementById('mVC_t').textContent = 'Editar ' + v.patente;
  const map = { vc_id: 'id', vc_pat: 'patente', vc_marca: 'marca', vc_mod: 'modelo', vc_emp: 'empresa', vc_tip: 'tipo', vc_km: 'km_actual', vc_ano: 'anio', vc_area: 'area_uso', vc_resp: 'responsable', vc_est: 'estado', vc_obs: 'observaciones' };
  Object.entries(map).forEach(([elId, field]) => {
    const el = document.getElementById(elId);
    if (el) el.value = v[field] ?? '';
  });
  om('mVC');
}

async function guardarVC(e) {
  e.preventDefault();
  const id = document.getElementById('vc_id').value;
  const payload = {
    patente: document.getElementById('vc_pat').value.toUpperCase().trim(),
    marca: document.getElementById('vc_marca').value.trim() || null,
    modelo: document.getElementById('vc_mod').value.trim(),
    empresa: document.getElementById('vc_emp').value,
    tipo: document.getElementById('vc_tip').value,
    km_actual: parseInt(document.getElementById('vc_km').value) || 0,
    anio: parseInt(document.getElementById('vc_ano').value) || null,
    area_uso: document.getElementById('vc_area').value.trim() || null,
    responsable: document.getElementById('vc_resp').value.trim() || null,
    estado: document.getElementById('vc_est').value,
    observaciones: document.getElementById('vc_obs').value.trim() || null,
  };
  const { error } = id
    ? await SB.from('compras_vehiculos').update(payload).eq('id', id)
    : await SB.from('compras_vehiculos').insert(payload);
  if (error) { toast(error.message, 'er'); return; }
  toast('Guardado ✓');
  cm('mVC');
  await loadVCS();
  applyFilters();
}

export function init() {
  document.getElementById('f-pat')?.addEventListener('input', applyFilters);
  document.getElementById('f-emp')?.addEventListener('change', applyFilters);
  document.getElementById('f-est')?.addEventListener('change', applyFilters);
  document.getElementById('btn-nuevo-vc')?.addEventListener('click', nuevoVC);
  document.getElementById('fVC')?.addEventListener('submit', guardarVC);
  window.flotaVehiculos = { editVC };
}
