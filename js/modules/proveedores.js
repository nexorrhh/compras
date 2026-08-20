// ============================================================
// Módulo Proveedores — agenda de compras por rubro (grupo).
// Sin relación con Flota, OC o Stock como tablas, pero SE ALIMENTA
// de Órdenes de Compra: en vez de asignarle un grupo a mano a cada
// proveedor, se clasifican ARTÍCULOS por grupo (ej. "PINTURA EPOXI"
// → grupo Pintura) y el proveedor queda asociado a ese grupo solo,
// cruzando compras_oc_lineas.proveedor_cod (vía cod_tango) con
// compras_articulos_grupo — para atrás y para adelante, sin volver
// a tocar nada del lado del proveedor. Ver CLAUDE.md sección 7.
//
// Los proveedores sin ninguna OC todavía (solo cotizaron) usan
// grupo_manual_id como respaldo, porque no hay artículos de OC de
// donde derivar nada.
// ============================================================
import { SB } from '../supabase-client.js';
import { toast, om, cm, fmt, fetchAll, escAttr, escJsArg } from '../utils.js';

let GRUPOS = [];
let ARTICULOS_GRUPO = [];
let PROVEEDORES = [];
let CONTACTOS = [];
let OC_LINEAS = [];
let ARTICULOS_CONOCIDOS = new Map(); // cod_articulo -> descripcion (de OC + Stock)
let PROVEEDOR_ACTUAL_CONTACTO = null; // id de proveedor para el modal de contacto

function fmtPesos(n) {
  return '$' + Math.round(Number(n) || 0).toLocaleString('es-AR');
}

// ------------------------------------------------------------
// Carga de datos
// ------------------------------------------------------------
async function cargarTodo() {
  const [g, ag, pv, ct, oc, sto] = await Promise.all([
    SB.from('compras_grupos').select('*').order('nombre'),
    fetchAll(() => SB.from('compras_articulos_grupo').select('*')),
    SB.from('compras_proveedores').select('*').order('nombre'),
    SB.from('compras_proveedores_contactos').select('*'),
    fetchAll(() => SB.from('compras_oc_lineas').select('proveedor_cod,proveedor_nombre,articulo_cod,articulo_desc,importe,fecha,orden_compra')),
    fetchAll(() => SB.from('compras_stock_saldos').select('cod_articulo,descripcion')),
  ]);
  const error = g.error || ag.error || pv.error || ct.error || oc.error || sto.error;
  if (error) throw error;

  GRUPOS = g.data || [];
  ARTICULOS_GRUPO = ag.data || [];
  PROVEEDORES = pv.data || [];
  CONTACTOS = ct.data || [];
  OC_LINEAS = oc.data || [];

  ARTICULOS_CONOCIDOS = new Map();
  for (const l of OC_LINEAS) {
    if (!l.articulo_cod || esCodigoOT(l.articulo_desc)) continue;
    ARTICULOS_CONOCIDOS.set(l.articulo_cod, l.articulo_desc || ARTICULOS_CONOCIDOS.get(l.articulo_cod) || '');
  }
  for (const s of (sto.data || [])) if (s.cod_articulo && !ARTICULOS_CONOCIDOS.has(s.cod_articulo)) ARTICULOS_CONOCIDOS.set(s.cod_articulo, s.descripcion || '');
}

// Códigos "O/T ..." / "OTT ..." — trabajo tercerizado atado a una orden de
// trabajo puntual, ya con un solo subcontratista asignado en Tango. No es
// un artículo de catálogo real: se excluye de Clasificar artículos para
// que no ensucie compras_articulos_grupo (pedido explícito del usuario).
function esCodigoOT(desc) {
  return /^O\/?TT?\s/i.test((desc || '').trim());
}

// ------------------------------------------------------------
// Derivación proveedor → grupo(s), a partir de qué artículos
// (ya clasificados) le compró cada proveedor por OC.
// ------------------------------------------------------------
function derivarGruposPorProveedor() {
  const artGrupo = new Map(ARTICULOS_GRUPO.map(a => [a.cod_articulo, a.grupo_id]));
  const map = new Map(); // proveedor_cod -> Set(grupo_id)
  for (const l of OC_LINEAS) {
    if (!l.proveedor_cod || !l.articulo_cod) continue;
    const grupoId = artGrupo.get(l.articulo_cod);
    if (!grupoId) continue;
    if (!map.has(l.proveedor_cod)) map.set(l.proveedor_cod, new Set());
    map.get(l.proveedor_cod).add(grupoId);
  }
  return map;
}

function gruposDeProveedor(p, derivado) {
  const set = new Set(derivado.get(p.cod_tango) || []);
  if (p.grupo_manual_id) set.add(p.grupo_manual_id);
  const grupoNombre = new Map(GRUPOS.map(g => [g.id, g.nombre]));
  return [...set].map(id => grupoNombre.get(id)).filter(Boolean);
}

// ------------------------------------------------------------
// Si un proveedor ya tiene OC, tiene que aparecer dado de alta solo
// — no tendría sentido que el Ranking lo muestre y el Catálogo no.
// Esta función junta los proveedores con ficha propia
// (compras_proveedores) con los que solo existen en compras_oc_lineas
// (todavía sin ficha), marcando estos últimos como `virtual: true`.
// ------------------------------------------------------------
function obtenerTodosLosProveedores() {
  const conFicha = [...PROVEEDORES];
  const codTangoConFicha = new Set(PROVEEDORES.map(p => p.cod_tango).filter(Boolean));
  const vistos = new Set();
  for (const l of OC_LINEAS) {
    if (!l.proveedor_cod || codTangoConFicha.has(l.proveedor_cod) || vistos.has(l.proveedor_cod)) continue;
    vistos.add(l.proveedor_cod);
    conFicha.push({ id: null, nombre: l.proveedor_nombre || l.proveedor_cod, cod_tango: l.proveedor_cod, grupo_manual_id: null, notas: null, virtual: true });
  }
  return conFicha;
}

// ------------------------------------------------------------
// Ranking de compras por proveedor (sale directo de OC).
// ------------------------------------------------------------
function calcularRanking() {
  const map = new Map(); // proveedor_cod||nombre -> acumulado
  for (const l of OC_LINEAS) {
    const key = l.proveedor_cod || l.proveedor_nombre || '—';
    if (!map.has(key)) map.set(key, { proveedor_cod: l.proveedor_cod, nombre: l.proveedor_nombre || l.proveedor_cod || 'Sin nombre', total: 0, ordenes: new Set(), ultima: null });
    const r = map.get(key);
    r.total += l.importe || 0;
    if (l.orden_compra) r.ordenes.add(l.orden_compra);
    if (l.fecha && (!r.ultima || l.fecha > r.ultima)) r.ultima = l.fecha;
  }
  return [...map.values()].map(r => ({ ...r, cantOrdenes: r.ordenes.size })).sort((a, b) => b.total - a.total);
}

// ------------------------------------------------------------
// Selects de grupo (con opción de crear uno nuevo al vuelo)
// ------------------------------------------------------------
function poblarSelectGrupos(selectId, { conVacio = true, vacioLabel = 'Sin grupo' } = {}) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const cur = sel.value;
  const opciones = [];
  if (conVacio) opciones.push(`<option value="">${vacioLabel}</option>`);
  opciones.push(...GRUPOS.map(g => `<option value="${g.id}">${g.nombre}</option>`));
  sel.innerHTML = opciones.join('');
  if ([...sel.options].some(o => o.value === cur)) sel.value = cur;
}

async function crearGrupo() {
  const nombre = prompt('Nombre del grupo (ej. Pintura, Granalla, Ferretería):');
  if (!nombre || !nombre.trim()) return;
  const { data, error } = await SB.from('compras_grupos').insert({ nombre: nombre.trim() }).select().single();
  if (error) { toast(error.message, 'er'); return; }
  toast(`✓ Grupo "${data.nombre}" creado`);
  GRUPOS.push(data);
  GRUPOS.sort((a, b) => a.nombre.localeCompare(b.nombre));
  const secId = document.querySelector('.sec.on')?.id?.replace(/^s-/, '');
  if (secId) renderSeccion(secId);
  return data;
}

// ------------------------------------------------------------
// Dashboard
// ------------------------------------------------------------
function renderDashboard() {
  const ranking = calcularRanking();
  const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setTxt('pvd_k_proveedores', obtenerTodosLosProveedores().length);
  setTxt('pvd_k_grupos', GRUPOS.length);
  setTxt('pvd_k_articulos', ARTICULOS_GRUPO.length);
  setTxt('pvd_k_top', ranking[0] ? `${ranking[0].nombre}` : '–');
  const topEl = document.getElementById('pvd_k_top');
  if (topEl && ranking[0]) topEl.title = fmtPesos(ranking[0].total);
}

// ------------------------------------------------------------
// Agenda — proveedores agrupados por rubro elegido, con contactos.
// ------------------------------------------------------------
function renderContactosDetalle(proveedorId) {
  const contactos = CONTACTOS.filter(c => c.proveedor_id === proveedorId);
  const filas = contactos.map(c => `<div class="contacto-row">
    <div><strong>${c.nombre || 'Sin nombre'}</strong>${c.telefono ? ' · 📞 ' + c.telefono : ''}${c.email ? ' · ✉️ ' + c.email : ''}${c.notas ? ' · ' + c.notas : ''}</div>
    <button class="bsm d" onclick="window.proveedores.eliminarContacto('${c.id}')">🗑️</button>
  </div>`).join('') || '<div style="color:var(--muted);font-size:13px;padding:4px 0">Sin contactos todavía.</div>';
  return `${filas}<button class="bsm" style="margin-top:8px" onclick="window.proveedores.abrirContacto('${proveedorId}')">👤+ Agregar contacto</button>`;
}

function filaAccionesProveedor(p) {
  return p.virtual
    ? `<button class="bsm y sto-accion" onclick="window.proveedores.agregarCandidato('${escJsArg(p.cod_tango)}', '${escJsArg(p.nombre)}')">➕ Completar datos</button>`
    : `<button class="bsm sto-accion" onclick="window.proveedores.abrirProveedor('${p.id}')">✏️</button>
       <button class="bsm d sto-accion" onclick="window.proveedores.eliminarProveedor('${p.id}')">🗑️</button>`;
}

function filaDetalleProveedor(p) {
  if (p.virtual) return '<div style="color:var(--muted);font-size:13px;padding:4px 0">Detectado en Órdenes de Compra — todavía no tiene ficha propia. Tocá "Completar datos" para poder agregarle contactos.</div>';
  return renderContactosDetalle(p.id);
}

function renderAgenda() {
  poblarSelectGrupos('pva_f_grupo', { conVacio: false });
  const grupoId = document.getElementById('pva_f_grupo')?.value;
  const tb = document.getElementById('t-prov-agenda');
  if (!tb) return;

  if (!GRUPOS.length) {
    tb.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:18px;color:var(--muted)">Todavía no creaste ningún grupo</td></tr>';
    return;
  }

  const derivado = derivarGruposPorProveedor();
  const ranking = new Map(calcularRanking().map(r => [r.proveedor_cod, r]));
  const proveedores = obtenerTodosLosProveedores().filter(p => (p.cod_tango && derivado.get(p.cod_tango)?.has(grupoId)) || p.grupo_manual_id === grupoId);

  if (!proveedores.length) {
    tb.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:18px;color:var(--muted)">Sin proveedores en este grupo todavía</td></tr>';
    return;
  }
  tb.innerHTML = proveedores.map(p => {
    const r = p.cod_tango ? ranking.get(p.cod_tango) : null;
    return `<tr class="oc-row">
      <td><span class="oc-chevron">▸</span> ${p.nombre}${p.virtual ? ' <span class="badge" style="opacity:.6">detectado</span>' : ''}</td>
      <td>${p.cod_tango || '–'}</td>
      <td>${r ? fmtPesos(r.total) : '–'}</td>
      <td>${r ? fmt(r.ultima) : '–'}</td>
      <td>${p.virtual ? '–' : CONTACTOS.filter(c => c.proveedor_id === p.id).length}</td>
      <td>${filaAccionesProveedor(p)}</td>
    </tr>
    <tr class="oc-detail" style="display:none"><td colspan="6">${filaDetalleProveedor(p)}</td></tr>`;
  }).join('');
}

function agregarCandidato(codTango, nombre) {
  abrirProveedor(null, { nombre, cod_tango: codTango });
}

// ------------------------------------------------------------
// Ranking
// ------------------------------------------------------------
function renderRanking() {
  const q = (document.getElementById('pvr_f_q')?.value || '').trim().toUpperCase();
  let ranking = calcularRanking();
  if (q) ranking = ranking.filter(r => (r.nombre || '').toUpperCase().includes(q) || (r.proveedor_cod || '').toUpperCase().includes(q));

  const resumen = document.getElementById('pvr_resumen');
  if (resumen) resumen.textContent = `${ranking.length} proveedor${ranking.length === 1 ? '' : 'es'} con compras registradas`;

  const tb = document.getElementById('t-prov-ranking');
  if (!tb) return;
  if (!ranking.length) { tb.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:18px;color:var(--muted)">Sin resultados</td></tr>'; return; }
  tb.innerHTML = ranking.map(r => `<tr>
    <td>${r.nombre}</td>
    <td>${fmtPesos(r.total)}</td>
    <td>${r.cantOrdenes}</td>
    <td>${fmt(r.ultima)}</td>
  </tr>`).join('');
}

// ------------------------------------------------------------
// Clasificar artículos por grupo
// ------------------------------------------------------------
function renderClasificar() {
  const q = (document.getElementById('pvc_f_q')?.value || '').trim().toUpperCase();
  const soloSinClasificar = document.getElementById('pvc_f_sinclasificar')?.checked;
  const grupoMap = new Map(ARTICULOS_GRUPO.map(a => [a.cod_articulo, a]));

  let lista;
  let totalSinClasificar = null;
  if (q.length >= 2) {
    lista = [...ARTICULOS_CONOCIDOS.entries()].filter(([cod, desc]) => cod.toUpperCase().includes(q) || (desc || '').toUpperCase().includes(q));
    if (soloSinClasificar) lista = lista.filter(([cod]) => !grupoMap.has(cod));
  } else if (soloSinClasificar) {
    lista = [...ARTICULOS_CONOCIDOS.entries()].filter(([cod]) => !grupoMap.has(cod));
    totalSinClasificar = lista.length;
  } else {
    lista = ARTICULOS_GRUPO.map(a => [a.cod_articulo, a.descripcion]);
  }
  lista.sort((a, b) => a[0].localeCompare(b[0]));
  lista = lista.slice(0, 300);

  const resumen = document.getElementById('pvc_resumen');
  if (resumen) {
    if (totalSinClasificar !== null) {
      resumen.textContent = totalSinClasificar > 300
        ? `Mostrando 300 de ${totalSinClasificar} artículos sin clasificar todavía`
        : `${totalSinClasificar} artículo${totalSinClasificar === 1 ? '' : 's'} sin clasificar todavía`;
    } else if (q.length >= 2) {
      resumen.textContent = `${lista.length} resultado${lista.length === 1 ? '' : 's'}`;
    } else {
      resumen.textContent = `${ARTICULOS_GRUPO.length} artículo${ARTICULOS_GRUPO.length === 1 ? '' : 's'} clasificados — buscá o tildá "Solo sin clasificar" para ver más`;
    }
  }

  const tb = document.getElementById('t-prov-clasificar');
  if (!tb) return;
  if (!lista.length) { tb.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:18px;color:var(--muted)">Sin resultados</td></tr>'; return; }

  tb.innerHTML = lista.map(([cod, desc]) => {
    const actual = grupoMap.get(cod);
    const options = ['<option value="">Sin grupo</option>', ...GRUPOS.map(g => `<option value="${g.id}" ${actual?.grupo_id === g.id ? 'selected' : ''}>${g.nombre}</option>`)].join('');
    return `<tr>
      <td><input type="checkbox" class="pvc-check-row" data-cod="${escAttr(cod)}" data-desc="${escAttr(desc)}" style="width:auto"></td>
      <td>${cod}</td>
      <td>${desc || ''}</td>
      <td><select class="pvc-grupo-sel" data-cod="${escAttr(cod)}" data-desc="${escAttr(desc)}">${options}</select></td>
    </tr>`;
  }).join('');

  poblarSelectBulkGrupo();
  document.getElementById('pvc_check_all').checked = false;
  actualizarBarraMasiva();
}

function poblarSelectBulkGrupo() {
  const sel = document.getElementById('pvc_bulk_grupo');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">Elegí un grupo...</option>' +
    GRUPOS.map(g => `<option value="${g.id}">${g.nombre}</option>`).join('') +
    '<option value="__NONE__">— Quitar grupo —</option>';
  const valores = ['', '__NONE__', ...GRUPOS.map(g => g.id)];
  if (valores.includes(cur)) sel.value = cur;
}

function actualizarBarraMasiva() {
  const seleccionados = document.querySelectorAll('.pvc-check-row:checked').length;
  const cuenta = document.getElementById('pvc_bulk_count');
  if (cuenta) cuenta.textContent = `${seleccionados} seleccionado${seleccionados === 1 ? '' : 's'}`;
  const btn = document.getElementById('pvc_bulk_aplicar');
  if (btn) btn.disabled = seleccionados === 0;
}

// Tocar y arrastrar sobre la columna de checkboxes para ir tildando
// varias filas seguidas, en vez de click por click (pedido del
// usuario). El estado del primer checkbox tocado define si el
// arrastre tilda o destilda ("pintar" al estilo planilla de cálculo).
// Se engancha una sola vez en init() — la delegación en el <tbody>
// sigue funcionando aunque renderClasificar() reemplace las filas.
function initArrastreSeleccion(tbodyId) {
  const tb = document.getElementById(tbodyId);
  if (!tb) return;
  let modo = null; // null | 'tildar' | 'destildar'

  tb.addEventListener('mousedown', e => {
    const check = e.target.closest('.pvc-check-row');
    if (!check) return;
    modo = check.checked ? 'destildar' : 'tildar';
    check.checked = modo === 'tildar';
    actualizarBarraMasiva();
    document.body.style.userSelect = 'none';
  });

  tb.addEventListener('mouseover', e => {
    if (!modo) return;
    const check = e.target.closest('tr')?.querySelector('.pvc-check-row');
    if (!check) return;
    check.checked = modo === 'tildar';
    actualizarBarraMasiva();
  });

  // El toggle ya se hizo a mano arriba (mousedown/mouseover) — sin esto,
  // un click simple (mousedown+mouseup sobre el mismo checkbox SÍ dispara
  // "click") deja que el navegador alterne el estado de nuevo por su
  // cuenta y pisa lo que acabamos de hacer, especialmente notorio al
  // destildar: quedaba tildado para siempre. preventDefault() en
  // mousedown no alcanza para frenar esto — hay que frenarlo en el click.
  tb.addEventListener('click', e => {
    if (e.target.closest('.pvc-check-row')) e.preventDefault();
  });

  document.addEventListener('mouseup', () => {
    modo = null;
    document.body.style.userSelect = '';
  });
}

// Asignar (o quitar) un grupo a todos los artículos tildados de una — para
// no tener que tocar el <select> de a uno cuando son muchos del mismo
// rubro (ej. filtrar por "BUL" y mandar los 200 resultados a Bulones).
async function aplicarGrupoMasivo() {
  const grupoSel = document.getElementById('pvc_bulk_grupo')?.value || '';
  const checks = Array.from(document.querySelectorAll('.pvc-check-row:checked'));
  if (!checks.length) { toast('Seleccioná al menos un artículo', 'er'); return; }
  if (!grupoSel) { toast('Elegí un grupo', 'er'); return; }

  const cods = checks.map(c => c.dataset.cod);
  if (grupoSel === '__NONE__') {
    // Se borra en tandas de 100: con muchos códigos, un filtro in.(...)
    // con todos juntos puede generar una URL demasiado larga (mismo
    // problema que se corrigió en Órdenes de Compra).
    for (let i = 0; i < cods.length; i += 100) {
      const { error } = await SB.from('compras_articulos_grupo').delete().in('cod_articulo', cods.slice(i, i + 100));
      if (error) { toast(error.message, 'er'); return; }
    }
    ARTICULOS_GRUPO = ARTICULOS_GRUPO.filter(a => !cods.includes(a.cod_articulo));
    toast(`Grupo quitado de ${cods.length} artículo${cods.length === 1 ? '' : 's'}`);
  } else {
    const filas = checks.map(c => ({ cod_articulo: c.dataset.cod, descripcion: c.dataset.desc || null, grupo_id: grupoSel, actualizado_en: new Date().toISOString() }));
    const { data, error } = await SB.from('compras_articulos_grupo').upsert(filas, { onConflict: 'cod_articulo' }).select();
    if (error) { toast(error.message, 'er'); return; }
    const nuevos = new Map((data || []).map(d => [d.cod_articulo, d]));
    ARTICULOS_GRUPO = [...ARTICULOS_GRUPO.filter(a => !nuevos.has(a.cod_articulo)), ...nuevos.values()];
    toast(`✓ ${cods.length} artículo${cods.length === 1 ? '' : 's'} asignados`);
  }
  renderClasificar();
}

async function asignarGrupoArticulo(cod, desc, grupoId) {
  if (!grupoId) {
    const { error } = await SB.from('compras_articulos_grupo').delete().eq('cod_articulo', cod);
    if (error) { toast(error.message, 'er'); return; }
    ARTICULOS_GRUPO = ARTICULOS_GRUPO.filter(a => a.cod_articulo !== cod);
    toast(`"${cod}" sin grupo`);
    return;
  }
  const { data, error } = await SB.from('compras_articulos_grupo').upsert({
    cod_articulo: cod, descripcion: desc || null, grupo_id: grupoId, actualizado_en: new Date().toISOString(),
  }, { onConflict: 'cod_articulo' }).select().single();
  if (error) { toast(error.message, 'er'); return; }
  ARTICULOS_GRUPO = [...ARTICULOS_GRUPO.filter(a => a.cod_articulo !== cod), data];
  toast(`✓ "${cod}" asignado`);
}

// ------------------------------------------------------------
// Catálogo de proveedores (CRUD)
// ------------------------------------------------------------
function renderCatalogo() {
  const q = (document.getElementById('pvp_f_q')?.value || '').trim().toUpperCase();
  poblarSelectGrupos('pvp_f_grupo', { conVacio: true, vacioLabel: 'Todos los grupos' });
  const grupoFiltroId = document.getElementById('pvp_f_grupo')?.value || '';
  const grupoFiltroNombre = grupoFiltroId ? GRUPOS.find(g => g.id === grupoFiltroId)?.nombre : '';
  const derivado = derivarGruposPorProveedor();
  const ranking = new Map(calcularRanking().map(r => [r.proveedor_cod, r]));

  let proveedores = obtenerTodosLosProveedores().map(p => ({ ...p, _grupos: gruposDeProveedor(p, derivado) }));
  if (q) proveedores = proveedores.filter(p => (p.nombre || '').toUpperCase().includes(q) || (p.cod_tango || '').toUpperCase().includes(q));
  if (grupoFiltroNombre) proveedores = proveedores.filter(p => p._grupos.includes(grupoFiltroNombre));
  proveedores.sort((a, b) => a.nombre.localeCompare(b.nombre));

  const resumen = document.getElementById('pvp_resumen');
  if (resumen) {
    const detectados = proveedores.filter(p => p.virtual).length;
    resumen.textContent = `${proveedores.length} proveedor${proveedores.length === 1 ? '' : 'es'}` + (detectados ? ` (${detectados} detectado${detectados === 1 ? '' : 's'} en OC, sin ficha propia todavía)` : '');
  }

  const tb = document.getElementById('t-prov-catalogo');
  if (!tb) return;
  if (!proveedores.length) { tb.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:18px;color:var(--muted)">Sin proveedores todavía</td></tr>'; return; }

  tb.innerHTML = proveedores.map(p => {
    const grupos = p._grupos;
    const r = p.cod_tango ? ranking.get(p.cod_tango) : null;
    const badgesGrupos = grupos.length ? grupos.map(g => `<span class="badge cat-permiso">${g}</span>`).join(' ') : '<span style="color:var(--muted)">–</span>';
    return `<tr class="oc-row">
      <td><span class="oc-chevron">▸</span> ${p.nombre}${p.virtual ? ' <span class="badge" style="opacity:.6">detectado</span>' : ''}</td>
      <td>${p.cod_tango || '–'}</td>
      <td>${badgesGrupos}</td>
      <td>${r ? fmtPesos(r.total) : '–'}</td>
      <td>${p.virtual ? '–' : CONTACTOS.filter(c => c.proveedor_id === p.id).length}</td>
      <td>${filaAccionesProveedor(p)}</td>
    </tr>
    <tr class="oc-detail" style="display:none"><td colspan="6">${filaDetalleProveedor(p)}</td></tr>`;
  }).join('');
}

// ------------------------------------------------------------
// Modal — proveedor (alta/edición)
// ------------------------------------------------------------
function poblarDatalistProveedoresOC() {
  const dl = document.getElementById('pv_dl_oc');
  if (!dl) return;
  const vistos = new Map();
  for (const l of OC_LINEAS) if (l.proveedor_cod && !vistos.has(l.proveedor_cod)) vistos.set(l.proveedor_cod, l.proveedor_nombre);
  dl.innerHTML = [...vistos.entries()].map(([cod, nom]) => `<option value="${escAttr(cod)}">${nom || cod}</option>`).join('');
}

function abrirProveedor(id, prefill) {
  poblarSelectGrupos('pv_grupo_manual');
  poblarDatalistProveedoresOC();
  const p = id ? PROVEEDORES.find(x => x.id === id) : null;
  document.getElementById('mPROVEEDOR_t').textContent = p ? '✏️ Editar proveedor' : '+ Nuevo proveedor';
  document.getElementById('pv_id').value = p ? p.id : '';
  document.getElementById('pv_nombre').value = p ? p.nombre : (prefill?.nombre || '');
  document.getElementById('pv_codtango').value = p ? (p.cod_tango || '') : (prefill?.cod_tango || '');
  document.getElementById('pv_grupo_manual').value = p ? (p.grupo_manual_id || '') : '';
  document.getElementById('pv_notas').value = p ? (p.notas || '') : '';
  // El bloque de contacto siempre arranca en blanco: representa "agregar
  // un contacto nuevo", no edita ninguno existente (todavía no hay forma
  // de editar un contacto puntual, solo agregar/quitar).
  document.getElementById('pv_ct_nombre').value = '';
  document.getElementById('pv_ct_telefono').value = '';
  document.getElementById('pv_ct_email').value = '';
  om('mPROVEEDOR');
}

async function guardarProveedor(e) {
  e.preventDefault();
  const id = document.getElementById('pv_id').value || null;
  const nombre = document.getElementById('pv_nombre').value.trim();
  if (!nombre) { toast('Ingresá un nombre', 'er'); return; }
  const payload = {
    nombre,
    cod_tango: document.getElementById('pv_codtango').value.trim() || null,
    grupo_manual_id: document.getElementById('pv_grupo_manual').value || null,
    notas: document.getElementById('pv_notas').value.trim() || null,
    actualizado_en: new Date().toISOString(),
  };

  let proveedorId = id;
  if (id) {
    const { error } = await SB.from('compras_proveedores').update(payload).eq('id', id);
    if (error) { toast(error.message, 'er'); return; }
  } else {
    const { data, error } = await SB.from('compras_proveedores').insert(payload).select().single();
    if (error) { toast(error.message, 'er'); return; }
    proveedorId = data.id;
  }

  // Contacto opcional en el mismo paso — si cargaron algo, se agrega
  // como un contacto más (no reemplaza a los que ya hubiera).
  const ctNombre = document.getElementById('pv_ct_nombre').value.trim();
  const ctTelefono = document.getElementById('pv_ct_telefono').value.trim();
  const ctEmail = document.getElementById('pv_ct_email').value.trim();
  if (ctNombre || ctTelefono || ctEmail) {
    const { error: ctErr } = await SB.from('compras_proveedores_contactos').insert({
      proveedor_id: proveedorId, nombre: ctNombre || null, telefono: ctTelefono || null, email: ctEmail || null,
    });
    if (ctErr) toast('Proveedor guardado, pero el contacto no se pudo guardar: ' + ctErr.message, 'er');
  }

  toast(id ? '✓ Proveedor actualizado' : '✓ Proveedor agregado');
  cm('mPROVEEDOR');
  const secId = document.querySelector('.sec.on')?.id?.replace(/^s-/, '');
  if (secId) renderSeccionConCarga(secId);
}

async function eliminarProveedor(id) {
  if (!confirm('¿Eliminar este proveedor de la agenda? También se borran sus contactos.')) return;
  const { error } = await SB.from('compras_proveedores').delete().eq('id', id);
  if (error) { toast(error.message, 'er'); return; }
  toast('Proveedor eliminado');
  const secId = document.querySelector('.sec.on')?.id?.replace(/^s-/, '');
  if (secId) renderSeccionConCarga(secId);
}

// ------------------------------------------------------------
// Modal — contacto (alta)
// ------------------------------------------------------------
function abrirContacto(proveedorId) {
  PROVEEDOR_ACTUAL_CONTACTO = proveedorId;
  document.getElementById('fCONTACTO').reset();
  om('mCONTACTO');
}

async function guardarContacto(e) {
  e.preventDefault();
  if (!PROVEEDOR_ACTUAL_CONTACTO) return;
  const nombre = document.getElementById('ct_nombre').value.trim();
  const telefono = document.getElementById('ct_telefono').value.trim();
  const email = document.getElementById('ct_email').value.trim();
  if (!nombre && !telefono && !email) { toast('Ingresá al menos un dato de contacto', 'er'); return; }
  const { error } = await SB.from('compras_proveedores_contactos').insert({
    proveedor_id: PROVEEDOR_ACTUAL_CONTACTO,
    nombre: nombre || null,
    telefono: telefono || null,
    email: email || null,
    notas: document.getElementById('ct_notas').value.trim() || null,
  });
  if (error) { toast(error.message, 'er'); return; }
  toast('✓ Contacto agregado');
  cm('mCONTACTO');
  const secId = document.querySelector('.sec.on')?.id?.replace(/^s-/, '');
  if (secId) renderSeccionConCarga(secId);
}

async function eliminarContacto(id) {
  if (!confirm('¿Eliminar este contacto?')) return;
  const { error } = await SB.from('compras_proveedores_contactos').delete().eq('id', id);
  if (error) { toast(error.message, 'er'); return; }
  toast('Contacto eliminado');
  const secId = document.querySelector('.sec.on')?.id?.replace(/^s-/, '');
  if (secId) renderSeccionConCarga(secId);
}

// ------------------------------------------------------------
function initExpandCollapse(tbodyId) {
  document.getElementById(tbodyId)?.addEventListener('click', e => {
    if (e.target.closest('.sto-accion')) return;
    const row = e.target.closest('.oc-row');
    if (!row) return;
    const detailRow = row.nextElementSibling;
    if (!detailRow || !detailRow.classList.contains('oc-detail')) return;
    const isOpen = detailRow.style.display !== 'none';
    detailRow.style.display = isOpen ? 'none' : '';
    const chevron = row.querySelector('.oc-chevron');
    if (chevron) chevron.textContent = isOpen ? '▸' : '▾';
  });
}

function renderSeccion(secId) {
  if (secId === 'prov-agenda') { renderAgenda(); return; }
  if (secId === 'prov-ranking') { renderRanking(); return; }
  if (secId === 'prov-clasificar') { renderClasificar(); return; }
  if (secId === 'prov-catalogo') { renderCatalogo(); return; }
  renderDashboard();
}

const TBODY_POR_SECCION = { 'prov-agenda': 't-prov-agenda', 'prov-ranking': 't-prov-ranking', 'prov-clasificar': 't-prov-clasificar', 'prov-catalogo': 't-prov-catalogo' };

async function renderSeccionConCarga(secId) {
  const tbodyId = TBODY_POR_SECCION[secId];
  if (tbodyId) { const tb = document.getElementById(tbodyId); if (tb) tb.innerHTML = '<tr><td colspan="6" class="loading">Cargando...</td></tr>'; }
  try {
    await cargarTodo();
  } catch (error) {
    if (tbodyId) { const tb = document.getElementById(tbodyId); if (tb) tb.innerHTML = `<tr><td colspan="6" style="color:var(--red);padding:12px">${error.message}</td></tr>`; }
    return;
  }
  renderSeccion(secId);
}

export async function render(secId) {
  await renderSeccionConCarga(secId);
}

export function init() {
  document.getElementById('pva_f_grupo')?.addEventListener('change', renderAgenda);
  document.getElementById('pva_nuevo_grupo')?.addEventListener('click', crearGrupo);
  initExpandCollapse('t-prov-agenda');

  document.getElementById('pvr_f_q')?.addEventListener('input', renderRanking);

  document.getElementById('pvc_f_q')?.addEventListener('input', renderClasificar);
  document.getElementById('pvc_f_sinclasificar')?.addEventListener('change', renderClasificar);
  document.getElementById('t-prov-clasificar')?.addEventListener('change', async e => {
    if (e.target.classList.contains('pvc-check-row')) { actualizarBarraMasiva(); return; }
    const sel = e.target.closest('.pvc-grupo-sel');
    if (!sel) return;
    await asignarGrupoArticulo(sel.dataset.cod, sel.dataset.desc, sel.value);
    // Re-renderiza para que la fila recién clasificada desaparezca de la
    // lista de "sin clasificar" — así se puede ir descontando una por una.
    renderClasificar();
  });
  initArrastreSeleccion('t-prov-clasificar');
  document.getElementById('pvc_check_all')?.addEventListener('change', e => {
    document.querySelectorAll('.pvc-check-row').forEach(c => { c.checked = e.target.checked; });
    actualizarBarraMasiva();
  });
  document.getElementById('pvc_bulk_aplicar')?.addEventListener('click', aplicarGrupoMasivo);

  document.getElementById('pvp_f_q')?.addEventListener('input', renderCatalogo);
  document.getElementById('pvp_f_grupo')?.addEventListener('change', renderCatalogo);
  document.getElementById('pvp_nuevo')?.addEventListener('click', () => abrirProveedor(null));
  initExpandCollapse('t-prov-catalogo');

  document.getElementById('fPROVEEDOR')?.addEventListener('submit', guardarProveedor);
  document.getElementById('fCONTACTO')?.addEventListener('submit', guardarContacto);

  document.getElementById('pvd-ir-agenda')?.addEventListener('click', () => document.querySelector('.nav-item[data-sec="prov-agenda"]')?.click());
  document.getElementById('pvd-ir-ranking')?.addEventListener('click', () => document.querySelector('.nav-item[data-sec="prov-ranking"]')?.click());
  document.getElementById('pvd-ir-clasificar')?.addEventListener('click', () => document.querySelector('.nav-item[data-sec="prov-clasificar"]')?.click());
  document.getElementById('pvd-ir-catalogo')?.addEventListener('click', () => document.querySelector('.nav-item[data-sec="prov-catalogo"]')?.click());

  window.proveedores = { abrirProveedor, eliminarProveedor, abrirContacto, eliminarContacto, agregarCandidato };
}
