// ============================================================
// Módulo Flota — Documentación (Seguros + Permisos unificados)
// Una fila por vehículo, con el Seguro y el Permiso vigentes uno al
// lado del otro (no una fila por documento) — así se ve de un
// vistazo el estado completo de cada vehículo. Los botones "Seguro"
// y "Permiso" de cada fila abren el mismo modal ya pre-cargado para
// ese vehículo + esa categoría: si ya hay un documento, lo edita
// (permite reemplazar el archivo y/o corregir el vencimiento); si no
// hay ninguno todavía, lo crea.
// ============================================================
import { SB } from '../supabase-client.js';
import { VCS, loadVCS } from './flota-vehiculos.js';
import { toast, om, cm, fmt, descVehiculo, estadoVencimiento } from '../utils.js';

const BUCKET = 'compras-documentos';
let DOCMAP = {}; // vehiculo_id -> { SEGURO: row|undefined, PERMISO: row|undefined }

export async function render() {
  const tb = document.getElementById('t-doc');
  tb.innerHTML = '<tr><td colspan="4" class="loading">Cargando...</td></tr>';
  await loadVCS();
  const { data, error } = await SB.from('compras_documentos').select('*').order('vencimiento', { ascending: false, nullsFirst: false });
  if (error) { tb.innerHTML = `<tr><td colspan="4" style="color:var(--red);padding:12px">${error.message}</td></tr>`; return; }
  DOCMAP = {};
  (data || []).forEach(r => {
    DOCMAP[r.vehiculo_id] = DOCMAP[r.vehiculo_id] || {};
    if (!DOCMAP[r.vehiculo_id][r.categoria]) DOCMAP[r.vehiculo_id][r.categoria] = r; // ya viene ordenado por vencimiento desc: el primero de cada categoría es el vigente
  });
  if (!VCS.length) { tb.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:18px;color:var(--muted)">Sin vehículos</td></tr>'; return; }
  tb.innerHTML = VCS.map(v => {
    const seg = DOCMAP[v.id]?.SEGURO;
    const per = DOCMAP[v.id]?.PERMISO;
    return `<tr>
      <td>${v.patente} – ${descVehiculo(v)}</td>
      <td>${celda(seg)}</td>
      <td>${celda(per, true)}</td>
      <td>
        <button class="bsm" onclick="window.flotaDocumentos.abrirParaVehiculo('${v.id}','SEGURO')">✏️ Seguro</button>
        <button class="bsm" onclick="window.flotaDocumentos.abrirParaVehiculo('${v.id}','PERMISO')">✏️ Permiso</button>
      </td>
    </tr>`;
  }).join('');
}

function celda(doc, esPermiso) {
  if (!doc || !doc.vencimiento) return '<span class="text-muted">Sin cargar</span>';
  const est = estadoVencimiento(doc.vencimiento);
  const detalle = esPermiso && doc.tipo ? `<div style="font-size:11px;color:var(--muted);margin-bottom:3px">${doc.tipo}${doc.organismo ? ' — ' + doc.organismo : ''}</div>` : '';
  const link = doc.archivo_url ? ` <a class="bsm" href="${doc.archivo_url}" target="_blank" rel="noopener">📎</a>` : '';
  return `${detalle}<span class="badge ${est.cls}">${est.label}</span>${link}`;
}

function toggleCategoriaFields() {
  const esPermiso = document.getElementById('doc_categoria').value === 'PERMISO';
  document.getElementById('doc_permiso_fields').style.display = esPermiso ? '' : 'none';
}

function abrirModal({ id, vehiculoId, categoria, tipo, organismo, vencimiento, archivoUrl }) {
  document.getElementById('fDOC').reset();
  document.getElementById('doc_id').value = id || '';
  document.getElementById('doc_old_url').value = archivoUrl || '';

  const catSel = document.getElementById('doc_categoria');
  catSel.innerHTML = `<option value="${categoria}">${categoria === 'SEGURO' ? 'Seguro' : 'Permiso / Habilitación'}</option>`;
  catSel.value = categoria;
  toggleCategoriaFields();

  const v = VCS.find(x => x.id === vehiculoId);
  const sel = document.getElementById('doc_vc');
  sel.innerHTML = `<option value="${vehiculoId}">${v ? v.patente + ' – ' + descVehiculo(v) : 'Vehículo'}</option>`;

  document.getElementById('doc_tipo').value = tipo || '';
  document.getElementById('doc_organismo').value = organismo || '';
  document.getElementById('doc_venc').value = vencimiento || '';
  document.getElementById('doc_archivo').required = !id;
  document.getElementById('mDOC_t').textContent = id ? '✏️ Editar Documento' : '🛡️ Registrar Documento';
  document.getElementById('doc_submit').textContent = id ? 'Guardar cambios' : 'Guardar';
  om('mDOC');
}

function abrirParaVehiculo(vehiculoId, categoria) {
  const existing = DOCMAP[vehiculoId]?.[categoria];
  if (existing) {
    abrirModal({ id: existing.id, vehiculoId, categoria, tipo: existing.tipo, organismo: existing.organismo, vencimiento: existing.vencimiento, archivoUrl: existing.archivo_url });
  } else {
    abrirModal({ vehiculoId, categoria });
  }
}

async function guardarDOC(e) {
  e.preventDefault();
  const id = document.getElementById('doc_id').value;
  const isEdit = !!id;
  const categoria = document.getElementById('doc_categoria').value;
  const vcId = document.getElementById('doc_vc').value;
  const file = document.getElementById('doc_archivo').files[0];
  const venc = document.getElementById('doc_venc').value;
  if (!isEdit && !file) { toast('Subí el archivo', 'er'); return; }
  if (!venc) { toast('Indicá el vencimiento', 'er'); return; }

  const btn = document.getElementById('doc_submit');
  const prevLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = file ? 'Subiendo...' : 'Guardando...';

  let archivoUrl = document.getElementById('doc_old_url').value || null;
  if (file) {
    const ext = file.name.split('.').pop();
    const path = `${categoria.toLowerCase()}/${vcId}/${Date.now()}.${ext}`;
    const { error: upError } = await SB.storage.from(BUCKET).upload(path, file);
    if (upError) {
      toast('Error subiendo el archivo: ' + upError.message, 'er');
      btn.disabled = false; btn.textContent = prevLabel;
      return;
    }
    const { data: pub } = SB.storage.from(BUCKET).getPublicUrl(path);
    archivoUrl = pub.publicUrl;
  }

  const payload = {
    vencimiento: venc,
    archivo_url: archivoUrl,
    tipo: categoria === 'PERMISO' ? (document.getElementById('doc_tipo').value.trim() || null) : null,
    organismo: categoria === 'PERMISO' ? (document.getElementById('doc_organismo').value.trim() || null) : null,
  };
  const { error } = isEdit
    ? await SB.from('compras_documentos').update(payload).eq('id', id)
    : await SB.from('compras_documentos').insert({ vehiculo_id: vcId, categoria, ...payload });

  btn.disabled = false; btn.textContent = prevLabel;
  if (error) { toast(error.message, 'er'); return; }
  toast(isEdit ? 'Documento actualizado ✓' : 'Documento registrado ✓');
  cm('mDOC');
  render();
}

export function init() {
  document.getElementById('fDOC')?.addEventListener('submit', guardarDOC);
  window.flotaDocumentos = { abrirParaVehiculo };
}
