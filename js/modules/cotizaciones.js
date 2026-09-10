// ============================================================
// Módulo Cotizaciones — solicitudes de cotización armadas a partir
// del export de Capataz ("Venta y Compras → Movimientos → Gestión
// personalizada de ventas y compras"). Reemplaza el flujo manual de
// pintar de amarillo en el Excel lo que ya hay en stock: acá se
// marca con un dato (`a_comprar`), se invita a los proveedores que
// van a cotizar, se cargan sus precios por artículo y se arma una
// comparativa con el más barato resaltado por fila y un resumen por
// proveedor en las unidades reales del archivo (kg/lts/uni — no se
// inventa una conversión a una unidad común) para poder repartir la
// compra respetando mínimos por proveedor.
// ============================================================
import { SB } from '../supabase-client.js';
import { toast, om, cm, norm, txt, num, fetchAll, escAttr, fmt } from '../utils.js';

let COTIZACIONES = [];
let ITEMS_RESUMEN = [];     // {cotizacion_id, a_comprar} de TODAS las solicitudes — solo para los contadores de la lista
let INVITADOS_RESUMEN = []; // {cotizacion_id} de TODAS las solicitudes — ídem
let PROVEEDORES = [];       // catálogo con ficha propia (compras_proveedores) {id, nombre, cod_tango}
let OC_LINEAS_MIN = [];     // {proveedor_cod, proveedor_nombre} de compras_oc_lineas — para sugerir también proveedores "detectados" sin ficha todavía (ver 9.4/7.2)
let GRUPOS = [];            // compras_grupos completo {id, nombre}
let ARTICULOS_GRUPO_MAP = new Map(); // cod_articulo -> grupo_id (compras_articulos_grupo, misma clasificación que Proveedores)

let COT_ACTUAL = null;      // la solicitud abierta en la vista detalle
let ITEMS = [];             // items de COT_ACTUAL
let INVITADOS = [];         // [{id, proveedor_id, nombre}] de COT_ACTUAL
let PRECIOS = [];           // [{id, item_id, proveedor_id, precio_unitario, moneda}] de COT_ACTUAL
let COL_MONEDA = {};        // proveedor_id -> 'ARS'|'USD' — moneda con la que se cargan los PRÓXIMOS precios de esa columna
let PROV_MODAL_ID = null;   // proveedor_id que se está cargando en el modal mCOTPROV
let BLOQUE_TAB = '';        // bloque actualmente seleccionado ('' = General) — reemplaza al viejo <select>, ver poblarTabsBloque()

const SIMBOLO = m => m === 'USD' ? 'U$S' : '$';
const numFmt = (n, dec = 2) => Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: dec });
const fmtMonto = (n, moneda) => SIMBOLO(moneda) + (moneda === 'USD' ? ' ' : '') + numFmt(n, 2);

// ------------------------------------------------------------
// Parseo del Excel (export de Capataz — Gestión Personalizada de
// Ventas y Compras). Las filas en blanco que separan bloques
// (Pañol/Despacho) en el archivo real se saltean solas.
// ------------------------------------------------------------
function parseWorkbookCotizacion(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, cellDates: true, defval: null });
  if (!rows.length) return [];

  const header = rows[0].map(norm);
  const idx = name => header.indexOf(name);
  const col = {
    nroSolic: idx('NRO_SOLIC'), articulo: idx('COD_ARTICU'), desc: idx('DESCRIPCIO'), descAdic: idx('DESC_ADIC'),
    cantUms: idx('CANT_UMS'), ums: idx('UMS'), cantUmc: idx('CANT_UMC'), umc: idx('UMC'),
    tComp: idx('T_COMP'), nOt: idx('N_OT'),
  };
  if (col.articulo === -1) throw new Error('No se encontró la columna esperada en el archivo (falta "COD_ARTICU").');

  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every(c => c === null || c === '')) continue;
    const articulo = txt(r[col.articulo]);
    if (!articulo) continue;
    out.push({
      nro_solicitud: col.nroSolic >= 0 ? txt(r[col.nroSolic]) : null,
      cod_articulo: articulo,
      descripcion: col.desc >= 0 ? txt(r[col.desc]) : null,
      desc_adicional: col.descAdic >= 0 ? txt(r[col.descAdic]) : null,
      cant_ums: col.cantUms >= 0 ? num(r[col.cantUms]) : null,
      ums: col.ums >= 0 ? txt(r[col.ums]) : null,
      cant_umc: col.cantUmc >= 0 ? num(r[col.cantUmc]) : null,
      umc: col.umc >= 0 ? txt(r[col.umc]) : null,
      t_comp: col.tComp >= 0 ? txt(r[col.tComp]) : null,
      n_ot: col.nOt >= 0 ? txt(r[col.nOt]) : null,
    });
  }
  return out;
}

// ------------------------------------------------------------
// Carga
// ------------------------------------------------------------
async function cargarListado() {
  const [{ data: cots, error: e1 }, { data: itemsResumen, error: e2 }, { data: invResumen, error: e3 }] = await Promise.all([
    fetchAll(() => SB.from('compras_cotizaciones').select('*').order('fecha', { ascending: false })),
    fetchAll(() => SB.from('compras_cotizaciones_items').select('cotizacion_id,a_comprar')),
    fetchAll(() => SB.from('compras_cotizaciones_proveedores').select('cotizacion_id')),
  ]);
  if (e1) { toast(e1.message, 'er'); return; }
  if (e2) { toast(e2.message, 'er'); return; }
  if (e3) { toast(e3.message, 'er'); return; }
  COTIZACIONES = cots || [];
  ITEMS_RESUMEN = itemsResumen || [];
  INVITADOS_RESUMEN = invResumen || [];
}

async function cargarProveedores() {
  const [{ data: props, error: e1 }, { data: ocLineas, error: e2 }, { data: grupos, error: e3 }, { data: artGrupo, error: e4 }] = await Promise.all([
    fetchAll(() => SB.from('compras_proveedores').select('id,nombre,cod_tango').order('nombre')),
    fetchAll(() => SB.from('compras_oc_lineas').select('proveedor_cod,proveedor_nombre')),
    SB.from('compras_grupos').select('*').order('nombre'),
    fetchAll(() => SB.from('compras_articulos_grupo').select('cod_articulo,grupo_id')),
  ]);
  if (e1) { toast(e1.message, 'er'); return; }
  if (e2) { toast(e2.message, 'er'); return; }
  if (e3) { toast(e3.message, 'er'); return; }
  if (e4) { toast(e4.message, 'er'); return; }
  PROVEEDORES = props || [];
  OC_LINEAS_MIN = ocLineas || [];
  GRUPOS = grupos || [];
  ARTICULOS_GRUPO_MAP = new Map((artGrupo || []).map(a => [a.cod_articulo, a.grupo_id]));
}

// Rubro/grupo de un ítem — reusa la misma clasificación por artículo que
// ya arma Proveedores (Clasificar artículos), así no hay que reclasificar
// nada para poder filtrar la comparativa por rubro (ver 9.2: los items de
// una misma solicitud suelen ir a proveedores distintos según el rubro —
// bulonería a un lado, perfiles/chapas a otro — y mezclarlos todos en la
// misma tabla la hacía ilegible).
function grupoNombreDeItem(item) {
  const grupoId = ARTICULOS_GRUPO_MAP.get(item.cod_articulo);
  if (!grupoId) return null;
  return GRUPOS.find(g => g.id === grupoId)?.nombre || null;
}

// La mayoría de los proveedores que aparecen en Órdenes de Compra
// todavía no tienen ficha propia en compras_proveedores (quedan
// "detectados", ver CLAUDE.md 7.2) — sin esto, invitar a cotizar
// quedaba limitado al puñado de proveedores que sí tienen ficha.
// Acá se ofrecen también los detectados; al elegir uno se le crea
// la ficha real en el momento (mismo criterio que "➕ Completar
// datos" en Proveedores → Catálogo), porque invitar necesita un
// proveedor_id real (FK).
function obtenerCandidatosParaInvitar() {
  const codTangoConFicha = new Set(PROVEEDORES.map(p => p.cod_tango).filter(Boolean));
  const vistos = new Set();
  const virtuales = [];
  for (const l of OC_LINEAS_MIN) {
    if (!l.proveedor_cod || codTangoConFicha.has(l.proveedor_cod) || vistos.has(l.proveedor_cod)) continue;
    vistos.add(l.proveedor_cod);
    virtuales.push({ id: null, nombre: l.proveedor_nombre || l.proveedor_cod, cod_tango: l.proveedor_cod, virtual: true });
  }
  return [...PROVEEDORES, ...virtuales];
}

// ------------------------------------------------------------
// Vista lista
// ------------------------------------------------------------
function renderLista() {
  const estadoF = document.getElementById('cot_f_estado')?.value ?? 'ABIERTA';
  const q = (document.getElementById('cot_f_q')?.value || '').trim().toUpperCase();
  let lista = COTIZACIONES.slice();
  if (estadoF) lista = lista.filter(c => c.estado === estadoF);
  if (q) lista = lista.filter(c => (c.nombre || '').toUpperCase().includes(q));

  const tb = document.getElementById('t-cot-lista');
  if (!tb) return;
  if (!lista.length) { tb.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:18px;color:var(--muted)">Sin solicitudes</td></tr>'; return; }

  tb.innerHTML = lista.map(c => {
    const items = ITEMS_RESUMEN.filter(i => i.cotizacion_id === c.id);
    const aComprar = items.filter(i => i.a_comprar).length;
    const invitados = INVITADOS_RESUMEN.filter(i => i.cotizacion_id === c.id).length;
    return `<tr class="oc-row" onclick="window.cotizaciones.abrirDetalle('${c.id}')">
      <td>${escAttr(c.nombre)}</td>
      <td>${fmt(c.fecha)}</td>
      <td>${aComprar} de ${items.length}</td>
      <td>${invitados}</td>
      <td><span class="badge ${c.estado === 'ABIERTA' ? 'vigente' : 'comp'}">${c.estado === 'ABIERTA' ? 'Abierta' : 'Cerrada'}</span></td>
    </tr>`;
  }).join('');
}

async function onArchivoCotizacion(file) {
  const nombre = (document.getElementById('cot_nombre_nueva')?.value || '').trim();
  if (!nombre) { toast('Ponele un nombre a la solicitud antes de elegir el archivo', 'er'); return; }

  let filas;
  try {
    const buf = await file.arrayBuffer();
    filas = parseWorkbookCotizacion(buf);
  } catch (e) {
    toast('No se pudo leer el archivo: ' + e.message, 'er');
    return;
  }
  if (!filas.length) { toast('No se encontraron filas en el archivo', 'er'); return; }

  const articulos = new Set(filas.map(f => f.cod_articulo)).size;
  const ok = confirm(`Se leyeron ${filas.length} filas (${articulos} artículos).\n\nSe va a crear la solicitud "${nombre}" con estos ítems. ¿Continuar?`);
  if (!ok) return;

  const { data: cot, error: e1 } = await SB.from('compras_cotizaciones').insert({ nombre }).select().single();
  if (e1) { toast(e1.message, 'er'); return; }

  const filasConId = filas.map(f => ({ ...f, cotizacion_id: cot.id }));
  const chunkSize = 500;
  for (let i = 0; i < filasConId.length; i += chunkSize) {
    const { error } = await SB.from('compras_cotizaciones_items').insert(filasConId.slice(i, i + chunkSize));
    if (error) { toast('Error insertando ítems: ' + error.message, 'er'); return; }
  }

  COTIZACIONES.unshift(cot);
  ITEMS_RESUMEN = ITEMS_RESUMEN.concat(filasConId.map(() => ({ cotizacion_id: cot.id, a_comprar: true })));
  document.getElementById('cot_nombre_nueva').value = '';
  toast(`✓ Solicitud "${nombre}" creada con ${filas.length} ítems`);
  await abrirDetalle(cot.id);
}

// ------------------------------------------------------------
// Vista detalle
// ------------------------------------------------------------
async function abrirDetalle(id) {
  const cot = COTIZACIONES.find(c => c.id === id);
  if (!cot) return;
  COT_ACTUAL = cot;
  COL_MONEDA = {};

  const [{ data: items, error: e1 }, { data: invitadosRaw, error: e2 }] = await Promise.all([
    SB.from('compras_cotizaciones_items').select('*').eq('cotizacion_id', id).order('cod_articulo'),
    SB.from('compras_cotizaciones_proveedores').select('id,proveedor_id,bloque,condicion_pago').eq('cotizacion_id', id),
  ]);
  if (e1) { toast(e1.message, 'er'); return; }
  if (e2) { toast(e2.message, 'er'); return; }
  ITEMS = items || [];
  const provMap = new Map(PROVEEDORES.map(p => [p.id, p.nombre]));
  INVITADOS = (invitadosRaw || []).map(i => ({ id: i.id, proveedor_id: i.proveedor_id, bloque: i.bloque || '', condicion_pago: i.condicion_pago || '', nombre: provMap.get(i.proveedor_id) || '(?)' }));

  const itemIds = ITEMS.map(i => i.id);
  if (itemIds.length) {
    const { data: precios, error: e3 } = await SB.from('compras_cotizaciones_precios').select('*').in('item_id', itemIds);
    if (e3) { toast(e3.message, 'er'); return; }
    PRECIOS = precios || [];
  } else {
    PRECIOS = [];
  }
  INVITADOS.forEach(inv => {
    const conMoneda = PRECIOS.find(p => p.proveedor_id === inv.proveedor_id);
    COL_MONEDA[inv.proveedor_id] = conMoneda?.moneda || 'ARS';
  });

  document.getElementById('cot-vista-lista').style.display = 'none';
  document.getElementById('cot-vista-detalle').style.display = '';
  renderHeaderDetalle();
  poblarFiltroGrupo();
  BLOQUE_TAB = '';
  poblarTabsBloque();
  renderInvitados();
  renderTablaComparativa();
  renderResumenProveedores();
}

function volverALista() {
  COT_ACTUAL = null;
  document.getElementById('cot-vista-detalle').style.display = 'none';
  document.getElementById('cot-vista-lista').style.display = '';
  renderLista();
}

function renderHeaderDetalle() {
  const nombreInput = document.getElementById('cot_det_nombre');
  if (nombreInput) nombreInput.value = COT_ACTUAL.nombre;
  const fechaEl = document.getElementById('cot_det_fecha');
  if (fechaEl) fechaEl.textContent = fmt(COT_ACTUAL.fecha);
  const badge = document.getElementById('cot_det_estado_badge');
  if (badge) {
    badge.className = `badge ${COT_ACTUAL.estado === 'ABIERTA' ? 'vigente' : 'comp'}`;
    badge.textContent = COT_ACTUAL.estado === 'ABIERTA' ? 'Abierta' : 'Cerrada';
  }
  const btnEstado = document.getElementById('cot_det_toggle_estado');
  if (btnEstado) btnEstado.textContent = COT_ACTUAL.estado === 'ABIERTA' ? 'Cerrar solicitud' : 'Reabrir solicitud';
}

async function guardarNombreDetalle() {
  const nuevo = (document.getElementById('cot_det_nombre')?.value || '').trim();
  if (!nuevo || !COT_ACTUAL || nuevo === COT_ACTUAL.nombre) return;
  const { error } = await SB.from('compras_cotizaciones').update({ nombre: nuevo }).eq('id', COT_ACTUAL.id);
  if (error) { toast(error.message, 'er'); return; }
  COT_ACTUAL.nombre = nuevo;
  const c = COTIZACIONES.find(x => x.id === COT_ACTUAL.id);
  if (c) c.nombre = nuevo;
  toast('✓ Nombre actualizado');
}

async function toggleEstadoCotizacion() {
  if (!COT_ACTUAL) return;
  const nuevo = COT_ACTUAL.estado === 'ABIERTA' ? 'CERRADA' : 'ABIERTA';
  const { error } = await SB.from('compras_cotizaciones').update({ estado: nuevo }).eq('id', COT_ACTUAL.id);
  if (error) { toast(error.message, 'er'); return; }
  COT_ACTUAL.estado = nuevo;
  const c = COTIZACIONES.find(x => x.id === COT_ACTUAL.id);
  if (c) c.estado = nuevo;
  renderHeaderDetalle();
  toast(nuevo === 'CERRADA' ? '✓ Solicitud cerrada' : '✓ Solicitud reabierta');
}

// ------------------------------------------------------------
// Ítems — marcar a_comprar (individual + en bloque)
// ------------------------------------------------------------
const SIN_CLASIFICAR = '__SIN_CLASIFICAR__';

// El bloque (ej. "Pañol"/"Despacho") es la división principal de una
// solicitud: cada bloque tiene su propia lista de proveedores
// invitados (ver 9.2/9.4) — bloqueActual() es "con qué bloque estoy
// trabajando ahora", tanto para filtrar filas como para saber a qué
// bloque se invita un proveedor nuevo.
function bloqueActual() {
  return BLOQUE_TAB;
}

// Los "tabs" de bloque son siempre General/Pañol/Despacho (fijo, ver
// 9.4), pero solo se muestran los que efectivamente tienen algún ítem
// — así no aparece "Despacho" vacío en una solicitud que todavía no se
// dividió. Los botones "Marcar como Pañol/Despacho" siguen disponibles
// siempre, aunque el tab todavía no exista: en cuanto se etiqueta el
// primer ítem, el tab aparece solo.
function poblarTabsBloque() {
  const cont = document.getElementById('cot_f_bloque_tabs');
  if (!cont) return;
  const conteos = { '': 0, 'Pañol': 0, 'Despacho': 0 };
  ITEMS.forEach(it => { const b = it.bloque || ''; if (b in conteos) conteos[b]++; });
  // Un bloque puede quedar sin ítems (se reetiquetaron todos a otro
  // bloque) pero seguir teniendo proveedores invitados ahí — si su tab
  // desapareciera igual, esos proveedores (y los precios que se les
  // hayan cargado) quedaban invisibles para siempre, sin forma de verlos
  // ni de desinvitarlos: bug real reportado por el usuario (2026-09-03,
  // "tengo proveedores pero no aparece ninguno") — el listado mostraba 5
  // invitados en total mientras el único bloque con ítems, "Despacho",
  // no tenía ninguno invitado. Por eso un bloque con proveedores
  // invitados sigue mostrando su tab aunque tenga 0 ítems.
  const bloquesConInvitados = new Set(INVITADOS.map(inv => inv.bloque || ''));
  const opciones = [
    { valor: '', label: 'General' },
    { valor: 'Pañol', label: 'Pañol' },
    { valor: 'Despacho', label: 'Despacho' },
  ].filter(o => conteos[o.valor] > 0 || bloquesConInvitados.has(o.valor));

  if (!opciones.some(o => o.valor === BLOQUE_TAB)) BLOQUE_TAB = opciones[0]?.valor ?? '';

  cont.innerHTML = opciones.map(o => `<button type="button" class="cot-bloque-tab ${o.valor === BLOQUE_TAB ? 'active' : ''}" data-bloque="${escAttr(o.valor)}">${escAttr(o.label)} (${conteos[o.valor]})</button>`).join('');
}

function invitadosVisibles() {
  const b = bloqueActual();
  return INVITADOS.filter(inv => (inv.bloque || '') === b);
}

// Tipo de cambio de referencia — puramente client-side, no se guarda en
// ningún lado (se pierde al recargar la página). Sirve solo para mostrar
// a cuánto equivalen en pesos los precios cargados en dólares, no para
// comparar/sugerir ganador automáticamente entre monedas (eso se sigue
// evitando a propósito, ver cheapestForItem).
function tipoCambioActual() {
  const v = (document.getElementById('cot_tipo_cambio')?.value || '').trim().replace(',', '.');
  const n = Number(v);
  return v && isFinite(n) && n > 0 ? n : null;
}

// Ordenada por descripción (no por código) — pedido explícito del
// usuario, es más fácil de recorrer tanto en pantalla como en el
// Excel que se le manda al proveedor (ver exportarParaCotizar()).
function itemsVisibles() {
  const ocultarNo = document.getElementById('cot_f_ocultar_no_comprar')?.checked ?? true;
  const mostrarConfirmados = document.getElementById('cot_f_mostrar_confirmados')?.checked ?? false;
  const grupoF = document.getElementById('cot_f_grupo')?.value || '';
  const bloque = bloqueActual();
  // Los ítems con la compra ya confirmada (ver confirmarCompraProveedor) se
  // ocultan por defecto de la comparativa — ya están resueltos, no hace
  // falta seguir mirándolos ahí — pero "Mostrar confirmados" los trae de
  // vuelta para el caso real de tener que deshacer una confirmación (ej.
  // el proveedor ganador no tenía stock de eso después de todo) sin tener
  // que ir a buscar en el informe de reparto quién más lo había cotizado.
  let lista = ITEMS.filter(i => (i.bloque || '') === bloque && (mostrarConfirmados || !i.confirmado));
  if (ocultarNo) lista = lista.filter(i => i.a_comprar);
  if (grupoF === SIN_CLASIFICAR) lista = lista.filter(i => !grupoNombreDeItem(i));
  else if (grupoF) lista = lista.filter(i => grupoNombreDeItem(i) === grupoF);
  return lista.slice().sort((a, b) => (a.descripcion || '').localeCompare(b.descripcion || '', 'es'));
}

// Exporta exactamente lo que se está viendo (mismos filtros de bloque/
// rubro/ocultar-no-comprar que la tabla) — es la lista que el usuario le
// manda al proveedor a cotizar, ya desglosada de lo que bajó de Capataz.
function exportarParaCotizar() {
  const lista = itemsVisibles();
  if (!lista.length) { toast('No hay ítems para exportar con los filtros actuales', 'er'); return; }

  // Dos columnas repiten el encabezado "Unidad" (una para la cantidad
  // pedida y otra para su equivalencia en unidad de compra) — un objeto
  // JS no puede tener dos claves iguales, así que se arma con aoa_to_sheet
  // (array de filas) en vez de json_to_sheet.
  const encabezado = ['Código', 'Descripción', 'Detalle', 'Cantidad', 'Unidad', 'Equivalencia', 'Unidad'];
  const filas = lista.map(it => [
    it.cod_articulo,
    it.descripcion || '',
    it.desc_adicional || '',
    it.cant_ums,
    it.ums || '',
    it.cant_umc,
    it.umc || '',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([encabezado, ...filas]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Para cotizar');

  const bloque = bloqueActual();
  const partes = [COT_ACTUAL?.nombre || 'cotizacion', bloque || null, new Date().toISOString().slice(0, 10)]
    .filter(Boolean)
    .map(s => s.replace(/[^a-zA-Z0-9]+/g, '-'));
  XLSX.writeFile(wb, `${partes.join('_')}.xlsx`);
}

// Capataz trae el N° de OT con ceros a la izquierda ("000000000596") —
// se muestra sin esos ceros ("596"), mismo criterio y misma lógica que
// formatOT() del módulo OT (duplicada a propósito acá, ver notas-pedido.js
// 8.2 para el mismo criterio de "duplicar en vez de importar entre
// módulos"). Solo se recorta si es puramente numérico, así que "OT1" (el
// cajón de compras de planta en general) u otro valor no numérico queda
// tal cual.
function formatOTExport(ot) {
  const t = (ot || '').trim();
  if (!t) return '';
  return /^\d+$/.test(t) ? String(parseInt(t, 10)) : t;
}

// Informe final del reparto de este bloque: una hoja por proveedor con lo
// que ganó (para poder emitirle la Nota de Pedido/OC) + una hoja "Sin
// ganador" con lo que todavía quedó sin asignar. Usa a_comprar + bloque
// como alcance (no los filtros de rubro/"ocultar no comprar" de la
// pantalla) porque el informe tiene que cubrir todo el bloque, no solo lo
// que se esté mirando en ese momento.
function emitirInformeReparto() {
  const bloque = bloqueActual();
  const itemsBloque = ITEMS.filter(i => (i.bloque || '') === bloque && i.a_comprar);
  if (!itemsBloque.length) { toast('No hay ítems a comprar en este bloque', 'er'); return; }

  const wb = XLSX.utils.book_new();
  const nombresHoja = new Set();
  const nombreHojaUnico = base => {
    let nombre = (base || 'Proveedor').replace(/[\[\]\*\/\\\?:]/g, ' ').trim().slice(0, 28) || 'Proveedor';
    let final = nombre;
    let i = 2;
    while (nombresHoja.has(final.toUpperCase())) { final = `${nombre} (${i})`; i++; }
    nombresHoja.add(final.toUpperCase());
    return final;
  };

  // El director financiero pidió un resumen aparte que no mezcle el
  // detalle artículo por artículo con lo que a él le importa: a quién, a
  // cuánto, con qué condición de pago y para qué OT — sin el "qué se
  // compra" (pedido explícito, 2026-09-10). Se arma en paralelo al mismo
  // recorrido que ya arma las hojas por proveedor, agrupando por
  // proveedor+OT+moneda (nunca mezclar monedas en una misma suma, mismo
  // criterio del resto del módulo — ver 9.2 punto 7).
  const consolidadoMap = new Map();
  const acumularConsolidado = (inv, ot, moneda, monto) => {
    const clave = `${inv.proveedor_id}|${ot}|${moneda}`;
    const actual = consolidadoMap.get(clave);
    if (actual) actual.monto += monto;
    else consolidadoMap.set(clave, { proveedor: inv.nombre, ot, moneda, monto, condicionPago: inv.condicion_pago || '' });
  };

  invitadosVisibles().forEach(inv => {
    const ganados = itemsBloque
      .filter(it => it.ganador_proveedor_id === inv.proveedor_id)
      .slice()
      .sort((a, b) => (a.descripcion || '').localeCompare(b.descripcion || '', 'es'));
    if (!ganados.length) return;

    const encabezado = ['Código', 'OT', 'Descripción', 'Detalle', 'Cantidad', 'Unidad', 'Precio unitario', 'Moneda', 'Subtotal', 'Estado'];
    const totalesPorMoneda = {};
    const filas = ganados.map(it => {
      const p = PRECIOS.find(pr => pr.item_id === it.id && pr.proveedor_id === inv.proveedor_id);
      const precioExacto = p && p.precio_unitario != null ? Number(p.precio_unitario) : null;
      const subtotalExacto = precioExacto != null ? precioExacto * (Number(it.cant_umc) || 0) : null;
      const moneda = p ? p.moneda : '';
      // El total por moneda se acumula con el subtotal SIN redondear (para
      // no arrastrar el redondeo de cada fila al total) — recién se
      // redondea a 2 decimales al armar la fila de TOTAL, igual que cada
      // celda de Precio unitario/Subtotal (antes salían con la precisión
      // completa del cálculo interno, ilegible en el Excel real).
      if (subtotalExacto != null) {
        totalesPorMoneda[moneda || 'ARS'] = (totalesPorMoneda[moneda || 'ARS'] || 0) + subtotalExacto;
        acumularConsolidado(inv, formatOTExport(it.n_ot) || '(Sin OT)', moneda || 'ARS', subtotalExacto);
      }
      const precio = precioExacto != null ? Math.round(precioExacto * 100) / 100 : null;
      const subtotal = subtotalExacto != null ? Math.round(subtotalExacto * 100) / 100 : null;
      return [it.cod_articulo, formatOTExport(it.n_ot), it.descripcion || '', it.desc_adicional || '', it.cant_umc, it.umc || '', precio, moneda, subtotal, it.confirmado ? '✓ OC Generada' : ''];
    });
    // Una fila de total por moneda (casi siempre una sola, ver el aviso ⚠️
    // de moneda mixta en la comparativa) — en la columna Descripción para
    // que quede legible como fila de cierre de la hoja, no una fila más de
    // artículo.
    const monedas = Object.keys(totalesPorMoneda);
    const filasTotal = monedas.map(moneda => [
      '', '', monedas.length > 1 ? `TOTAL (${moneda})` : 'TOTAL', '', '', '', '', moneda, Math.round(totalesPorMoneda[moneda] * 100) / 100, ''
    ]);
    const ws = XLSX.utils.aoa_to_sheet([encabezado, ...filas, ...filasTotal]);
    XLSX.utils.book_append_sheet(wb, ws, nombreHojaUnico(inv.nombre));
  });

  const sinGanador = itemsBloque
    .filter(it => !it.ganador_proveedor_id)
    .slice()
    .sort((a, b) => (a.descripcion || '').localeCompare(b.descripcion || '', 'es'));
  const encabezadoSG = ['Código', 'OT', 'Descripción', 'Detalle', 'Cantidad', 'Unidad'];
  const filasSG = sinGanador.map(it => [it.cod_articulo, formatOTExport(it.n_ot), it.descripcion || '', it.desc_adicional || '', it.cant_umc, it.umc || '']);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([encabezadoSG, ...filasSG]), nombreHojaUnico('Sin ganador'));

  // Hoja "Consolidado" — se agrega al final y se pasa al frente
  // (wb.SheetNames.unshift) para que sea la que se ve al abrir el Excel,
  // que es la que le importa al director; las hojas por proveedor con el
  // detalle de artículos quedan igual, atrás, para armar la OC.
  if (consolidadoMap.size) {
    const filasConsolidado = [...consolidadoMap.values()]
      .sort((a, b) => a.proveedor.localeCompare(b.proveedor, 'es') || a.ot.localeCompare(b.ot, 'es'))
      .map(c => [c.proveedor, c.ot, Math.round(c.monto * 100) / 100, c.moneda, c.condicionPago || 'Sin definir']);
    const encabezadoCons = ['Proveedor', 'OT', 'Monto', 'Moneda', 'Condición de pago'];
    const wsCons = XLSX.utils.aoa_to_sheet([encabezadoCons, ...filasConsolidado]);
    XLSX.utils.book_append_sheet(wb, wsCons, nombreHojaUnico('Consolidado'));
    wb.SheetNames.unshift(wb.SheetNames.pop());
  }

  const partesInforme = [COT_ACTUAL?.nombre || 'cotizacion', bloque || null, 'reparto', new Date().toISOString().slice(0, 10)]
    .filter(Boolean)
    .map(s => s.replace(/[^a-zA-Z0-9]+/g, '-'));
  XLSX.writeFile(wb, `${partesInforme.join('_')}.xlsx`);
}

// Solo se listan los rubros que efectivamente aparecen entre los ítems de
// ESTA solicitud (no los 28 grupos globales de Proveedores) — para que el
// filtro sea corto y relevante, no una réplica del catálogo completo.
function poblarFiltroGrupo() {
  const sel = document.getElementById('cot_f_grupo');
  if (!sel) return;
  const anterior = sel.value;
  const nombres = new Set();
  let haySinClasificar = false;
  for (const it of ITEMS) {
    const g = grupoNombreDeItem(it);
    if (g) nombres.add(g); else haySinClasificar = true;
  }
  const opciones = ['<option value="">Todos los rubros</option>', ...[...nombres].sort((a, b) => a.localeCompare(b, 'es')).map(n => `<option value="${escAttr(n)}">${escAttr(n)}</option>`)];
  if (haySinClasificar) opciones.push(`<option value="${SIN_CLASIFICAR}">Sin clasificar</option>`);
  sel.innerHTML = opciones.join('');
  if ([...nombres, haySinClasificar ? SIN_CLASIFICAR : null].includes(anterior)) sel.value = anterior;
}

function actualizarBarraBulk() {
  const n = document.querySelectorAll('.cot-check-row:checked').length;
  const el = document.getElementById('cot_bulk_count');
  if (el) el.textContent = `${n} seleccionado${n === 1 ? '' : 's'}`;
  const dis = n === 0;
  ['cot_bulk_si', 'cot_bulk_no', 'cot_bulk_bloque_panol', 'cot_bulk_bloque_despacho', 'cot_bulk_bloque_gral'].forEach(id => {
    const el2 = document.getElementById(id);
    if (el2) el2.disabled = dis;
  });
}

// Mover ítems a otro bloque los saca del bloque que se estaba viendo
// (dejan de matchear bloqueActual()) — a propósito, es justo la
// "división" que pidió el usuario (siempre Pañol o Despacho, "General"
// es solo el estado antes de clasificar). Se resetea el ganador de
// esos ítems porque el proveedor ganador anterior puede no estar
// invitado al bloque nuevo.
async function aplicarBloqueSeleccionados(nuevoBloque) {
  const ids = Array.from(document.querySelectorAll('.cot-check-row:checked')).map(c => c.dataset.id);
  if (!ids.length) { toast('Seleccioná al menos un ítem', 'er'); return; }
  for (let i = 0; i < ids.length; i += 100) {
    const { error } = await SB.from('compras_cotizaciones_items')
      .update({ bloque: nuevoBloque, ganador_proveedor_id: null, ganador_manual: false, confirmado: false })
      .in('id', ids.slice(i, i + 100));
    if (error) { toast(error.message, 'er'); return; }
  }
  ITEMS.forEach(it => { if (ids.includes(it.id)) { it.bloque = nuevoBloque; it.ganador_proveedor_id = null; it.ganador_manual = false; it.confirmado = false; } });
  toast(`✓ ${ids.length} ítem${ids.length === 1 ? '' : 's'} marcado${ids.length === 1 ? '' : 's'} como "${nuevoBloque || 'General'}"`);
  poblarTabsBloque();
  renderTablaComparativa();
  renderResumenProveedores();
}

// ITEMS_RESUMEN alimenta los contadores "X de Y" de la vista lista —
// se resincroniza con el estado real de ITEMS cada vez que cambia
// algún a_comprar, para que esos contadores no queden desactualizados
// al volver de la vista detalle.
function sincronizarResumenItems() {
  if (!COT_ACTUAL) return;
  ITEMS_RESUMEN = [
    ...ITEMS_RESUMEN.filter(i => i.cotizacion_id !== COT_ACTUAL.id),
    ...ITEMS.map(i => ({ cotizacion_id: COT_ACTUAL.id, a_comprar: i.a_comprar })),
  ];
}

async function toggleComprarFila(itemId) {
  const item = ITEMS.find(i => i.id === itemId);
  if (!item) return;
  const nuevo = !item.a_comprar;
  const { error } = await SB.from('compras_cotizaciones_items').update({ a_comprar: nuevo }).eq('id', itemId);
  if (error) { toast(error.message, 'er'); return; }
  item.a_comprar = nuevo;
  sincronizarResumenItems();
  renderTablaComparativa();
}

async function marcarComprarSeleccionados(valor) {
  const ids = Array.from(document.querySelectorAll('.cot-check-row:checked')).map(c => c.dataset.id);
  if (!ids.length) { toast('Seleccioná al menos un ítem', 'er'); return; }
  for (let i = 0; i < ids.length; i += 100) {
    const { error } = await SB.from('compras_cotizaciones_items').update({ a_comprar: valor }).in('id', ids.slice(i, i + 100));
    if (error) { toast(error.message, 'er'); return; }
  }
  ITEMS.forEach(it => { if (ids.includes(it.id)) it.a_comprar = valor; });
  sincronizarResumenItems();
  toast(`✓ ${ids.length} ítem${ids.length === 1 ? '' : 's'} marcado${ids.length === 1 ? '' : 's'} como "${valor ? 'a comprar' : 'no comprar'}"`);
  renderTablaComparativa();
}

// ------------------------------------------------------------
// Proveedores invitados
// ------------------------------------------------------------
function sugerenciasProveedoresParaInvitar(q) {
  const yaInvitados = new Set(invitadosVisibles().map(i => i.proveedor_id));
  return obtenerCandidatosParaInvitar()
    .filter(p => !(p.id && yaInvitados.has(p.id)) && p.nombre.toUpperCase().includes(q))
    .slice(0, 8);
}

function filtrarSugerenciasInvitar() {
  const input = document.getElementById('cot_prov_buscar');
  const box = document.getElementById('cot_prov_sug');
  if (!input || !box) return;
  const q = input.value.trim().toUpperCase();
  if (!q) { box.style.display = 'none'; box.innerHTML = ''; return; }
  const coincidencias = sugerenciasProveedoresParaInvitar(q);
  if (!coincidencias.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
  box.innerHTML = coincidencias.map(p => `<div class="ac-item" data-id="${p.id || ''}" data-nombre="${escAttr(p.nombre)}" data-cod="${escAttr(p.cod_tango || '')}">
    ${escAttr(p.nombre)}${p.virtual ? ' <span style="color:var(--muted);font-size:11px">(detectado, sin ficha — se le crea una al invitarlo)</span>' : ''}
  </div>`).join('');
  box.style.display = '';
}

function initAutocompleteInvitar() {
  const input = document.getElementById('cot_prov_buscar');
  const box = document.getElementById('cot_prov_sug');
  if (!input || !box) return;
  input.addEventListener('input', filtrarSugerenciasInvitar);
  input.addEventListener('focus', filtrarSugerenciasInvitar);
  box.addEventListener('mousedown', e => {
    const item = e.target.closest('.ac-item');
    if (!item) return;
    e.preventDefault();
    if (item.dataset.id) {
      agregarInvitado(item.dataset.id);
    } else {
      agregarInvitadoDetectado(item.dataset.nombre, item.dataset.cod);
    }
    input.value = '';
    box.style.display = 'none';
  });
  input.addEventListener('blur', () => setTimeout(() => { box.style.display = 'none'; }, 120));
}

async function agregarInvitado(proveedorId) {
  if (!COT_ACTUAL) return;
  const bloque = bloqueActual();
  const { data, error } = await SB.from('compras_cotizaciones_proveedores')
    .insert({ cotizacion_id: COT_ACTUAL.id, proveedor_id: proveedorId, bloque }).select().single();
  if (error) { toast(error.message, 'er'); return; }
  const prov = PROVEEDORES.find(p => p.id === proveedorId);
  INVITADOS.push({ id: data.id, proveedor_id: proveedorId, bloque, condicion_pago: '', nombre: prov?.nombre || '(?)' });
  COL_MONEDA[proveedorId] = COL_MONEDA[proveedorId] || 'ARS';
  INVITADOS_RESUMEN.push({ cotizacion_id: COT_ACTUAL.id });
  renderInvitados();
  renderTablaComparativa();
  renderResumenProveedores();
}

// Pedido del director financiero (2026-09-10): el informe de reparto no
// decía a qué condición de pago se le compra a cada proveedor. Se guarda
// por proveedor invitado (no por ítem/precio) — mismas opciones fijas que
// ya usa Notas de Pedido (ver CLAUDE.md 8.3), para no inventar una lista
// nueva.
async function guardarCondicionPago(invId, condicionPago) {
  const { error } = await SB.from('compras_cotizaciones_proveedores').update({ condicion_pago: condicionPago || null }).eq('id', invId);
  if (error) { toast(error.message, 'er'); return; }
  const inv = INVITADOS.find(i => i.id === invId);
  if (inv) inv.condicion_pago = condicionPago || '';
}

// Proveedor "detectado" (solo aparece en OC, sin ficha en compras_proveedores
// todavía) — se le crea la ficha real en el momento, mismo criterio que
// "➕ Completar datos" en Proveedores → Catálogo, porque invitar necesita
// un proveedor_id real.
async function agregarInvitadoDetectado(nombre, codTango) {
  const { data: nuevo, error } = await SB.from('compras_proveedores')
    .insert({ nombre, cod_tango: codTango || null }).select().single();
  if (error) { toast(error.message, 'er'); return; }
  PROVEEDORES.push(nuevo);
  toast(`✓ Ficha creada para "${nombre}"`);
  await agregarInvitado(nuevo.id);
}

async function quitarInvitado(invId, proveedorId) {
  if (!confirm('¿Quitar a este proveedor de la solicitud? Se van a borrar los precios que le cargaste.')) return;
  // Un mismo proveedor puede estar invitado a más de un bloque de la misma
  // solicitud (ver 9.2) — hay que borrar/limpiar solo lo de ESTE bloque, no
  // sus precios/ganador en los demás bloques donde también esté invitado.
  const bloqueInv = INVITADOS.find(i => i.id === invId)?.bloque || '';
  const itemIds = ITEMS.filter(i => (i.bloque || '') === bloqueInv).map(i => i.id);
  if (itemIds.length) {
    const { error: eDel } = await SB.from('compras_cotizaciones_precios').delete().eq('proveedor_id', proveedorId).in('item_id', itemIds);
    if (eDel) { toast(eDel.message, 'er'); return; }
  }
  const { error } = await SB.from('compras_cotizaciones_proveedores').delete().eq('id', invId);
  if (error) { toast(error.message, 'er'); return; }

  const afectados = ITEMS.filter(it => (it.bloque || '') === bloqueInv && it.ganador_proveedor_id === proveedorId).map(it => it.id);
  if (afectados.length) {
    await SB.from('compras_cotizaciones_items').update({ ganador_proveedor_id: null, ganador_manual: false, confirmado: false }).in('id', afectados);
  }

  INVITADOS = INVITADOS.filter(i => i.id !== invId);
  PRECIOS = PRECIOS.filter(p => !(p.proveedor_id === proveedorId && itemIds.includes(p.item_id)));
  ITEMS.forEach(it => { if ((it.bloque || '') === bloqueInv && it.ganador_proveedor_id === proveedorId) { it.ganador_proveedor_id = null; it.ganador_manual = false; it.confirmado = false; } });
  const idxResumen = INVITADOS_RESUMEN.findIndex(i => i.cotizacion_id === COT_ACTUAL.id);
  if (idxResumen >= 0) INVITADOS_RESUMEN.splice(idxResumen, 1);

  renderInvitados();
  renderTablaComparativa();
  renderResumenProveedores();
}

function renderInvitados() {
  const cont = document.getElementById('cot_invitados_chips');
  if (!cont) return;
  const lista = invitadosVisibles();
  if (!lista.length) { cont.innerHTML = '<span style="color:var(--muted);font-size:13px">Todavía no invitaste a ningún proveedor a este bloque</span>'; return; }
  cont.innerHTML = lista.map(inv => `
    <span class="cot-chip">${escAttr(inv.nombre)}
      <button type="button" class="cot-quitar-invitado" data-id="${inv.id}" data-prov="${inv.proveedor_id}" title="Quitar">×</button>
    </span>`).join('');
}

// ------------------------------------------------------------
// Precios y comparativa
// ------------------------------------------------------------
// El más barato solo se resalta/sugiere cuando todos los precios
// cargados en la fila comparten la misma moneda — comparar ARS
// contra USD a ojo, no se inventa una cotización de cambio.
function cheapestForItem(itemId) {
  const preciosItem = PRECIOS.filter(p => p.item_id === itemId && p.precio_unitario != null);
  if (!preciosItem.length) return null;
  const monedas = new Set(preciosItem.map(p => p.moneda));
  if (monedas.size > 1) return null;
  let mejor = preciosItem[0];
  for (const p of preciosItem) if (Number(p.precio_unitario) < Number(mejor.precio_unitario)) mejor = p;
  return { proveedorId: mejor.proveedor_id, precio: Number(mejor.precio_unitario), moneda: mejor.moneda };
}

// Mientras ganador_manual esté en false, el ganador sugerido sigue
// al más barato a medida que se cargan precios. En cuanto el
// usuario elige uno a mano (setGanador), esa fila se "traba" y deja
// de recalcularse sola — necesario para poder reasignar ítems entre
// proveedores y cumplir mínimos de compra sin que el sistema lo pise.
async function aplicarGanadorAutomatico(itemId) {
  const item = ITEMS.find(i => i.id === itemId);
  if (!item || item.ganador_manual) return;
  const mejor = cheapestForItem(itemId);
  const nuevoGanador = mejor ? mejor.proveedorId : null;
  if (item.ganador_proveedor_id === nuevoGanador) return;
  const { error } = await SB.from('compras_cotizaciones_items').update({ ganador_proveedor_id: nuevoGanador }).eq('id', itemId);
  if (error) { toast(error.message, 'er'); return; }
  item.ganador_proveedor_id = nuevoGanador;
}

async function setGanador(itemId, proveedorId) {
  const item = ITEMS.find(i => i.id === itemId);
  if (!item) return;
  const valor = proveedorId || null;
  const { error } = await SB.from('compras_cotizaciones_items').update({ ganador_proveedor_id: valor, ganador_manual: true }).eq('id', itemId);
  if (error) { toast(error.message, 'er'); return; }
  item.ganador_proveedor_id = valor;
  item.ganador_manual = true;
  renderTablaComparativa();
  renderResumenProveedores();
}

async function resetGanadorAuto(itemId) {
  const item = ITEMS.find(i => i.id === itemId);
  if (!item) return;
  item.ganador_manual = false;
  await SB.from('compras_cotizaciones_items').update({ ganador_manual: false }).eq('id', itemId);
  await aplicarGanadorAutomatico(itemId);
  renderTablaComparativa();
  renderResumenProveedores();
}

async function guardarPrecio(itemId, proveedorId, valorStr) {
  const v = (valorStr || '').trim();
  if (v === '') {
    const { error } = await SB.from('compras_cotizaciones_precios').delete().eq('item_id', itemId).eq('proveedor_id', proveedorId);
    if (error) { toast(error.message, 'er'); return; }
    PRECIOS = PRECIOS.filter(p => !(p.item_id === itemId && p.proveedor_id === proveedorId));
  } else {
    // El input ahora es texto libre (ver más abajo por qué), así que
    // acepta coma decimal además de punto — el resto de la app siempre
    // MUESTRA los precios con coma (formato es-AR), tiene sentido
    // aceptarla también al tipear.
    const precio = Number(v.replace(',', '.'));
    if (!isFinite(precio)) { toast('Precio inválido', 'er'); return; }
    const moneda = COL_MONEDA[proveedorId] || 'ARS';
    const { data, error } = await SB.from('compras_cotizaciones_precios')
      .upsert({ item_id: itemId, proveedor_id: proveedorId, precio_unitario: precio, moneda }, { onConflict: 'item_id,proveedor_id' })
      .select().single();
    if (error) { toast(error.message, 'er'); return; }
    PRECIOS = [...PRECIOS.filter(p => !(p.item_id === itemId && p.proveedor_id === proveedorId)), data];
  }
  await aplicarGanadorAutomatico(itemId);
  renderTablaComparativa();
  renderResumenProveedores();
}

// La cantidad (cant_umc) que trae el archivo de Capataz es un cálculo
// TEÓRICO (peso nominal según tabla, no lo que realmente se termina
// comprando) — un caso real del usuario: pidió 107,930549 KGS de una
// planchuela pero terminó comprando 112,62 KGS porque se vende en barras
// de largo fijo, no al corte exacto. Se necesitaba poder corregir esa
// cantidad a mano para que el resto de la comparativa (Resumen por
// proveedor, subtotales, informe de reparto) sume lo realmente comprado
// en vez del estimado de Capataz. Igual que guardarPrecio(), acepta coma
// o punto decimal y no se puede dejar vacío (a diferencia del precio, la
// cantidad participa en todos los cálculos de esta fila, no tiene un
// estado "sin cargar" válido).
async function guardarCantidadItem(itemId, valorStr) {
  const v = (valorStr || '').trim().replace(',', '.');
  const cantidad = Number(v);
  if (v === '' || !isFinite(cantidad) || cantidad < 0) {
    toast('Cantidad inválida', 'er');
    renderTablaComparativa();
    return;
  }
  const { error } = await SB.from('compras_cotizaciones_items').update({ cant_umc: cantidad }).eq('id', itemId);
  if (error) { toast(error.message, 'er'); return; }
  ITEMS = ITEMS.map(it => it.id === itemId ? { ...it, cant_umc: cantidad } : it);
  toast('✓ Cantidad actualizada');
  renderTablaComparativa();
  renderResumenProveedores();
}

// El selector de moneda del encabezado es solo el default para el PRÓXIMO
// precio (ver 9.2) — a propósito, para no pisar en silencio una celda que
// ya se cargó bien en otra moneda (ver el caso real de monedas mezcladas
// del 2026-08-28). Pero si TODAS las celdas de la columna quedaron mal
// cargadas porque no se cambió el selector antes de empezar a tipear (caso
// real reportado por el usuario), corregir precio por precio es tedioso —
// esta función ofrece, como paso explícito confirmado por el usuario (no
// automático), re-etiquetar de una sola vez los precios ya guardados de
// esa columna a la nueva moneda, sin tocar el número cargado. `forzado`
// (desde el botón "🔁 corregir", a diferencia del cambio de <select>) avisa
// si no había nada para corregir — si no, cambiar el selector sin que
// hubiera precios viejos quedaría en silencio, que es lo esperado ahí.
async function cambiarMonedaColumna(proveedorId, nuevaMoneda, forzado = false) {
  COL_MONEDA[proveedorId] = nuevaMoneda;
  const bloqueItemIds = new Set(ITEMS.filter(i => (i.bloque || '') === bloqueActual()).map(i => i.id));
  const aCorregir = PRECIOS.filter(p => p.proveedor_id === proveedorId && bloqueItemIds.has(p.item_id) && p.moneda !== nuevaMoneda);
  if (!aCorregir.length && forzado) toast(`Esta columna ya está toda en ${nuevaMoneda === 'USD' ? 'U$S' : '$'}`);
  if (aCorregir.length) {
    const cambiar = confirm(`Esta columna ya tiene ${aCorregir.length} precio${aCorregir.length === 1 ? '' : 's'} cargado${aCorregir.length === 1 ? '' : 's'} en la otra moneda.\n\n¿Corregirlos a ${nuevaMoneda === 'USD' ? 'U$S' : '$'} (sin tocar el número, solo la moneda)?`);
    if (cambiar) {
      const ids = aCorregir.map(p => p.id);
      for (let i = 0; i < ids.length; i += 100) {
        const { error } = await SB.from('compras_cotizaciones_precios').update({ moneda: nuevaMoneda }).in('id', ids.slice(i, i + 100));
        if (error) { toast(error.message, 'er'); return; }
      }
      const idsSet = new Set(ids);
      PRECIOS = PRECIOS.map(p => idsSet.has(p.id) ? { ...p, moneda: nuevaMoneda } : p);
      toast(`✓ ${ids.length} precio${ids.length === 1 ? '' : 's'} corregido${ids.length === 1 ? '' : 's'} a ${nuevaMoneda === 'USD' ? 'U$S' : '$'}`);
      const itemIdsAfectados = new Set(aCorregir.map(p => p.item_id));
      await Promise.all([...itemIdsAfectados].map(id => aplicarGanadorAutomatico(id)));
    }
  }
  renderTablaComparativa();
  renderResumenProveedores();
}

// Enter/Tab en una celda de precio (comparativa o modal por proveedor) pasan
// a la celda de abajo en la misma columna, en vez de perder el foco o saltar
// de columna — pedido explícito del usuario para cargar una lista larga sin
// tocar el mouse. Mover el foco con .focus() ya dispara el blur (y por lo
// tanto el 'change'/guardarPrecio()) de la celda anterior solo.
function enfocarPrecioAdyacente(input, delta) {
  const selector = input.classList.contains('cot-precio-input')
    ? `.cot-precio-input[data-prov="${CSS.escape(input.dataset.prov)}"]`
    : '.cotprov-precio-input';
  const columna = Array.from(input.closest('table').querySelectorAll(selector));
  const siguiente = columna[columna.indexOf(input) + delta];
  if (siguiente) siguiente.focus(); else input.blur();
}

function renderTablaComparativa() {
  const wrap = document.getElementById('cot-tabla-wrap');
  if (!wrap) return;

  // Reconstruir la tabla entera en cada render pisa el input en el que
  // el usuario esté escribiendo — pasa seguido: tipea un precio, hace
  // click en la celda de abajo para cargar la siguiente, el blur de la
  // primera dispara guardarPrecio() (async) y cuando termina y
  // re-renderiza, el click en la segunda celda ya le había dado foco —
  // sin esto, el usuario tenía que volver a clickear para poder escribir.
  // selectionStart/setSelectionRange no están soportados en type=number,
  // así que solo se preserva foco + valor, no la posición del cursor.
  const activo = document.activeElement;
  const foco = (activo && wrap.contains(activo) && activo.classList.contains('cot-precio-input'))
    ? { clase: 'cot-precio-input', item: activo.dataset.item, prov: activo.dataset.prov, valor: activo.value }
    : (activo && wrap.contains(activo) && activo.classList.contains('cot-cant-input'))
    ? { clase: 'cot-cant-input', item: activo.dataset.item, valor: activo.value }
    : null;

  const lista = itemsVisibles();
  const invitados = invitadosVisibles();
  const tc = tipoCambioActual();

  // El selector de moneda del encabezado es solo el default para el
  // PRÓXIMO precio que se cargue en esa columna (ver 9.2) — un mismo
  // proveedor puede terminar con precios en más de una moneda si se
  // cambió el selector a mitad de carga. Se avisa con ⚠️ en vez de
  // ocultarlo, porque la comparativa/resumen ya manejan bien monedas
  // mixtas (no comparan entre sí), pero el usuario necesita verlo para
  // poder corregir la celda que cargó con la moneda equivocada.
  const bloqueItemIds = new Set(ITEMS.filter(i => (i.bloque || '') === bloqueActual()).map(i => i.id));
  const headProv = invitados.map(inv => {
    const monedasProv = new Set(PRECIOS.filter(p => p.proveedor_id === inv.proveedor_id && bloqueItemIds.has(p.item_id) && p.precio_unitario != null).map(p => p.moneda));
    const aviso = monedasProv.size > 1
      ? ` <span title="Esta columna tiene precios cargados en más de una moneda — no se comparan entre sí, revisá las celdas" style="cursor:help">⚠️</span>`
      : '';
    return `<th style="min-width:78px;max-width:92px">
      <div class="cot-prov-header-nombre" data-prov="${inv.proveedor_id}" title="${escAttr(inv.nombre)} — click para cargar todos los precios de este proveedor" style="cursor:pointer;text-decoration:underline;text-decoration-style:dotted;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:92px">${escAttr(inv.nombre)}</div>${aviso}
      <select class="cot-moneda-col" data-prov="${inv.proveedor_id}" style="font-size:11px;margin-top:3px;width:auto">
        <option value="ARS" ${(COL_MONEDA[inv.proveedor_id] || 'ARS') === 'ARS' ? 'selected' : ''}>$</option>
        <option value="USD" ${COL_MONEDA[inv.proveedor_id] === 'USD' ? 'selected' : ''}>U$S</option>
      </select>
      <button type="button" class="bsm cot-moneda-aplicar" data-prov="${inv.proveedor_id}" title="Corregir a esta moneda los precios ya cargados en esta columna que están en la otra" style="padding:1px 5px;font-size:10px;margin-top:2px">🔁 corregir</button>
    </th>`;
  }).join('');

  const filas = lista.map(item => {
    const precioPorProv = new Map(PRECIOS.filter(p => p.item_id === item.id).map(p => [p.proveedor_id, p]));
    const mejor = cheapestForItem(item.id);
    const celdasPrecio = invitados.map(inv => {
      const p = precioPorProv.get(inv.proveedor_id);
      const esMejor = mejor && mejor.proveedorId === inv.proveedor_id;
      // El símbolo de la celda muestra la moneda REALMENTE guardada en
      // ese precio (no el selector de la columna, que puede haber
      // cambiado después) — así una celda cargada en la moneda
      // equivocada se nota a simple vista.
      const simbolo = p && p.precio_unitario != null ? `<span style="font-size:10px;color:var(--muted);margin-right:1px">${SIMBOLO(p.moneda)}</span>` : '';
      // Equivalencia en pesos de una celda en dólares, solo de referencia
      // (ver tipoCambioActual()) — no reemplaza el precio real, es una
      // línea chica abajo para poder comparar de un vistazo.
      const equivalencia = (tc && p && p.precio_unitario != null && p.moneda === 'USD')
        ? `<div style="font-size:10px;color:var(--muted)">≈ ${fmtMonto(Number(p.precio_unitario) * tc, 'ARS')}</div>`
        : '';
      return `<td class="${esMejor ? 'cot-precio-min' : ''}" style="white-space:nowrap">
        ${simbolo}<input type="text" inputmode="decimal" class="cot-precio-input" data-item="${item.id}" data-prov="${inv.proveedor_id}"
          value="${p && p.precio_unitario != null ? p.precio_unitario : ''}" placeholder="—">${equivalencia}
      </td>`;
    }).join('');

    const conPrecio = invitados.filter(inv => precioPorProv.has(inv.proveedor_id));
    const opcionesGanador = ['<option value="">–</option>', ...conPrecio.map(inv =>
      `<option value="${inv.proveedor_id}" ${item.ganador_proveedor_id === inv.proveedor_id ? 'selected' : ''}>${escAttr(inv.nombre)}</option>`
    )].join('');
    // Si hay 2+ precios cargados pero no se resaltó ninguno como más
    // barato, es porque están en monedas distintas (ver cheapestForItem)
    // — sin este aviso no se nota por qué esta fila en particular no
    // sugirió ganador solo, a diferencia de una columna con monedas
    // mezcladas (que sí tiene su propio ⚠️ en el encabezado).
    const avisoFilaMixta = (!mejor && conPrecio.length > 1)
      ? `<div style="font-size:10px;color:var(--muted)" title="Los precios cargados en esta fila están en monedas distintas — no se comparan entre sí">⚠️ monedas mezcladas</div>`
      : '';

    return `<tr${item.confirmado ? ' style="background:var(--row-hover)"' : ''}>
      <td><input type="checkbox" class="cot-check-row" data-id="${item.id}" style="width:auto"></td>
      <td>${escAttr(item.cod_articulo)}</td>
      <td>${escAttr(item.descripcion || '')}${item.desc_adicional ? `<div style="font-size:11px;color:var(--muted)">${escAttr(item.desc_adicional)}</div>` : ''}</td>
      <td style="text-align:right;white-space:nowrap">
        <input type="text" inputmode="decimal" class="cot-cant-input" data-item="${item.id}"
          value="${item.cant_umc != null ? item.cant_umc : ''}" style="width:80px;text-align:right;display:inline-block;margin-right:4px">${escAttr(item.umc || '')}
      </td>
      <td style="text-align:center"><span class="badge ${item.a_comprar ? 'aprobado' : 'rechazado'} cot-toggle-comprar" data-id="${item.id}" style="cursor:pointer">${item.a_comprar ? 'Sí' : 'No'}</span></td>
      ${celdasPrecio}
      <td>
        <select class="cot-ganador-sel" data-item="${item.id}" ${conPrecio.length ? '' : 'disabled'}>${opcionesGanador}</select>
        ${item.ganador_manual ? `<button type="button" class="bsm cot-reset-ganador" data-item="${item.id}" title="Volver a automático" style="padding:2px 6px;margin-left:4px">🔄</button>` : ''}
        ${avisoFilaMixta}
        ${item.confirmado ? `<div style="font-size:11px;color:var(--green);margin-top:4px">✅ Confirmada <button type="button" class="bsm cot-deshacer-confirmacion" data-item="${item.id}" title="Deshacer esta confirmación — vuelve a la comparativa" style="padding:1px 5px;margin-left:2px">↩️</button></div>` : ''}
      </td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `<table>
    <thead><tr>
      <th><input type="checkbox" id="cot_check_all" style="width:auto"></th>
      <th>Código</th><th>Descripción</th><th>Cantidad</th><th>Comprar</th>
      ${headProv}
      <th>Ganador</th>
    </tr></thead>
    <tbody>${filas || `<tr><td colspan="${5 + invitados.length + 1}" style="text-align:center;padding:18px;color:var(--muted)">Sin ítems para mostrar en este bloque</td></tr>`}</tbody>
  </table>`;

  actualizarBarraBulk();

  if (foco) {
    const selector = foco.clase === 'cot-precio-input'
      ? `.cot-precio-input[data-item="${CSS.escape(foco.item)}"][data-prov="${CSS.escape(foco.prov)}"]`
      : `.cot-cant-input[data-item="${CSS.escape(foco.item)}"]`;
    const nuevo = wrap.querySelector(selector);
    if (nuevo) {
      nuevo.value = foco.valor;
      nuevo.focus();
    }
  }
}

function renderResumenProveedores() {
  const cont = document.getElementById('cot_resumen_proveedores');
  if (!cont) return;
  const invitados = invitadosVisibles();
  if (!invitados.length) { cont.innerHTML = ''; return; }

  const bloque = bloqueActual();
  const tc = tipoCambioActual();
  cont.innerHTML = invitados.map(inv => {
    // Un ítem marcado "No" (ya hay stock, no se compra) puede tener un
    // ganador sugerido/elegido igual — no tiene sentido borrarlo a mano
    // solo para que no ensucie el resumen (queda el ganador guardado por
    // si se vuelve a marcar "Sí" más adelante), así que el resumen suma
    // solo lo que realmente se va a comprar.
    const ganados = ITEMS.filter(it => (it.bloque || '') === bloque && it.a_comprar && it.ganador_proveedor_id === inv.proveedor_id);
    const porUnidad = new Map();
    const porMoneda = new Map();
    for (const it of ganados) {
      const umc = it.umc || '?';
      porUnidad.set(umc, (porUnidad.get(umc) || 0) + (Number(it.cant_umc) || 0));
      const precio = PRECIOS.find(p => p.item_id === it.id && p.proveedor_id === inv.proveedor_id);
      if (precio && precio.precio_unitario != null) {
        const monto = Number(precio.precio_unitario) * (Number(it.cant_umc) || 0);
        porMoneda.set(precio.moneda, (porMoneda.get(precio.moneda) || 0) + monto);
      }
    }
    const chipsUnidad = [...porUnidad.entries()].map(([u, c]) => `${numFmt(c)} ${escAttr(u)}`).join(' · ') || '–';
    const chipsMonto = [...porMoneda.entries()].map(([m, v]) => fmtMonto(v, m)).join(' + ') || '–';
    // Si el proveedor terminó con monto en más de una moneda (ver 9.2),
    // el tipo de cambio de referencia permite sumarlas en una sola línea
    // — sin esto, "$X + U$S Y" no dice de un vistazo cuál es el total real.
    const combinado = (tc && porMoneda.size > 1)
      ? `<div style="font-size:13px;margin-top:2px;color:var(--muted)">≈ Total combinado: ${fmtMonto([...porMoneda.entries()].reduce((acc, [m, v]) => acc + (m === 'USD' ? v * tc : v), 0), 'ARS')}</div>`
      : '';
    // "Confirmar compra": cierra la decisión para este proveedor aunque
    // no haya sido el más barato en algún ítem ("a pesar de los
    // precios ya le compré", caso real del usuario) — los ítems
    // confirmados se ocultan de la comparativa (ver itemsVisibles()).
    // Cantidad/Monto arriba siguen sumando TODOS los ganados de este
    // proveedor (confirmados o no), es el total real de lo que se le
    // compra; el botón solo cuenta los que todavía faltan confirmar.
    const sinConfirmar = ganados.filter(it => !it.confirmado).length;
    const accionConfirmar = !ganados.length ? '' : sinConfirmar > 0
      ? `<button type="button" class="bsm g cot-confirmar-compra" data-prov="${inv.proveedor_id}" style="margin-top:8px">✅ Confirmar compra (${sinConfirmar})</button>`
      : `<div style="margin-top:8px;font-size:12px;color:var(--green)">✅ OC Generada</div>`;
    return `<div class="cot-resumen-card">
      <div style="font-weight:600">${escAttr(inv.nombre)}</div>
      <div style="font-size:13px;color:var(--muted);margin-top:4px">${ganados.length} ítem${ganados.length === 1 ? '' : 's'} ganado${ganados.length === 1 ? '' : 's'}</div>
      <div style="font-size:13px;margin-top:6px"><strong>Cantidad:</strong> ${chipsUnidad}</div>
      <div style="font-size:13px;margin-top:2px"><strong>Monto:</strong> ${chipsMonto}</div>${combinado}
      <div style="margin-top:8px">
        <label style="font-size:11px;color:var(--muted);margin-bottom:2px">Condición de pago</label>
        <select class="cot-condicion-pago" data-inv="${inv.id}" style="font-size:12px">
          <option value="">Sin definir</option>
          <option value="Contado F/Factura" ${inv.condicion_pago === 'Contado F/Factura' ? 'selected' : ''}>Contado F/Factura</option>
          <option value="7 días F/F" ${inv.condicion_pago === '7 días F/F' ? 'selected' : ''}>7 días F/F</option>
          <option value="15 días" ${inv.condicion_pago === '15 días' ? 'selected' : ''}>15 días</option>
          <option value="30 días" ${inv.condicion_pago === '30 días' ? 'selected' : ''}>30 días</option>
          <option value="45 días" ${inv.condicion_pago === '45 días' ? 'selected' : ''}>45 días</option>
        </select>
      </div>${accionConfirmar}
    </div>`;
  }).join('');
}

// Cierra la decisión de compra a este proveedor: los ítems que ganó en
// este bloque (los que todavía no estaban confirmados) pasan a
// `confirmado = true` y se ocultan de la comparativa. No depende de que
// haya sido el más barato — el usuario puede confirmar a mano aunque el
// resaltado automático hubiera sugerido a otro.
async function confirmarCompraProveedor(proveedorId) {
  const bloque = bloqueActual();
  const pendientes = ITEMS.filter(it => (it.bloque || '') === bloque && it.a_comprar && it.ganador_proveedor_id === proveedorId && !it.confirmado);
  if (!pendientes.length) return;
  const ids = pendientes.map(it => it.id);
  for (let i = 0; i < ids.length; i += 100) {
    const { error } = await SB.from('compras_cotizaciones_items').update({ confirmado: true }).in('id', ids.slice(i, i + 100));
    if (error) { toast(error.message, 'er'); return; }
  }
  ITEMS.forEach(it => { if (ids.includes(it.id)) it.confirmado = true; });
  toast(`✓ OC Generada (${ids.length} ítem${ids.length === 1 ? '' : 's'})`);
  renderTablaComparativa();
  renderResumenProveedores();
  await verificarCierreAutomatico();
}

// Deshacer una confirmación puntual — caso real: el proveedor ganador
// resultó no tener stock de ese ítem después de todo, y hace falta volver
// a la comparativa para ver quién más lo había cotizado. El ganador y los
// precios cargados quedan tal cual estaban (no se borra nada, solo vuelve
// a quedar "pendiente"), así que si el mismo proveedor sigue siendo la
// mejor opción no hay que volver a elegirlo. Si la solicitud ya se había
// cerrado sola (ver verificarCierreAutomatico), se reabre para que no
// quede un ítem pendiente en una solicitud marcada CERRADA.
async function deshacerConfirmacion(itemId) {
  const item = ITEMS.find(i => i.id === itemId);
  if (!item) return;
  const { error } = await SB.from('compras_cotizaciones_items').update({ confirmado: false }).eq('id', itemId);
  if (error) { toast(error.message, 'er'); return; }
  item.confirmado = false;
  toast('✓ Confirmación deshecha — el ítem volvió a la comparativa');
  renderTablaComparativa();
  renderResumenProveedores();
  if (COT_ACTUAL && COT_ACTUAL.estado === 'CERRADA') {
    const { error: e2 } = await SB.from('compras_cotizaciones').update({ estado: 'ABIERTA' }).eq('id', COT_ACTUAL.id);
    if (!e2) {
      COT_ACTUAL.estado = 'ABIERTA';
      const c = COTIZACIONES.find(x => x.id === COT_ACTUAL.id);
      if (c) c.estado = 'ABIERTA';
      renderHeaderDetalle();
      toast('La solicitud se reabrió — quedó un ítem sin confirmar');
    }
  }
}

// Cuando no queda ningún ítem "a comprar" sin confirmar (en NINGÚN
// bloque de la solicitud), se cierra sola — sigue pudiéndose reabrir a
// mano con el botón de siempre si hace falta corregir algo.
async function verificarCierreAutomatico() {
  if (!COT_ACTUAL || COT_ACTUAL.estado === 'CERRADA') return;
  const aComprar = ITEMS.filter(it => it.a_comprar);
  if (!aComprar.length || aComprar.some(it => !it.confirmado)) return;

  const { error } = await SB.from('compras_cotizaciones').update({ estado: 'CERRADA' }).eq('id', COT_ACTUAL.id);
  if (error) { toast(error.message, 'er'); return; }
  COT_ACTUAL.estado = 'CERRADA';
  const c = COTIZACIONES.find(x => x.id === COT_ACTUAL.id);
  if (c) c.estado = 'CERRADA';
  renderHeaderDetalle();
  toast('✓ Todos los ítems quedaron confirmados — la solicitud se cerró sola');
}

// ------------------------------------------------------------
// Modal "cargar precios de un proveedor" — carga enfocada, un
// proveedor a la vez con todos sus ítems en una lista fija (sin el
// vaivén de columnas de la comparativa) y un total en vivo, para poder
// chequear que se está transcribiendo bien la cotización que mandó
// ese proveedor contra el total que figura en su presupuesto. Al
// cerrar, se vuelve a la comparativa de siempre para comparar entre
// todos.
// ------------------------------------------------------------
function abrirModalProveedor(proveedorId) {
  const inv = invitadosVisibles().find(i => i.proveedor_id === proveedorId);
  if (!inv) return;
  PROV_MODAL_ID = proveedorId;
  const titulo = document.getElementById('mCOTPROV_t');
  if (titulo) titulo.textContent = `Cargar precios — ${inv.nombre}`;
  const sel = document.getElementById('cotprov_moneda');
  if (sel) sel.value = COL_MONEDA[proveedorId] || 'ARS';
  renderModalProveedorItems();
  om('mCOTPROV');
}

function renderModalProveedorItems() {
  const tbody = document.getElementById('cotprov_items');
  if (!tbody || !PROV_MODAL_ID) return;
  const lista = itemsVisibles();
  tbody.innerHTML = lista.length ? lista.map(item => {
    const p = PRECIOS.find(pr => pr.item_id === item.id && pr.proveedor_id === PROV_MODAL_ID);
    return `<tr>
      <td>${escAttr(item.cod_articulo)}</td>
      <td>${escAttr(item.descripcion || '')}${item.desc_adicional ? `<div style="font-size:11px;color:var(--muted)">${escAttr(item.desc_adicional)}</div>` : ''}</td>
      <td style="text-align:right;white-space:nowrap">${item.cant_umc != null ? numFmt(item.cant_umc) : '–'} ${escAttr(item.umc || '')}</td>
      <td><input type="text" inputmode="decimal" class="cotprov-precio-input" data-item="${item.id}"
        value="${p && p.precio_unitario != null ? p.precio_unitario : ''}" placeholder="—" style="width:90px;text-align:right"></td>
      <td class="cotprov-subtotal" data-item="${item.id}" style="text-align:right">–</td>
    </tr>`;
  }).join('') : '<tr><td colspan="5" style="text-align:center;padding:18px;color:var(--muted)">Sin ítems para mostrar en este bloque</td></tr>';
  recalcularTotalModalProveedor();
}

// Se recalcula al tipear (evento 'input', sin esperar el guardado) para
// que el total sirva de chequeo en vivo contra el presupuesto del
// proveedor mientras se va cargando — el guardado real en Supabase pasa
// aparte, en el evento 'change' (blur), igual que en la comparativa.
function recalcularTotalModalProveedor() {
  const moneda = document.getElementById('cotprov_moneda')?.value || 'ARS';
  let total = 0;
  document.querySelectorAll('#cotprov_items .cotprov-precio-input').forEach(input => {
    const item = ITEMS.find(i => i.id === input.dataset.item);
    const precio = parseFloat(input.value.replace(',', '.'));
    const celda = document.querySelector(`#cotprov_items .cotprov-subtotal[data-item="${CSS.escape(input.dataset.item)}"]`);
    if (item && isFinite(precio)) {
      const subtotal = precio * (Number(item.cant_umc) || 0);
      total += subtotal;
      if (celda) celda.textContent = fmtMonto(subtotal, moneda);
    } else if (celda) {
      celda.textContent = '–';
    }
  });
  const totalEl = document.getElementById('cotprov_total_val');
  if (totalEl) totalEl.textContent = fmtMonto(total, moneda);
}

// ------------------------------------------------------------
// Delegación de eventos de la vista detalle — la tabla comparativa
// se reconstruye entera en cada render (cambia la cantidad de
// columnas según los proveedores invitados), así que los listeners
// se enganchan una sola vez sobre el contenedor estable, no sobre
// filas/celdas que se van a reemplazar.
// ------------------------------------------------------------
function initDelegacionDetalle() {
  const cont = document.getElementById('cot-vista-detalle');
  if (!cont) return;
  let modoArrastre = null; // null | 'tildar' | 'destildar' — tocar y arrastrar para tildar varias filas seguidas

  cont.addEventListener('mousedown', e => {
    const check = e.target.closest('.cot-check-row');
    if (!check) return;
    modoArrastre = check.checked ? 'destildar' : 'tildar';
    check.checked = modoArrastre === 'tildar';
    actualizarBarraBulk();
    document.body.style.userSelect = 'none';
  });
  cont.addEventListener('mouseover', e => {
    if (!modoArrastre) return;
    const check = e.target.closest('tr')?.querySelector('.cot-check-row');
    if (!check) return;
    check.checked = modoArrastre === 'tildar';
    actualizarBarraBulk();
  });
  document.addEventListener('mouseup', () => { modoArrastre = null; document.body.style.userSelect = ''; });

  cont.addEventListener('click', e => {
    if (e.target.closest('.cot-check-row')) { e.preventDefault(); return; }

    const toggle = e.target.closest('.cot-toggle-comprar');
    if (toggle) { toggleComprarFila(toggle.dataset.id); return; }

    const resetBtn = e.target.closest('.cot-reset-ganador');
    if (resetBtn) { resetGanadorAuto(resetBtn.dataset.item); return; }

    const deshacerBtn = e.target.closest('.cot-deshacer-confirmacion');
    if (deshacerBtn) { deshacerConfirmacion(deshacerBtn.dataset.item); return; }

    const quitar = e.target.closest('.cot-quitar-invitado');
    if (quitar) { quitarInvitado(quitar.dataset.id, quitar.dataset.prov); return; }

    const headerProv = e.target.closest('.cot-prov-header-nombre');
    if (headerProv) { abrirModalProveedor(headerProv.dataset.prov); return; }

    const monedaAplicar = e.target.closest('.cot-moneda-aplicar');
    if (monedaAplicar) {
      const sel = monedaAplicar.closest('th')?.querySelector('.cot-moneda-col');
      if (sel) cambiarMonedaColumna(monedaAplicar.dataset.prov, sel.value, true);
      return;
    }

    const confirmarBtn = e.target.closest('.cot-confirmar-compra');
    if (confirmarBtn) { confirmarCompraProveedor(confirmarBtn.dataset.prov); return; }

    const tabBloque = e.target.closest('.cot-bloque-tab');
    if (tabBloque) {
      BLOQUE_TAB = tabBloque.dataset.bloque;
      poblarTabsBloque();
      renderInvitados();
      renderTablaComparativa();
      renderResumenProveedores();
      return;
    }
  });

  cont.addEventListener('keydown', e => {
    if (!e.target.classList.contains('cot-precio-input')) return;
    if (e.key !== 'Enter' && e.key !== 'Tab') return;
    e.preventDefault();
    enfocarPrecioAdyacente(e.target, e.shiftKey ? -1 : 1);
  });

  cont.addEventListener('change', e => {
    if (e.target.classList.contains('cot-precio-input')) {
      guardarPrecio(e.target.dataset.item, e.target.dataset.prov, e.target.value);
    } else if (e.target.classList.contains('cot-cant-input')) {
      guardarCantidadItem(e.target.dataset.item, e.target.value);
    } else if (e.target.classList.contains('cot-ganador-sel')) {
      setGanador(e.target.dataset.item, e.target.value);
    } else if (e.target.classList.contains('cot-moneda-col')) {
      cambiarMonedaColumna(e.target.dataset.prov, e.target.value);
    } else if (e.target.classList.contains('cot-condicion-pago')) {
      guardarCondicionPago(e.target.dataset.inv, e.target.value);
    } else if (e.target.id === 'cot_check_all') {
      document.querySelectorAll('.cot-check-row').forEach(c => { c.checked = e.target.checked; });
      actualizarBarraBulk();
    }
  });
}

function initModalProveedor() {
  document.getElementById('cotprov_items')?.addEventListener('input', e => {
    if (e.target.classList.contains('cotprov-precio-input')) recalcularTotalModalProveedor();
  });
  document.getElementById('cotprov_items')?.addEventListener('change', e => {
    if (e.target.classList.contains('cotprov-precio-input')) guardarPrecio(e.target.dataset.item, PROV_MODAL_ID, e.target.value);
  });
  document.getElementById('cotprov_items')?.addEventListener('keydown', e => {
    if (!e.target.classList.contains('cotprov-precio-input')) return;
    if (e.key !== 'Enter' && e.key !== 'Tab') return;
    e.preventDefault();
    enfocarPrecioAdyacente(e.target, e.shiftKey ? -1 : 1);
  });
  document.getElementById('cotprov_moneda')?.addEventListener('change', async e => {
    if (PROV_MODAL_ID) await cambiarMonedaColumna(PROV_MODAL_ID, e.target.value);
    renderModalProveedorItems();
  });
  document.getElementById('cotprov_moneda_aplicar')?.addEventListener('click', async () => {
    const sel = document.getElementById('cotprov_moneda');
    if (PROV_MODAL_ID && sel) await cambiarMonedaColumna(PROV_MODAL_ID, sel.value, true);
    renderModalProveedorItems();
  });
}

// ------------------------------------------------------------
export async function render(secId) {
  if (!COTIZACIONES.length) await Promise.all([cargarListado(), cargarProveedores()]);
  if (secId !== 'cot-lista') return;
  if (COT_ACTUAL) return; // se navegó de vuelta con el detalle todavía abierto — se deja como estaba
  renderLista();
}

export function init() {
  document.getElementById('cot_file')?.addEventListener('change', e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) onArchivoCotizacion(file);
  });
  document.getElementById('cot_f_estado')?.addEventListener('change', renderLista);
  document.getElementById('cot_f_q')?.addEventListener('input', renderLista);

  document.getElementById('cot_det_volver')?.addEventListener('click', volverALista);
  document.getElementById('cot_det_nombre')?.addEventListener('blur', guardarNombreDetalle);
  document.getElementById('cot_det_toggle_estado')?.addEventListener('click', toggleEstadoCotizacion);
  document.getElementById('cot_f_ocultar_no_comprar')?.addEventListener('change', renderTablaComparativa);
  document.getElementById('cot_f_mostrar_confirmados')?.addEventListener('change', renderTablaComparativa);
  document.getElementById('cot_exportar')?.addEventListener('click', exportarParaCotizar);
  document.getElementById('cot_informe_reparto')?.addEventListener('click', emitirInformeReparto);
  document.getElementById('cot_f_grupo')?.addEventListener('change', renderTablaComparativa);
  document.getElementById('cot_tipo_cambio')?.addEventListener('input', () => {
    renderTablaComparativa();
    renderResumenProveedores();
  });
  document.getElementById('cot_bulk_si')?.addEventListener('click', () => marcarComprarSeleccionados(true));
  document.getElementById('cot_bulk_no')?.addEventListener('click', () => marcarComprarSeleccionados(false));
  document.getElementById('cot_bulk_bloque_panol')?.addEventListener('click', () => aplicarBloqueSeleccionados('Pañol'));
  document.getElementById('cot_bulk_bloque_despacho')?.addEventListener('click', () => aplicarBloqueSeleccionados('Despacho'));
  document.getElementById('cot_bulk_bloque_gral')?.addEventListener('click', () => aplicarBloqueSeleccionados(''));

  initAutocompleteInvitar();
  initDelegacionDetalle();
  initModalProveedor();

  window.cotizaciones = { abrirDetalle };
}
