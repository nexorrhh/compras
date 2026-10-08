// ============================================================
// Proveedores — agenda operativa por grupos/rubros.
//
// La pertenencia proveedor→grupo es explícita y muchos-a-muchos en
// compras_proveedores_grupos. Las OC enriquecen la ficha (historial,
// importe y última compra), pero ya no deciden a quién invitar.
// compras_articulos_grupo sigue existiendo para el filtro por rubro de
// Cotizaciones; es parametrización de artículos, no la agenda.
// ============================================================
import { SB } from '../supabase-client.js';
import { toast, om, cm, fmt, fetchAll, escAttr, escJsArg } from '../utils.js';

let GRUPOS = [];
let PROVEEDORES = [];
let PROVEEDORES_GRUPOS = [];
let CONTACTOS = [];
let OC_LINEAS = [];
let GRUPO_ACTUAL_ID = null;
let PROVEEDOR_ACTUAL_CONTACTO = null;
let SELECTOR_GRUPO_ID = null;

const ORDEN_ESTADO = { PREFERIDO: 0, ACTIVO: 1, ALTERNATIVO: 2, SUSPENDIDO: 3 };

function fmtPesos(n) {
  return '$' + Math.round(Number(n) || 0).toLocaleString('es-AR');
}

async function cargarTodo() {
  const [g, pv, pg, ct, oc] = await Promise.all([
    SB.from('compras_grupos').select('*').order('nombre'),
    fetchAll(() => SB.from('compras_proveedores').select('*').order('nombre')),
    fetchAll(() => SB.from('compras_proveedores_grupos').select('*')),
    fetchAll(() => SB.from('compras_proveedores_contactos').select('*')),
    fetchAll(() => SB.from('compras_oc_lineas').select('proveedor_cod,proveedor_nombre,articulo_cod,articulo_desc,importe,fecha,orden_compra')),
  ]);
  const error = g.error || pv.error || pg.error || ct.error || oc.error;
  if (error) throw error;
  GRUPOS = g.data || [];
  PROVEEDORES = pv.data || [];
  PROVEEDORES_GRUPOS = pg.data || [];
  CONTACTOS = ct.data || [];
  OC_LINEAS = oc.data || [];
  if (!GRUPO_ACTUAL_ID || !GRUPOS.some(x => x.id === GRUPO_ACTUAL_ID)) GRUPO_ACTUAL_ID = GRUPOS[0]?.id || null;
}

function proveedoresDetectados() {
  const codigosConFicha = new Set(PROVEEDORES.map(p => p.cod_tango).filter(Boolean));
  const vistos = new Set();
  const out = [];
  for (const l of OC_LINEAS) {
    if (!l.proveedor_cod || codigosConFicha.has(l.proveedor_cod) || vistos.has(l.proveedor_cod)) continue;
    vistos.add(l.proveedor_cod);
    out.push({ id: null, nombre: l.proveedor_nombre || l.proveedor_cod, cod_tango: l.proveedor_cod, virtual: true });
  }
  return out.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

function estadisticasCompras() {
  const map = new Map();
  for (const l of OC_LINEAS) {
    if (!l.proveedor_cod) continue;
    const r = map.get(l.proveedor_cod) || { total: 0, ordenes: new Set(), ultima: null };
    r.total += Number(l.importe) || 0;
    if (l.orden_compra) r.ordenes.add(l.orden_compra);
    if (l.fecha && (!r.ultima || l.fecha > r.ultima)) r.ultima = l.fecha;
    map.set(l.proveedor_cod, r);
  }
  return map;
}

function relacionesDeProveedor(proveedorId) {
  return PROVEEDORES_GRUPOS.filter(r => r.proveedor_id === proveedorId);
}

function gruposDeProveedor(proveedorId) {
  const ids = new Set(relacionesDeProveedor(proveedorId).map(r => r.grupo_id));
  return GRUPOS.filter(g => ids.has(g.id));
}

function contactoPrincipal(proveedorId) {
  const manual = CONTACTOS.find(c => c.proveedor_id === proveedorId);
  if (manual) return manual;
  const p = PROVEEDORES.find(x => x.id === proveedorId);
  return p && (p.telefono_tango || p.email_tango)
    ? { nombre: 'Contacto Tango', telefono: p.telefono_tango, email: p.email_tango, desdeTango: true }
    : null;
}

function badgeEstado(estado) {
  const clase = estado === 'PREFERIDO' ? 'prov-preferido' : estado === 'ALTERNATIVO' ? 'prov-alternativo' : estado === 'SUSPENDIDO' ? 'prov-suspendido' : 'vigente';
  const texto = { PREFERIDO: 'Preferido', ACTIVO: 'Activo', ALTERNATIVO: 'Alternativo', SUSPENDIDO: 'Suspendido' }[estado] || estado;
  return `<span class="badge ${clase}">${texto}</span>`;
}

function renderContactosDetalle(proveedorId) {
  const contactos = CONTACTOS.filter(c => c.proveedor_id === proveedorId);
  const p = PROVEEDORES.find(x => x.id === proveedorId);
  const tieneTango = p && (p.telefono_tango || p.email_tango);
  const filas = contactos.map(c => `<div class="contacto-row">
    <div><strong>${escAttr(c.nombre || 'Sin nombre')}</strong>${c.telefono ? ' · 📞 ' + escAttr(c.telefono) : ''}${c.email ? ' · ✉️ ' + escAttr(c.email) : ''}${c.notas ? ' · ' + escAttr(c.notas) : ''}</div>
    <button class="bsm d" onclick="window.proveedores.eliminarContacto('${c.id}')">🗑️</button>
  </div>`).join('') || (tieneTango ? '' : '<div class="text-muted" style="font-size:13px">Sin contactos todavía.</div>');
  const tango = tieneTango ? `<div class="contacto-row"><div><strong>Contacto Tango</strong>${p.telefono_tango ? ' · 📞 ' + escAttr(p.telefono_tango) : ''}${p.email_tango ? ' · ✉️ ' + escAttr(p.email_tango) : ''}</div><span class="badge vigente">Tango</span></div>` : '';
  return `${tango}${filas}<button class="bsm" style="margin-top:8px" onclick="window.proveedores.abrirContacto('${proveedorId}')">👤+ Agregar contacto</button>`;
}

function detalleProveedor(p) {
  const stats = estadisticasCompras().get(p.cod_tango);
  return `<div style="display:grid;grid-template-columns:minmax(260px,1fr) minmax(240px,1fr);gap:18px">
    <div><div class="psub" style="margin:0 0 7px">Contactos</div>${renderContactosDetalle(p.id)}</div>
    <div><div class="psub" style="margin:0 0 7px">Ficha e historial</div>
      <div style="font-size:13px;line-height:1.8"><strong>Grupos:</strong> ${gruposDeProveedor(p.id).map(g => escAttr(g.nombre)).join(', ') || 'Sin grupo'}<br>
      <strong>Órdenes de compra:</strong> ${stats?.ordenes.size || 0}<br><strong>Notas:</strong> ${escAttr(p.notas || '–')}</div>
    </div>
  </div>`;
}

function abrirNuevoGrupo() {
  const input = document.getElementById('pvg_nuevo_nombre');
  if (input) input.value = '';
  om('mNUEVOGRUPO');
  setTimeout(() => input?.focus(), 50);
}

async function crearGrupo(e) {
  e?.preventDefault();
  const input = document.getElementById('pvg_nuevo_nombre');
  const nombre = input?.value.trim();
  if (!nombre) { toast('Ingresá un nombre para el grupo', 'er'); input?.focus(); return; }
  if (GRUPOS.some(g => g.nombre.trim().toUpperCase() === nombre.toUpperCase())) {
    toast(`El grupo "${nombre}" ya existe`, 'er'); input?.focus(); input?.select(); return;
  }
  const { data, error } = await SB.from('compras_grupos').insert({ nombre }).select().single();
  if (error) { toast(error.message, 'er'); return; }
  GRUPOS.push(data);
  GRUPOS.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  GRUPO_ACTUAL_ID = data.id;
  toast(`✓ Grupo "${data.nombre}" creado`);
  cm('mNUEVOGRUPO');
  renderGrupos();
  abrirSelectorGrupo(data.id);
}

function candidatosParaGrupo(grupoId) {
  const asignados = new Set(PROVEEDORES_GRUPOS.filter(r => r.grupo_id === grupoId).map(r => r.proveedor_id));
  return [...PROVEEDORES.filter(p => !asignados.has(p.id) && p.estado !== 'SUSPENDIDO'), ...proveedoresDetectados()]
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

function renderSelectorGrupo() {
  const cont = document.getElementById('pvg_sel_lista');
  if (!cont || !SELECTOR_GRUPO_ID) return;
  const q = (document.getElementById('pvg_sel_buscar')?.value || '').trim().toUpperCase();
  const lista = candidatosParaGrupo(SELECTOR_GRUPO_ID).filter(p => !q || p.nombre.toUpperCase().includes(q) || (p.cod_tango || '').toUpperCase().includes(q));
  cont.innerHTML = lista.map(p => `<label class="prov-selector-item"><input type="checkbox" class="pvg-sel-check" data-id="${p.id || ''}" data-cod="${escAttr(p.cod_tango || '')}" data-nombre="${escAttr(p.nombre)}"><span><strong>${escAttr(p.nombre)}</strong>${p.virtual ? '<br><span class="text-muted">Detectado en OC · se incorporará automáticamente</span>' : p.sincronizado_tango_en ? '<br><span class="text-green">Actualizado desde Tango</span>' : ''}</span><span class="prov-selector-cod">${escAttr(p.cod_tango || 'Sin código')}</span></label>`).join('') || '<div class="empty">No hay proveedores disponibles para agregar</div>';
  const todos = document.getElementById('pvg_sel_todos'); if (todos) todos.checked = false;
}

function abrirSelectorGrupo(grupoId = GRUPO_ACTUAL_ID) {
  const grupo = GRUPOS.find(g => g.id === grupoId);
  if (!grupo) return;
  SELECTOR_GRUPO_ID = grupoId;
  document.getElementById('mPROVGRUPO_t').textContent = `Asignar proveedores a ${grupo.nombre}`;
  document.getElementById('pvg_sel_buscar').value = '';
  renderSelectorGrupo();
  om('mPROVGRUPO');
}

async function guardarSelectorGrupo() {
  const checks = [...document.querySelectorAll('.pvg-sel-check:checked')];
  if (!checks.length) { toast('Seleccioná al menos un proveedor', 'er'); return; }
  const proveedorIds = checks.filter(c => c.dataset.id).map(c => c.dataset.id);
  const virtuales = checks.filter(c => !c.dataset.id).map(c => ({ nombre: c.dataset.nombre, cod_tango: c.dataset.cod || null, estado: 'ACTIVO' }));
  if (virtuales.length) {
    const { data, error } = await SB.from('compras_proveedores').insert(virtuales).select();
    if (error) { toast(error.message, 'er'); return; }
    proveedorIds.push(...(data || []).map(p => p.id));
  }
  const rows = proveedorIds.map(proveedor_id => ({ proveedor_id, grupo_id: SELECTOR_GRUPO_ID, estado: 'ACTIVO', origen: 'MANUAL', actualizado_en: new Date().toISOString() }));
  const { error } = await SB.from('compras_proveedores_grupos').upsert(rows, { onConflict: 'proveedor_id,grupo_id', ignoreDuplicates: true });
  if (error) { toast(error.message, 'er'); return; }
  cm('mPROVGRUPO');
  toast(`✓ ${proveedorIds.length} proveedor${proveedorIds.length === 1 ? '' : 'es'} asignado${proveedorIds.length === 1 ? '' : 's'}`);
  await recargarSeccionActual();
}

async function eliminarGrupoActual() {
  const grupo = GRUPOS.find(g => g.id === GRUPO_ACTUAL_ID);
  if (!grupo || !confirm(`¿Eliminar el grupo "${grupo.nombre}"? Los proveedores no se borran; solo se quita esta clasificación.`)) return;
  const { error } = await SB.from('compras_grupos').delete().eq('id', grupo.id);
  if (error) { toast(error.message, 'er'); return; }
  PROVEEDORES_GRUPOS = PROVEEDORES_GRUPOS.filter(r => r.grupo_id !== grupo.id);
  GRUPOS = GRUPOS.filter(g => g.id !== grupo.id);
  GRUPO_ACTUAL_ID = GRUPOS[0]?.id || null;
  toast('Grupo eliminado');
  renderGrupos();
}

function renderListaGrupos() {
  const q = (document.getElementById('pvg_buscar_grupo')?.value || '').trim().toUpperCase();
  const cont = document.getElementById('pvg_lista_grupos');
  if (!cont) return;
  const lista = GRUPOS.filter(g => g.nombre.toUpperCase().includes(q));
  cont.innerHTML = lista.map(g => {
    const cant = PROVEEDORES_GRUPOS.filter(r => r.grupo_id === g.id && r.estado !== 'SUSPENDIDO').length;
    return `<button class="prov-grupo-item ${g.id === GRUPO_ACTUAL_ID ? 'active' : ''}" data-grupo="${g.id}"><span>${escAttr(g.nombre)}</span><span class="prov-grupo-count">${cant}</span></button>`;
  }).join('') || '<div class="empty">Sin grupos</div>';
}

function renderGrupoDetalle() {
  const grupo = GRUPOS.find(g => g.id === GRUPO_ACTUAL_ID);
  const titulo = document.getElementById('pvg_titulo');
  const resumen = document.getElementById('pvg_resumen');
  const tb = document.getElementById('t-prov-grupos');
  const agregar = document.getElementById('pvg_agregar');
  const eliminar = document.getElementById('pvg_eliminar');
  if (!tb) return;
  if (agregar) agregar.disabled = !grupo;
  if (eliminar) eliminar.disabled = !grupo;
  if (!grupo) {
    if (titulo) titulo.textContent = 'Creá tu primer grupo';
    if (resumen) resumen.textContent = '';
    tb.innerHTML = '<tr><td colspan="6" class="empty">Todavía no hay grupos de proveedores</td></tr>';
    return;
  }
  if (titulo) titulo.textContent = grupo.nombre;
  const relaciones = PROVEEDORES_GRUPOS.filter(r => r.grupo_id === grupo.id)
    .map(r => ({ r, p: PROVEEDORES.find(p => p.id === r.proveedor_id) })).filter(x => x.p)
    .sort((a, b) => (ORDEN_ESTADO[a.r.estado] - ORDEN_ESTADO[b.r.estado]) || a.p.nombre.localeCompare(b.p.nombre, 'es'));
  if (resumen) resumen.textContent = `${relaciones.length} proveedor${relaciones.length === 1 ? '' : 'es'} · la clasificación es manual`;
  const stats = estadisticasCompras();
  tb.innerHTML = relaciones.map(({ r, p }) => {
    const c = contactoPrincipal(p.id);
    const s = stats.get(p.cod_tango);
    return `<tr class="oc-row">
      <td><span class="oc-chevron">▸</span> ${escAttr(p.nombre)}${p.estado === 'SUSPENDIDO' ? ' ' + badgeEstado('SUSPENDIDO') : ''}</td>
      <td><select class="pvg-estado" data-prov="${p.id}" data-grupo="${grupo.id}"><option value="PREFERIDO" ${r.estado === 'PREFERIDO' ? 'selected' : ''}>Preferido</option><option value="ACTIVO" ${r.estado === 'ACTIVO' ? 'selected' : ''}>Activo</option><option value="ALTERNATIVO" ${r.estado === 'ALTERNATIVO' ? 'selected' : ''}>Alternativo</option><option value="SUSPENDIDO" ${r.estado === 'SUSPENDIDO' ? 'selected' : ''}>Suspendido</option></select></td>
      <td>${c ? `${escAttr(c.nombre || '')}${c.telefono ? '<br><span class="text-muted">' + escAttr(c.telefono) + '</span>' : ''}${c.email ? '<br><span class="text-muted">' + escAttr(c.email) + '</span>' : ''}` : '<span class="text-yellow">Falta contacto</span>'}</td>
      <td>${s?.ultima ? fmt(s.ultima) : '–'}</td><td>${s ? fmtPesos(s.total) : '–'}</td>
      <td><button class="bsm sto-accion" onclick="window.proveedores.abrirProveedor('${p.id}')">✏️</button> <button class="bsm d sto-accion" onclick="window.proveedores.quitarDeGrupo('${p.id}','${grupo.id}')">Quitar</button></td>
    </tr><tr class="oc-detail" style="display:none"><td colspan="6">${detalleProveedor(p)}</td></tr>`;
  }).join('') || '<tr><td colspan="6" class="empty">Este grupo todavía no tiene proveedores. Agregá uno nuevo o asigná uno existente desde el Directorio.</td></tr>';
}

function renderGrupos() {
  renderListaGrupos();
  renderGrupoDetalle();
}

async function cambiarEstadoRelacion(proveedorId, grupoId, estado) {
  const { error } = await SB.from('compras_proveedores_grupos').update({ estado, actualizado_en: new Date().toISOString() }).eq('proveedor_id', proveedorId).eq('grupo_id', grupoId);
  if (error) { toast(error.message, 'er'); return; }
  const rel = PROVEEDORES_GRUPOS.find(r => r.proveedor_id === proveedorId && r.grupo_id === grupoId);
  if (rel) rel.estado = estado;
  toast('✓ Estado actualizado');
  renderGrupos();
}

async function quitarDeGrupo(proveedorId, grupoId) {
  if (!confirm('¿Quitar este proveedor del grupo? Su ficha y su historial no se borran.')) return;
  const { error } = await SB.from('compras_proveedores_grupos').delete().eq('proveedor_id', proveedorId).eq('grupo_id', grupoId);
  if (error) { toast(error.message, 'er'); return; }
  PROVEEDORES_GRUPOS = PROVEEDORES_GRUPOS.filter(r => !(r.proveedor_id === proveedorId && r.grupo_id === grupoId));
  toast('Proveedor quitado del grupo');
  renderGrupos();
}

function filaAccionesProveedor(p) {
  return p.virtual
    ? `<button class="bsm y sto-accion" onclick="window.proveedores.incorporarDetectado('${escJsArg(p.cod_tango)}','${escJsArg(p.nombre)}')">Incorporar desde Tango</button>`
    : `<button class="bsm sto-accion" onclick="window.proveedores.abrirProveedor('${p.id}')">✏️</button> <button class="bsm d sto-accion" onclick="window.proveedores.eliminarProveedor('${p.id}')">🗑️</button>`;
}

async function incorporarDetectado(codTango, nombre) {
  if (!codTango || !nombre) return;
  const existente = PROVEEDORES.find(p => p.cod_tango === codTango);
  if (existente) { toast('Ese proveedor ya está incorporado'); return existente; }
  const { data, error } = await SB.from('compras_proveedores').insert({ nombre, cod_tango: codTango, estado: 'ACTIVO' }).select().single();
  if (error) { toast(error.message, 'er'); return null; }
  toast(`✓ ${nombre} incorporado desde Tango`);
  await recargarSeccionActual();
  return data;
}

function normalizarEncabezado(v) {
  return String(v ?? '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
}

async function importarProveedoresTango(file) {
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const sh = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sh, { header: 1, defval: null });
    if (!rows.length) throw new Error('El archivo está vacío');
    const headers = rows[0].map(normalizarEncabezado);
    const buscarCol = nombres => nombres.map(n => headers.indexOf(n)).find(i => i >= 0) ?? -1;
    const iCod = buscarCol(['COD_PROV', 'CODIGO_PROVEEDOR', 'CODIGO', 'COD_PROVEEDOR']);
    const iNom = buscarCol(['NOM_PROV', 'NOMBRE_PROVEEDOR', 'RAZON_SOCIAL', 'NOMBRE']);
    if (iCod < 0 || iNom < 0) throw new Error('No encontré las columnas de código y nombre. Se esperan COD_PROV/NOM_PROV o equivalentes.');
    const existentes = new Set(PROVEEDORES.map(p => p.cod_tango).filter(Boolean));
    const vistos = new Set();
    const nuevos = [];
    for (const r of rows.slice(1)) {
      const cod = String(r[iCod] ?? '').trim();
      const nombre = String(r[iNom] ?? '').trim();
      if (!cod || !nombre || existentes.has(cod) || vistos.has(cod)) continue;
      vistos.add(cod); nuevos.push({ cod_tango: cod, nombre, estado: 'ACTIVO' });
    }
    if (!nuevos.length) { toast('No hay proveedores nuevos para importar'); return; }
    for (let i = 0; i < nuevos.length; i += 500) {
      const { error } = await SB.from('compras_proveedores').insert(nuevos.slice(i, i + 500));
      if (error) throw error;
    }
    toast(`✓ ${nuevos.length} proveedor${nuevos.length === 1 ? '' : 'es'} importado${nuevos.length === 1 ? '' : 's'} desde Tango`);
    await recargarSeccionActual();
  } catch (error) { toast(error.message, 'er'); }
}

function renderDirectorio() {
  const q = (document.getElementById('pvp_f_q')?.value || '').trim().toUpperCase();
  poblarSelectGrupos('pvp_f_grupo', 'Todos los grupos');
  const grupoId = document.getElementById('pvp_f_grupo')?.value || '';
  const stats = estadisticasCompras();
  let lista = [...PROVEEDORES, ...proveedoresDetectados()];
  if (q) lista = lista.filter(p => p.nombre.toUpperCase().includes(q) || (p.cod_tango || '').toUpperCase().includes(q));
  if (grupoId) lista = lista.filter(p => p.id && PROVEEDORES_GRUPOS.some(r => r.proveedor_id === p.id && r.grupo_id === grupoId));
  lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const resumen = document.getElementById('pvp_resumen');
  if (resumen) resumen.textContent = `${lista.length} proveedor${lista.length === 1 ? '' : 'es'} · ${proveedoresDetectados().length} detectados en OC todavía sin ficha`;
  const tb = document.getElementById('t-prov-directorio');
  if (!tb) return;
  tb.innerHTML = lista.map(p => {
    const gs = p.id ? gruposDeProveedor(p.id) : [];
    const s = stats.get(p.cod_tango);
    const contactosCount = p.virtual ? '–' : Math.max(CONTACTOS.filter(c => c.proveedor_id === p.id).length, (p.telefono_tango || p.email_tango) ? 1 : 0);
    return `<tr class="oc-row"><td><span class="oc-chevron">▸</span> ${escAttr(p.nombre)}${p.virtual ? ' <span class="badge">detectado</span>' : ''}</td><td>${escAttr(p.cod_tango || '–')}</td><td>${gs.length ? gs.map(g => `<span class="badge cat-permiso">${escAttr(g.nombre)}</span>`).join(' ') : '<span class="text-muted">–</span>'}</td><td>${s ? fmtPesos(s.total) : '–'}</td><td>${contactosCount}</td><td>${filaAccionesProveedor(p)}</td></tr>
    <tr class="oc-detail" style="display:none"><td colspan="6">${p.virtual ? 'Detectado en Órdenes de Compra. Completá la ficha para asignarle grupos y contactos.' : detalleProveedor(p)}</td></tr>`;
  }).join('') || '<tr><td colspan="6" class="empty">Sin resultados</td></tr>';
}

function renderPendientes() {
  const detectados = proveedoresDetectados();
  const sinContacto = PROVEEDORES.filter(p => !CONTACTOS.some(c => c.proveedor_id === p.id) && !p.telefono_tango && !p.email_tango);
  const sinGrupo = PROVEEDORES.filter(p => !PROVEEDORES_GRUPOS.some(r => r.proveedor_id === p.id));
  const gruposVacios = GRUPOS.filter(g => !PROVEEDORES_GRUPOS.some(r => r.grupo_id === g.id));
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('pve_k_detectados', detectados.length); set('pve_k_sincontacto', sinContacto.length); set('pve_k_singrupo', sinGrupo.length); set('pve_k_gruposvacios', gruposVacios.length);
  const tipo = document.getElementById('pve_f_tipo')?.value || 'DETECTADO';
  const q = (document.getElementById('pve_f_q')?.value || '').trim().toUpperCase();
  let lista = tipo === 'SIN_CONTACTO' ? sinContacto : tipo === 'SIN_GRUPO' ? sinGrupo : detectados;
  if (q) lista = lista.filter(p => p.nombre.toUpperCase().includes(q) || (p.cod_tango || '').toUpperCase().includes(q));
  const motivo = tipo === 'SIN_CONTACTO' ? 'Sin contacto cargado' : tipo === 'SIN_GRUPO' ? 'Sin grupo asignado' : 'Detectado en OC, sin ficha propia';
  const tb = document.getElementById('t-prov-pendientes');
  if (!tb) return;
  tb.innerHTML = lista.map(p => `<tr><td>${escAttr(p.nombre)}</td><td>${escAttr(p.cod_tango || '–')}</td><td>${motivo}</td><td>${p.virtual ? `<button class="bsm y" onclick="window.proveedores.incorporarDetectado('${escJsArg(p.cod_tango)}','${escJsArg(p.nombre)}')">Incorporar desde Tango</button>` : `<button class="bsm" onclick="window.proveedores.abrirProveedor('${p.id}')">Completar</button>`}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">No hay pendientes de este tipo</td></tr>';
}

function poblarSelectGrupos(id, vacioLabel = 'Sin grupo') {
  const sel = document.getElementById(id);
  if (!sel) return;
  const actual = sel.value;
  sel.innerHTML = `<option value="">${vacioLabel}</option>` + GRUPOS.map(g => `<option value="${g.id}">${escAttr(g.nombre)}</option>`).join('');
  if ([...sel.options].some(o => o.value === actual)) sel.value = actual;
}

function renderChecksGrupos(seleccionados = new Set()) {
  const cont = document.getElementById('pv_grupos');
  if (!cont) return;
  cont.innerHTML = GRUPOS.map(g => `<label><input type="checkbox" class="pv-grupo-check" value="${g.id}" ${seleccionados.has(g.id) ? 'checked' : ''}> ${escAttr(g.nombre)}</label>`).join('') || '<span class="text-muted">Primero creá un grupo</span>';
}

function poblarDatalistProveedoresOC() {
  const dl = document.getElementById('pv_dl_oc');
  if (!dl) return;
  const vistos = new Map();
  for (const l of OC_LINEAS) if (l.proveedor_cod && !vistos.has(l.proveedor_cod)) vistos.set(l.proveedor_cod, l.proveedor_nombre);
  dl.innerHTML = [...vistos].map(([cod, nom]) => `<option value="${escAttr(cod)}">${escAttr(nom || '')}</option>`).join('');
}

function abrirProveedor(id) {
  poblarDatalistProveedoresOC();
  const p = id ? PROVEEDORES.find(x => x.id === id) : null;
  const seleccionados = new Set(p ? relacionesDeProveedor(p.id).map(r => r.grupo_id) : []);
  renderChecksGrupos(seleccionados);
  document.getElementById('mPROVEEDOR_t').textContent = p ? '✏️ Editar proveedor' : '+ Nuevo proveedor';
  document.getElementById('pv_id').value = p?.id || '';
  document.getElementById('pv_nombre').value = p?.nombre || '';
  document.getElementById('pv_codtango').value = p?.cod_tango || '';
  document.getElementById('pv_estado').value = p?.estado || 'ACTIVO';
  document.getElementById('pv_notas').value = p?.notas || '';
  document.getElementById('pv_ct_nombre').value = '';
  document.getElementById('pv_ct_telefono').value = '';
  document.getElementById('pv_ct_email').value = '';
  om('mPROVEEDOR');
}

async function sincronizarGruposProveedor(proveedorId) {
  const elegidos = new Set([...document.querySelectorAll('.pv-grupo-check:checked')].map(c => c.value));
  const actuales = new Set(relacionesDeProveedor(proveedorId).map(r => r.grupo_id));
  const agregar = [...elegidos].filter(id => !actuales.has(id));
  const quitar = [...actuales].filter(id => !elegidos.has(id));
  if (agregar.length) {
    const rows = agregar.map(grupo_id => ({ proveedor_id: proveedorId, grupo_id, estado: 'ACTIVO', origen: 'MANUAL', actualizado_en: new Date().toISOString() }));
    const { error } = await SB.from('compras_proveedores_grupos').insert(rows);
    if (error) throw error;
  }
  for (const grupoId of quitar) {
    const { error } = await SB.from('compras_proveedores_grupos').delete().eq('proveedor_id', proveedorId).eq('grupo_id', grupoId);
    if (error) throw error;
  }
}

async function guardarProveedor(e) {
  e.preventDefault();
  const id = document.getElementById('pv_id').value;
  const payload = { nombre: document.getElementById('pv_nombre').value.trim(), cod_tango: document.getElementById('pv_codtango').value.trim() || null, estado: document.getElementById('pv_estado').value, notas: document.getElementById('pv_notas').value.trim() || null, actualizado_en: new Date().toISOString() };
  let proveedorId = id;
  if (id) {
    const { error } = await SB.from('compras_proveedores').update(payload).eq('id', id);
    if (error) { toast(error.message, 'er'); return; }
  } else {
    const { data, error } = await SB.from('compras_proveedores').insert(payload).select().single();
    if (error) { toast(error.message, 'er'); return; }
    proveedorId = data.id;
  }
  try { await sincronizarGruposProveedor(proveedorId); } catch (error) { toast('Proveedor guardado, pero no se pudieron actualizar los grupos: ' + error.message, 'er'); return; }
  const nombre = document.getElementById('pv_ct_nombre').value.trim();
  const telefono = document.getElementById('pv_ct_telefono').value.trim();
  const email = document.getElementById('pv_ct_email').value.trim();
  if (nombre || telefono || email) {
    const { error } = await SB.from('compras_proveedores_contactos').insert({ proveedor_id: proveedorId, nombre: nombre || null, telefono: telefono || null, email: email || null });
    if (error) toast('Proveedor guardado, pero el contacto no se pudo guardar: ' + error.message, 'er');
  }
  toast(id ? '✓ Proveedor actualizado' : '✓ Proveedor agregado');
  cm('mPROVEEDOR');
  await recargarSeccionActual();
}

async function eliminarProveedor(id) {
  if (!confirm('¿Eliminar este proveedor? También se borran sus contactos y asignaciones a grupos.')) return;
  const { error } = await SB.from('compras_proveedores').delete().eq('id', id);
  if (error) { toast(error.message, 'er'); return; }
  toast('Proveedor eliminado');
  await recargarSeccionActual();
}

function abrirContacto(proveedorId) { PROVEEDOR_ACTUAL_CONTACTO = proveedorId; document.getElementById('fCONTACTO').reset(); om('mCONTACTO'); }

async function guardarContacto(e) {
  e.preventDefault();
  const nombre = document.getElementById('ct_nombre').value.trim();
  const telefono = document.getElementById('ct_telefono').value.trim();
  const email = document.getElementById('ct_email').value.trim();
  if (!nombre && !telefono && !email) { toast('Ingresá al menos un dato de contacto', 'er'); return; }
  const { error } = await SB.from('compras_proveedores_contactos').insert({ proveedor_id: PROVEEDOR_ACTUAL_CONTACTO, nombre: nombre || null, telefono: telefono || null, email: email || null, notas: document.getElementById('ct_notas').value.trim() || null });
  if (error) { toast(error.message, 'er'); return; }
  cm('mCONTACTO'); toast('✓ Contacto agregado'); await recargarSeccionActual();
}

async function eliminarContacto(id) {
  if (!confirm('¿Eliminar este contacto?')) return;
  const { error } = await SB.from('compras_proveedores_contactos').delete().eq('id', id);
  if (error) { toast(error.message, 'er'); return; }
  toast('Contacto eliminado'); await recargarSeccionActual();
}

function initExpandCollapse(tbodyId) {
  document.getElementById(tbodyId)?.addEventListener('click', e => {
    if (e.target.closest('.sto-accion') || e.target.closest('select') || e.target.closest('button')) return;
    const row = e.target.closest('.oc-row');
    if (!row) return;
    const detail = row.nextElementSibling;
    if (!detail?.classList.contains('oc-detail')) return;
    const abierto = detail.style.display !== 'none';
    detail.style.display = abierto ? 'none' : '';
    const ch = row.querySelector('.oc-chevron'); if (ch) ch.textContent = abierto ? '▸' : '▾';
  });
}

function renderSeccion(secId) {
  if (secId === 'prov-directorio') return renderDirectorio();
  if (secId === 'prov-pendientes') return renderPendientes();
  renderGrupos();
}

async function recargarSeccionActual() {
  const secId = document.querySelector('.sec.on')?.id?.replace(/^s-/, '') || 'prov-grupos';
  await renderSeccionConCarga(secId);
}

async function renderSeccionConCarga(secId) {
  try { await cargarTodo(); renderSeccion(secId); }
  catch (error) { toast('Proveedores: ' + error.message, 'er'); }
}

export async function render(secId) { await renderSeccionConCarga(secId); }

export function init() {
  document.getElementById('pvg_nuevo_grupo')?.addEventListener('click', abrirNuevoGrupo);
  document.getElementById('fNUEVOGRUPO')?.addEventListener('submit', crearGrupo);
  document.querySelectorAll('.prov-grupo-ejemplos [data-nombre]').forEach(btn => btn.addEventListener('click', () => {
    const input = document.getElementById('pvg_nuevo_nombre'); if (input) { input.value = btn.dataset.nombre; input.focus(); }
  }));
  document.getElementById('pvg_eliminar')?.addEventListener('click', eliminarGrupoActual);
  document.getElementById('pvg_buscar_grupo')?.addEventListener('input', renderListaGrupos);
  document.getElementById('pvg_lista_grupos')?.addEventListener('click', e => { const b = e.target.closest('[data-grupo]'); if (!b) return; GRUPO_ACTUAL_ID = b.dataset.grupo; renderGrupos(); });
  document.getElementById('pvg_agregar')?.addEventListener('click', () => abrirSelectorGrupo());
  document.getElementById('pvg_sel_buscar')?.addEventListener('input', renderSelectorGrupo);
  document.getElementById('pvg_sel_todos')?.addEventListener('change', e => { document.querySelectorAll('.pvg-sel-check').forEach(c => { c.checked = e.target.checked; }); });
  document.getElementById('pvg_sel_guardar')?.addEventListener('click', guardarSelectorGrupo);
  document.getElementById('t-prov-grupos')?.addEventListener('change', e => { const s = e.target.closest('.pvg-estado'); if (s) cambiarEstadoRelacion(s.dataset.prov, s.dataset.grupo, s.value); });
  document.getElementById('pvp_f_q')?.addEventListener('input', renderDirectorio);
  document.getElementById('pvp_f_grupo')?.addEventListener('change', renderDirectorio);
  document.getElementById('pvp_importar')?.addEventListener('click', () => document.getElementById('pvp_import_file')?.click());
  document.getElementById('pvp_import_file')?.addEventListener('change', e => { const file = e.target.files[0]; e.target.value = ''; if (file) importarProveedoresTango(file); });
  document.getElementById('pve_f_tipo')?.addEventListener('change', renderPendientes);
  document.getElementById('pve_f_q')?.addEventListener('input', renderPendientes);
  document.getElementById('fPROVEEDOR')?.addEventListener('submit', guardarProveedor);
  document.getElementById('fCONTACTO')?.addEventListener('submit', guardarContacto);
  initExpandCollapse('t-prov-grupos'); initExpandCollapse('t-prov-directorio');
  window.proveedores = { abrirProveedor, eliminarProveedor, abrirContacto, eliminarContacto, incorporarDetectado, quitarDeGrupo };
}
