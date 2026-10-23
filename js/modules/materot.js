// ============================================================
// Módulo Materiales OT — seguimiento por OT del export de Capataz
// "Gestión personalizada de Ventas y Compras" (archivo real de ejemplo
// del usuario: MatxPro.xlsx, NO va al repo — mismo criterio que
// Excels/ y Cotizar.xlsx). Pedido explícito del usuario (2026-10-02),
// ver CLAUDE.md sección 13 para el detalle completo de la semántica de
// cada columna.
//
// Es una fuente de datos PROPIA, sin relación con el módulo OT (sección
// 10, que lee compras_cotizaciones_*) ni con Cotizaciones: el archivo
// trae, por OT y por artículo, todo el ciclo de vida de un pedido de
// Ingeniería — Cotizado (Presupuestos) → Planificado (Ingeniería,
// puede variar) → Solicitado (lo que Compras tiene pendiente de
// comprar) → Comprado → Asignado de stock → Recibido → Entregado — más
// un flag Estado (OK/DIF) que YA viene calculado por Capataz: se
// muestra tal cual, no se recalcula (mismo criterio de "no inventar"
// que el resto del tablero) — la regla de fondo que explicó el usuario
// es que no se puede entregar más de lo que se compró+recibió / asignó
// de stock, y Capataz ya hace esa cuenta por su cuenta.
//
// El archivo es una FOTO COMPLETA (no trae fecha por fila, no hay forma
// de hacer un reemplazo parcial por rango como en Órdenes de Compra) —
// cada carga reemplaza toda compras_materot_items, igual criterio que
// Stock (ver stock.js).
//
// Conversión a KGS: la primera versión de este módulo tenía que derivar
// un factor kg-por-unidad por artículo a mano, porque el archivo solo
// traía el kg equivalente de "Comprado" (KgsComprados). El usuario
// ajustó el reporte en Capataz (2026-10-02) y ahora el archivo trae el
// kg equivalente de CADA etapa (kg_cotiz, kg_plan, kg_solic,
// KgsComprados, kg_asig, kg_recibido, kg_entregado) — ya no hace falta
// derivar ni cargar ningún factor a mano, se usa directo el valor que
// ya calcula Capataz (mismo criterio de "no inventar" de siempre).
//
// Agrupación de "OT adicionales": el usuario confirmó que no hay ningún
// patrón en el número de OT que permita inferirlo solo (son
// correlativas simples, sin sufijo/letra) — es una relación que solo
// él conoce. Se carga a mano en compras_materot_ot_grupos (OT hija →
// OT madre) desde la sub-vista "Agrupar OT"; el resto del módulo agrupa
// los ítems de toda OT hija bajo su madre antes de mostrarlos.
// ============================================================
import { SB } from '../supabase-client.js';
import { toast, norm, txt, num, fetchAll, escAttr, obtenerDolarReferencia } from '../utils.js';

let ITEMS = [];      // compras_materot_items, todas las filas
let GRUPOS = [];      // compras_materot_ot_grupos — [{n_ot_hija, n_ot_madre}]
let ARCHIVADAS = new Set(); // n_ot (OT efectiva) ya archivadas
let OT_INFO = new Map(); // n_ot -> {nombre_proyecto, cliente} — compras_materot_ot_info

let OT_ACTUAL = null; // OT madre que se está viendo en el detalle; null = vista de tarjetas
let OT_TAB = 'resumen';
let MOSTRAR_ARCHIVADAS = false; // checkbox de "Por OT" — oculta archivadas por defecto

// Costo realizado — cruza cada artículo de Materiales OT contra el
// último precio ganador cargado en Cotizaciones para ese cod_articulo
// (cualquier solicitud, no solo las de esta OT). Lazy: recién se trae
// la primera vez que se abre la sub-pestaña "💰 Costo" de alguna OT, no
// en cada visita al módulo (ver 2026-10-22, pedido explícito del
// usuario — "por ahora lo mismo local, lo que tenemos").
let PRECIO_POR_ARTICULO = null; // cod_articulo -> {precio_unitario, moneda, umc, proveedor_nombre, fecha}

// Precio ganador de Cotizaciones, pero restringido a la misma OT —
// pedido explícito del usuario, 2026-10-24: "a veces algunos precios
// varían según la OT" (distinta cantidad, distinto momento, distinta
// negociación), así que si ESTA OT tuvo su propia solicitud de
// Cotizaciones para el artículo, ese precio pesa más que el genérico
// "más reciente de cualquier OT" de PRECIO_POR_ARTICULO. Se arma en el
// mismo cargarPreciosCotizaciones() (misma data, no una query aparte) —
// ver precioParaItem().
let PRECIO_POR_ARTICULO_OT = null; // `${cod_articulo}|${n_ot formateado}` -> {precio_unitario, moneda, umc, proveedor_nombre, fecha}

// Horas por OT — pedido explícito del usuario, 2026-10-22: sumar las horas
// cargadas en Capataz (vía el Tablero RRHH, tabla horas_ot_detalle — mismo
// proyecto Supabase que éste, sin credenciales nuevas) junto al resto del
// resumen de Costo. Primera versión confirmada con el usuario: solo horas
// por categoría (operación), sin convertir a pesos ni comparar contra
// presupuesto todavía (no existe ninguna fuente de eso en ningún tablero)
// — se suma en una vuelta futura. Mismo filtro que ya aplica el propio
// Tablero RRHH antes de totalizar (excluye horas anómalas >16h/día y
// personal mensual, que carga Capataz de forma inconsistente — ver
// horas-ot.js de ese proyecto), para que los números coincidan entre los
// dos tableros; reusa rrhh_puestos_config/empleados, ya presentes en este
// mismo proyecto (ver js/modules/flota-personal.js). Las OT "adicionales"
// se suman bajo su OT madre, igual que los kilos — comparando por N° de
// OT sin ceros, que es el formato que ya trae esta tabla. Lazy, igual
// criterio que PRECIO_POR_ARTICULO: recién se trae al abrir por primera
// vez la pestaña "💰 Costo".
let HORAS_POR_OT = null; // ot (formateado, sin ceros) -> Map(operación -> horas)

// Última cotización del dólar oficial — se usa solo para PRECARGAR el
// campo "Tipo de cambio" de la pestaña Costo (sigue siendo editable y no
// persiste, igual que siempre). `obtenerDolarReferencia()` (en
// js/utils.js, compartida con Cotizaciones) se completa sola con los
// días recientes que falten antes de devolver el valor — no hace falta
// que nadie entre a Parametrización → Dólar histórico para que esto
// quede razonablemente al día (ver CLAUDE.md 12.6).
let DOLAR_REF = null; // {fecha, compra, venta} | null
async function cargarDolarReferencia() {
  DOLAR_REF = await obtenerDolarReferencia();
  return DOLAR_REF;
}

// Precarga el input de tipo de cambio con la última cotización oficial
// disponible, sin pisar lo que el usuario ya haya tipeado a mano.
function prefillTipoCambio() {
  const input = document.getElementById('mroc_tipo_cambio');
  if (input && !input.value && DOLAR_REF) {
    input.value = String(DOLAR_REF.venta);
    input.title = `Precargado con el dólar oficial del ${new Date(DOLAR_REF.fecha + 'T12:00:00').toLocaleDateString('es-AR')} — se puede editar`;
  }
}

const numFmt = (n, dec = 2) => Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: dec });
const SIMBOLO = m => m === 'USD' ? 'U$S' : '$';
const fmtMonto = (n, moneda) => SIMBOLO(moneda) + (moneda === 'USD' ? ' ' : '') + numFmt(n, 2);
function setTxt(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }

// Capataz trae el N° de OT con ceros a la izquierda ("000000000596") —
// se muestra sin esos ceros ("596"). Solo se recorta si es puramente
// numérico (mismo criterio que formatOT() en js/modules/ot.js,
// duplicado a propósito — son módulos independientes).
function formatOT(ot) {
  if (!ot) return ot;
  return /^\d+$/.test(ot) ? String(parseInt(ot, 10)) : ot;
}

// ------------------------------------------------------------
// Parseo del Excel (export de Capataz — Gestión personalizada de
// Ventas y Compras, variante "por OT" — columnas distintas a las que
// usa Cotizaciones del mismo menú)
// ------------------------------------------------------------
function parseWorkbookMaterot(arrayBuffer, filename) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, cellDates: true, defval: null });
  if (!rows.length) return [];

  const header = rows[0].map(norm);
  const idx = name => header.indexOf(name);
  const col = {
    id: idx('ID'), idVproy: idx('ID_VPROY'), numero: idx('NUMERO'), version: idx('VERSION'),
    estadoProy: idx('ESTADO_PROY'), tOt: idx('T_OT'), nOt: idx('N_OT'), articulo: idx('COD_ARTICU'),
    agrupacion: idx('AGRUPACION'), desc: idx('DESCRIPCIO'), descAdic: idx('DESC_ADIC'), ume: idx('UME'),
    cotiz: idx('CANT_COTIZ'), kgCotiz: idx('KG_COTIZ'), plan: idx('CANT_PLAN'), kgPlan: idx('KG_PLAN'),
    solic: idx('CANT_SOLIC'), kgSolic: idx('KG_SOLIC'), comprado: idx('COMPRADO'),
    kgsComprados: idx('KGSCOMPRADOS'), asig: idx('CANT_ASIG'), kgAsig: idx('KG_ASIG'),
    recibido: idx('RECIBIDO'), kgRecibido: idx('KG_RECIBIDO'), entregado: idx('ENTREGADO'),
    kgEntregado: idx('KG_ENTREGADO'), estado: idx('ESTADO'),
  };
  for (const req of ['nOt', 'articulo']) {
    if (col[req] === -1) throw new Error(`No se encontró la columna esperada en el archivo (falta "${req}").`);
  }

  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every(c => c === null || c === '')) continue;
    const articulo = txt(r[col.articulo]);
    if (!articulo) continue;
    out.push({
      capataz_id: col.id >= 0 ? num(r[col.id]) : null,
      id_vproy: col.idVproy >= 0 ? num(r[col.idVproy]) : null,
      numero: col.numero >= 0 ? txt(r[col.numero]) : null,
      version: col.version >= 0 ? num(r[col.version]) : null,
      estado_proy: col.estadoProy >= 0 ? txt(r[col.estadoProy]) : null,
      t_ot: col.tOt >= 0 ? txt(r[col.tOt]) : null,
      n_ot: txt(r[col.nOt]),
      cod_articulo: articulo,
      agrupacion: col.agrupacion >= 0 ? txt(r[col.agrupacion]) : null,
      descripcion: col.desc >= 0 ? txt(r[col.desc]) : null,
      desc_adicional: col.descAdic >= 0 ? txt(r[col.descAdic]) : null,
      ume: col.ume >= 0 ? txt(r[col.ume]) : null,
      cant_cotiz: num(r[col.cotiz]),
      kg_cotiz: col.kgCotiz >= 0 ? num(r[col.kgCotiz]) : null,
      cant_plan: num(r[col.plan]),
      kg_plan: col.kgPlan >= 0 ? num(r[col.kgPlan]) : null,
      cant_solic: num(r[col.solic]),
      kg_solic: col.kgSolic >= 0 ? num(r[col.kgSolic]) : null,
      comprado: num(r[col.comprado]),
      kgs_comprados: num(r[col.kgsComprados]),
      cant_asig: num(r[col.asig]),
      kg_asig: col.kgAsig >= 0 ? num(r[col.kgAsig]) : null,
      recibido: num(r[col.recibido]),
      kg_recibido: col.kgRecibido >= 0 ? num(r[col.kgRecibido]) : null,
      entregado: num(r[col.entregado]),
      kg_entregado: col.kgEntregado >= 0 ? num(r[col.kgEntregado]) : null,
      estado: col.estado >= 0 ? txt(r[col.estado]) : null,
      archivo_origen: filename,
    });
  }
  return out;
}

async function cargarArchivo(file) {
  let filas;
  try {
    const buf = await file.arrayBuffer();
    filas = parseWorkbookMaterot(buf, file.name);
  } catch (e) {
    toast('No se pudo leer el archivo: ' + e.message, 'er');
    return;
  }
  if (!filas.length) { toast('No se encontraron filas en el archivo', 'er'); return; }

  const ots = new Set(filas.map(f => f.n_ot)).size;
  const dif = filas.filter(f => (f.estado || '').toUpperCase() === 'DIF').length;
  const ok = confirm(
    `Se leyeron ${filas.length} filas de ${ots} OT (${dif} con diferencia "DIF").\n\n` +
    `Esto REEMPLAZA todo lo cargado anteriormente en este módulo (es una foto completa, no un incremental).\n\n¿Continuar?`
  );
  if (!ok) return;

  const { error: delErr } = await SB.from('compras_materot_items').delete().not('id', 'is', null);
  if (delErr) { toast(delErr.message, 'er'); return; }

  const chunkSize = 500;
  for (let i = 0; i < filas.length; i += chunkSize) {
    const chunk = filas.slice(i, i + chunkSize);
    const { error } = await SB.from('compras_materot_items').insert(chunk);
    if (error) { toast('Error insertando: ' + error.message, 'er'); return; }
  }
  toast(`✓ ${filas.length} filas cargadas (${ots} OT)`);
  render('materot-cards');
}

// ------------------------------------------------------------
// Nombre de proyecto / cliente por OT — export de REFERENCIA aparte
// (distinto del de ítems, ver nota de cabecera y CLAUDE.md 13).
// Solo sirve para mostrar, no se cruza con ninguna otra tabla.
// ------------------------------------------------------------
function parseWorkbookOtInfo(arrayBuffer, filename) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, cellDates: true, defval: null });
  if (!rows.length) return [];

  const header = rows[0].map(norm);
  const idx = name => header.indexOf(name);
  const col = { nOt: idx('N_OT'), nombre: idx('NOMBRE'), cliente: idx('RAZON_SOCI'), fecha: idx('FECHA') };
  if (col.nOt === -1) throw new Error('No se encontró la columna esperada en el archivo (falta "n_ot").');

  // El mismo n_ot puede aparecer más de una vez (distintos presupuestos/
  // versiones a lo largo del tiempo) — se usa la fila de fecha más
  // reciente para quedarse con el nombre/cliente vigente.
  const porOT = new Map();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every(c => c === null || c === '')) continue;
    const nOt = txt(r[col.nOt]);
    if (!nOt) continue;
    const fecha = col.fecha >= 0 && r[col.fecha] instanceof Date ? r[col.fecha].getTime() : 0;
    const previa = porOT.get(nOt);
    if (previa && previa.fecha >= fecha) continue;
    porOT.set(nOt, {
      n_ot: nOt,
      nombre_proyecto: col.nombre >= 0 ? txt(r[col.nombre]) : null,
      cliente: col.cliente >= 0 ? txt(r[col.cliente]) : null,
      archivo_origen: filename,
      fecha,
    });
  }
  return [...porOT.values()].map(({ fecha, ...resto }) => resto);
}

async function cargarArchivoInfo(file) {
  let filas;
  try {
    const buf = await file.arrayBuffer();
    filas = parseWorkbookOtInfo(buf, file.name);
  } catch (e) {
    toast('No se pudo leer el archivo: ' + e.message, 'er');
    return;
  }
  if (!filas.length) { toast('No se encontraron filas en el archivo', 'er'); return; }

  const ok = confirm(
    `Se leyeron nombres de proyecto/cliente para ${filas.length} OT.\n\n` +
    `Esto REEMPLAZA todos los nombres cargados anteriormente.\n\n¿Continuar?`
  );
  if (!ok) return;

  const { error: delErr } = await SB.from('compras_materot_ot_info').delete().not('n_ot', 'is', null);
  if (delErr) { toast(delErr.message, 'er'); return; }

  const chunkSize = 500;
  for (let i = 0; i < filas.length; i += chunkSize) {
    const chunk = filas.slice(i, i + chunkSize);
    const { error } = await SB.from('compras_materot_ot_info').insert(chunk);
    if (error) { toast('Error insertando: ' + error.message, 'er'); return; }
  }
  toast(`✓ Nombres cargados para ${filas.length} OT`);
  await cargarTodo();
  if (OT_ACTUAL !== null) renderDetalle(); else renderCards();
}

// ------------------------------------------------------------
// Carga de datos
// ------------------------------------------------------------
async function cargarTodo() {
  const [{ data: items, error: e1 }, { data: grupos, error: e2 }, { data: arch, error: e3 }, { data: info, error: e4 }] = await Promise.all([
    fetchAll(() => SB.from('compras_materot_items').select('*')),
    SB.from('compras_materot_ot_grupos').select('*').then(r => r),
    SB.from('compras_materot_ot_archivadas').select('n_ot').then(r => r),
    fetchAll(() => SB.from('compras_materot_ot_info').select('*')),
  ]);
  const error = e1 || e2 || e3 || e4;
  if (error) { toast(error.message, 'er'); return; }
  ITEMS = items || [];
  GRUPOS = grupos || [];
  OT_INFO = new Map((info || []).map(i => [i.n_ot, i]));
  ARCHIVADAS = new Set((arch || []).map(a => a.n_ot));
}

const esArchivada = ot => ARCHIVADAS.has(ot);

// ------------------------------------------------------------
// Agrupación OT hija → madre
// ------------------------------------------------------------
function mapaMadres() {
  return new Map(GRUPOS.map(g => [g.n_ot_hija, g.n_ot_madre]));
}

// Mismo mapaMadres() pero con las claves/valores formateados (sin ceros a
// la izquierda) — es el formato en el que horas_ot_detalle.ot ya viene
// guardado (ver cargarHorasPorOT()), a diferencia de compras_materot_items
// .n_ot que conserva los ceros.
function mapaMadresFormateado() {
  const m = mapaMadres();
  const out = new Map();
  for (const [hija, madre] of m) out.set(formatOT(hija), formatOT(madre));
  return out;
}

function otEfectiva(nOt, madres) {
  const ot = (nOt || '').trim();
  return madres.get(ot) || ot;
}

function agruparPorOTMadre() {
  const madres = mapaMadres();
  const grupos = new Map();
  for (const it of ITEMS) {
    const ot = otEfectiva(it.n_ot, madres);
    if (!grupos.has(ot)) grupos.set(ot, []);
    grupos.get(ot).push(it);
  }
  return grupos;
}

// ------------------------------------------------------------
// Conversión a KGS — ver nota de cabecera. Capataz ya trae el kg
// equivalente de cada etapa, no hace falta derivar ni cargar nada.
// ------------------------------------------------------------
function kgsItem(item) {
  return {
    cotiz: Number(item.kg_cotiz || 0),
    plan: Number(item.kg_plan || 0),
    solic: Number(item.kg_solic || 0),
    comprado: Number(item.kgs_comprados || 0),
    asig: Number(item.kg_asig || 0),
    recibido: Number(item.kg_recibido || 0),
    entregado: Number(item.kg_entregado || 0),
  };
}

function sumarKg(items) {
  const tot = { cotiz: 0, plan: 0, solic: 0, comprado: 0, asig: 0, recibido: 0, entregado: 0 };
  for (const it of items) {
    const k = kgsItem(it);
    for (const campo of Object.keys(tot)) tot[campo] += k[campo];
  }
  return { tot };
}

// Un ítem "sin movimiento" tiene las 7 cantidades en KGS en cero — caso
// real (2026-10-22, archivo MP.xlsx): Capataz lista, para cada OT, todo
// un catálogo de variantes posibles del rubro (ej. decenas de arandelas)
// aunque esa obra puntual no haya necesitado la mayoría — ~50% de las
// filas de cualquier archivo real quedan así. No es un error de carga
// (se confirmó comparando el Excel crudo contra lo ya guardado, fila por
// fila, byte a byte) — es ruido de catálogo que convenía poder ocultar.
function tieneMovimiento(it) {
  const k = kgsItem(it);
  return Object.values(k).some(v => v !== 0);
}

// `agrupacion` (el rubro — CHAPAS/PERFIL/ANGULO/BULONE/etc., ver
// CLAUDE.md 13) ya se parseaba y guardaba desde el principio, pero
// ningún gráfico ni filtro lo usaba todavía — "qué más se puede armar
// con esta información" (pedido del usuario, 2026-10-22).
function kgPorRubro(items, campo = 'comprado') {
  const porRubro = new Map();
  for (const it of items) {
    const rubro = it.agrupacion || '(Sin rubro)';
    const kg = kgsItem(it)[campo];
    porRubro.set(rubro, (porRubro.get(rubro) || 0) + kg);
  }
  return porRubro;
}

// Cotizado vs. Cubierto (comprado+asignado) por rubro — el "presupuesto
// en kg" de Presupuestos contra lo que realmente se terminó usando, para
// ver de un vistazo en qué rubros la OT se desvió más. Ver CLAUDE.md
// sección 13.10 ("Resumen enriquecido").
function kgPorRubroMulti(items) {
  const m = new Map();
  for (const it of items) {
    const rubro = it.agrupacion || '(Sin rubro)';
    const k = kgsItem(it);
    const cur = m.get(rubro) || { cotiz: 0, cubierto: 0 };
    cur.cotiz += k.cotiz;
    cur.cubierto += k.comprado + k.asig;
    m.set(rubro, cur);
  }
  return m;
}

function renderBarrasCotizadoVsCubierto(canvasId, items, topN = 8) {
  const porRubro = kgPorRubroMulti(items);
  const datos = [...porRubro.entries()]
    .filter(([, v]) => v.cotiz > 0 || v.cubierto > 0)
    .sort((a, b) => (b[1].cotiz + b[1].cubierto) - (a[1].cotiz + a[1].cubierto))
    .slice(0, topN);
  renderChart(canvasId, canvasId, {
    type: 'bar',
    data: {
      labels: datos.map(d => d[0]),
      datasets: [
        { label: 'Cotizado', data: datos.map(d => d[1].cotiz), backgroundColor: '#64748b', borderRadius: 4 },
        { label: 'Cubierto', data: datos.map(d => d[1].cubierto), backgroundColor: '#6366f1', borderRadius: 4 },
      ],
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${numFmt(ctx.raw)} KGS` } } },
      scales: { x: { ticks: { callback: v => numFmt(v) } } },
    },
  });
}

// Artículos donde Cubierto (comprado+asignado) más se aleja de lo que
// Presupuestos cotizó en kg — pensado para afinar la próxima cotización,
// no para "corregir" nada acá. `tieneMovimiento()` descarta el ruido de
// catálogo (ver sección 13.5) antes de comparar.
function topDesvios(items, topN = 8) {
  return items
    .filter(tieneMovimiento)
    .map(it => {
      const k = kgsItem(it);
      const cubierto = k.comprado + k.asig;
      const desvioKg = cubierto - k.cotiz;
      const desvioPct = k.cotiz > 0 ? (desvioKg / k.cotiz * 100) : null;
      return { it, cotiz: k.cotiz, cubierto, desvioKg, desvioPct };
    })
    .filter(f => f.cotiz > 0 || f.cubierto > 0)
    .sort((a, b) => Math.abs(b.desvioKg) - Math.abs(a.desvioKg))
    .slice(0, topN);
}

function renderTablaDesvios(tbodyId, items) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  const filas = topDesvios(items);
  tbody.innerHTML = filas.length ? filas.map(f => {
    const color = f.desvioKg > 0.01 ? 'var(--red)' : (f.desvioKg < -0.01 ? 'var(--green)' : 'var(--muted)');
    const signo = f.desvioKg > 0 ? '+' : '';
    const pctTxt = f.desvioPct == null ? '–' : `${f.desvioPct > 0 ? '+' : ''}${Math.round(f.desvioPct)}%`;
    return `<tr>
      <td>${escAttr(f.it.cod_articulo)}</td>
      <td>${escAttr(f.it.descripcion || '')}</td>
      <td>${escAttr(f.it.agrupacion || '–')}</td>
      <td style="text-align:right">${numFmt(f.cotiz)}</td>
      <td style="text-align:right">${numFmt(f.cubierto)}</td>
      <td style="text-align:right;color:${color};font-weight:600">${signo}${numFmt(f.desvioKg)}</td>
      <td style="text-align:right;color:${color}">${pctTxt}</td>
    </tr>`;
  }).join('') : `<tr><td colspan="7" style="text-align:center;padding:18px;color:var(--muted)">Sin datos suficientes para comparar (ningún artículo con Cotizado o Cubierto cargado)</td></tr>`;
}

// ------------------------------------------------------------
// Costo realizado — cruza por cod_articulo contra Cotizaciones. Ver
// nota de PRECIO_POR_ARTICULO más arriba y CLAUDE.md sección 13.9.
// ------------------------------------------------------------
async function cargarPreciosCotizaciones() {
  if (PRECIO_POR_ARTICULO) return PRECIO_POR_ARTICULO;
  const [{ data: items, error: e1 }, { data: precios, error: e2 }, { data: cots, error: e3 }, { data: provs, error: e4 }] = await Promise.all([
    fetchAll(() => SB.from('compras_cotizaciones_items').select('id,cotizacion_id,cod_articulo,umc,ganador_proveedor_id,n_ot')),
    fetchAll(() => SB.from('compras_cotizaciones_precios').select('item_id,proveedor_id,precio_unitario,moneda')),
    fetchAll(() => SB.from('compras_cotizaciones').select('id,created_at')),
    fetchAll(() => SB.from('compras_proveedores').select('id,nombre')),
  ]);
  const error = e1 || e2 || e3 || e4;
  if (error) { toast(error.message, 'er'); PRECIO_POR_ARTICULO = new Map(); PRECIO_POR_ARTICULO_OT = new Map(); return PRECIO_POR_ARTICULO; }

  const precioPorClave = new Map((precios || []).map(p => [`${p.item_id}|${p.proveedor_id}`, p]));
  const fechaCot = new Map((cots || []).map(c => [c.id, c.created_at || '']));
  const nombreProv = new Map((provs || []).map(p => [p.id, p.nombre]));

  // Un mismo artículo puede haberse cotizado varias veces, en distintas
  // solicitudes — se toma el precio de la cotización más reciente (por
  // fecha de creación de la solicitud) que tenga un ganador con precio
  // cargado, no un promedio ni el más bajo histórico (mismo criterio de
  // "no inventar" de siempre: es el dato real más actual que hay). Esto
  // da el mapa GENÉRICO (cualquier OT); en paralelo se arma uno POR OT
  // (mismo criterio de "más reciente"), para artículos cuyo precio varía
  // según la OT (ver nota de PRECIO_POR_ARTICULO_OT).
  const mapa = new Map();
  const mapaPorOT = new Map();
  for (const it of (items || [])) {
    if (!it.ganador_proveedor_id) continue;
    const precio = precioPorClave.get(`${it.id}|${it.ganador_proveedor_id}`);
    if (!precio || precio.precio_unitario == null) continue;
    const fecha = fechaCot.get(it.cotizacion_id) || '';
    const info = {
      precio_unitario: Number(precio.precio_unitario),
      moneda: precio.moneda,
      umc: it.umc,
      proveedor_nombre: nombreProv.get(it.ganador_proveedor_id) || '(?)',
      fecha,
    };
    const actual = mapa.get(it.cod_articulo);
    if (!actual || fecha > actual.fecha) mapa.set(it.cod_articulo, info);

    const otF = formatOT((it.n_ot || '').trim());
    if (otF) {
      const clave = `${it.cod_articulo}|${otF}`;
      const actualOT = mapaPorOT.get(clave);
      if (!actualOT || fecha > actualOT.fecha) mapaPorOT.set(clave, info);
    }
  }
  PRECIO_POR_ARTICULO = mapa;
  PRECIO_POR_ARTICULO_OT = mapaPorOT;
  return mapa;
}

// Mismo artículo del mismo catálogo de Capataz, así que la unidad de
// compra debería coincidir entre los dos módulos — si no coincide, no
// se inventa una conversión, se marca aparte (ver renderCosto()).
function unidadesCompatibles(a, b) {
  return (a || '').trim().toUpperCase() === (b || '').trim().toUpperCase();
}

// Ver nota de HORAS_POR_OT más arriba y CLAUDE.md sección 13.9 (horas).
function normPuesto(s) { return (s || '').trim().toUpperCase(); }

async function cargarHorasPorOT() {
  if (HORAS_POR_OT) return HORAS_POR_OT;
  const [{ data: filas, error: e1 }, { data: config, error: e2 }, { data: emps, error: e3 }] = await Promise.all([
    fetchAll(() => SB.from('horas_ot_detalle').select('ot,legajo,empresa,operacion,horas').eq('anomalo', false).not('ot', 'is', null)),
    fetchAll(() => SB.from('rrhh_puestos_config').select('desc_puesto,tipo')),
    fetchAll(() => SB.from('empleados').select('legajo,empresa,desc_puesto')),
  ]);
  const error = e1 || e2 || e3;
  if (error) { toast(error.message, 'er'); HORAS_POR_OT = new Map(); return HORAS_POR_OT; }

  // Mismo criterio que tipoPuesto()/obtenerClasificacionPuestos() del
  // Tablero RRHH (data/clasificacion-puestos.js): un puesto sin fila en
  // rrhh_puestos_config queda "sin_asignar" — solo se excluye 'mensual'.
  const tipoPorPuesto = new Map((config || []).map(c => [normPuesto(c.desc_puesto), c.tipo]));
  const puestoPorEmpleado = new Map((emps || []).map(e => [`${e.empresa}|${e.legajo}`, e.desc_puesto]));
  const esMensual = (empresa, legajo) => {
    const puesto = puestoPorEmpleado.get(`${empresa}|${legajo}`);
    return (tipoPorPuesto.get(normPuesto(puesto)) || 'sin_asignar') === 'mensual';
  };

  const madresF = mapaMadresFormateado();
  const mapa = new Map();
  for (const f of (filas || [])) {
    if (esMensual(f.empresa, f.legajo)) continue;
    const ot = madresF.get(f.ot) || f.ot;
    const categoria = f.operacion || '(Sin categoría)';
    if (!mapa.has(ot)) mapa.set(ot, new Map());
    const porCategoria = mapa.get(ot);
    porCategoria.set(categoria, (porCategoria.get(categoria) || 0) + Number(f.horas || 0));
  }
  HORAS_POR_OT = mapa;
  return mapa;
}

// Cotizaciones cotiza perfiles/chapas/ángulos por KG (ver CLAUDE.md 9.1)
// aunque Materiales OT los mida nativamente en MTS/MT2 — son el mismo
// peso físico, no dos unidades distintas, y Materiales OT ya trae ese
// kg equivalente para cada etapa (kgsItem(), ver 13.2). Por eso, cuando
// el precio ganador está cotizado en KGS, se usa siempre el equivalente
// en kg del ítem (sin importar en qué unidad lo mida esta OT) — recién
// si el precio está en otra unidad (UNI/LTS, ej. bulonería/pintura) se
// exige que coincida con la unidad nativa del ítem, como antes. Pedido
// explícito del usuario, 2026-10-22 ("siempre se tiene que tomar el KG
// como unidad de medida").
function cantidadParaCosto(it, precioInfo) {
  if ((precioInfo.umc || '').trim().toUpperCase() === 'KGS') {
    const k = kgsItem(it);
    return { comprado: k.comprado, asig: k.asig, unidad: 'KGS' };
  }
  if (!unidadesCompatibles(it.ume, precioInfo.umc)) return null;
  return { comprado: Number(it.comprado || 0), asig: Number(it.cant_asig || 0), unidad: it.ume || '' };
}

function chipsMonto(mapa) {
  return [...mapa.entries()].map(([m, v]) => fmtMonto(v, m)).join(' + ') || '–';
}

// Precio a usar para UN ítem puntual: primero el precio ganador que haya
// salido de una solicitud de Cotizaciones para la MISMA OT (más reciente
// si hubo más de una), y solo si no hay ninguno, el genérico más reciente
// de cualquier OT (PRECIO_POR_ARTICULO). Ver nota de PRECIO_POR_ARTICULO_OT
// más arriba — pedido explícito del usuario, 2026-10-24.
function precioParaItem(it) {
  const otF = formatOT((it.n_ot || '').trim());
  if (otF && PRECIO_POR_ARTICULO_OT) {
    const porOT = PRECIO_POR_ARTICULO_OT.get(`${it.cod_articulo}|${otF}`);
    if (porOT) return { info: porOT, especifico: true };
  }
  const global = PRECIO_POR_ARTICULO?.get(it.cod_articulo);
  return global ? { info: global, especifico: false } : null;
}

// Valoriza una lista de ítems contra Cotizaciones — "Costo realizado"
// (Comprado × precio) y "Ahorro por stock asignado" (Asignado × precio).
// Extraída de renderCosto() para que el Resumen la reuse sin duplicar la
// lógica (ver renderResumenOT()). Llamar solo si PRECIO_POR_ARTICULO ya
// está cargado.
function calcularCosto(items) {
  const costoPorMoneda = new Map();
  const ahorroPorMoneda = new Map();
  let nValorizados = 0, nSinPrecio = 0;
  const filas = items.map(it => {
    const encontrado = precioParaItem(it);
    const precioInfo = encontrado?.info || null;
    const cant = precioInfo ? cantidadParaCosto(it, precioInfo) : null;
    if (!precioInfo || !cant) {
      nSinPrecio++;
      return { it, precioInfo: null, motivo: precioInfo ? 'unidad distinta' : 'sin cotización' };
    }
    nValorizados++;
    const precioEspecifico = encontrado.especifico;
    const costoComprado = cant.comprado * precioInfo.precio_unitario;
    const ahorroStock = cant.asig * precioInfo.precio_unitario;
    costoPorMoneda.set(precioInfo.moneda, (costoPorMoneda.get(precioInfo.moneda) || 0) + costoComprado);
    ahorroPorMoneda.set(precioInfo.moneda, (ahorroPorMoneda.get(precioInfo.moneda) || 0) + ahorroStock);
    return { it, precioInfo, cant, costoComprado, ahorroStock, precioEspecifico };
  });
  return { filas, costoPorMoneda, ahorroPorMoneda, nValorizados, nSinPrecio };
}

// Agrupa el costo comprado (de calcularCosto().filas) por una clave a
// elección (rubro, proveedor...), separado por moneda — mismo criterio
// de "no mezclar ARS/USD" de siempre. Solo considera filas ya valorizadas
// (con precioInfo), el resto no aporta costo.
function agruparCostoPor(filas, keyFn) {
  const porMoneda = new Map();
  for (const f of filas) {
    if (!f.precioInfo) continue;
    const key = keyFn(f);
    const m = f.precioInfo.moneda;
    if (!porMoneda.has(m)) porMoneda.set(m, new Map());
    const mapa = porMoneda.get(m);
    mapa.set(key, (mapa.get(key) || 0) + f.costoComprado);
  }
  return porMoneda;
}

// Pinta un `.chart-card` por moneda presente en `porMonedaMap` dentro de
// `containerId` (un <div class="charts-grid"> vacío) — un solo gráfico si
// hay una sola moneda (el caso normal), dos si el costo quedó repartido
// en ARS y USD. Reusado para "Costo por rubro" y "Top proveedores".
function renderGrupoPorMoneda(containerId, titulo, porMonedaMap, color, topN = 8) {
  const cont = document.getElementById(containerId);
  if (!cont) return;
  const monedas = [...porMonedaMap.keys()];
  // Si la OT anterior tenía más monedas que esta (ej. ARS+USD -> solo ARS),
  // el canvas de la moneda que ya no aparece se va a borrar del DOM al
  // reemplazar innerHTML — hay que destruir su Chart.js acá, si no queda
  // una instancia huérfana en CHARTS apuntando a un canvas ya removido.
  for (const key of Object.keys(CHARTS)) {
    if (key.startsWith(`${containerId}_`) && !monedas.includes(key.slice(containerId.length + 1))) {
      CHARTS[key].destroy();
      delete CHARTS[key];
    }
  }
  if (!monedas.length) { cont.innerHTML = ''; return; }
  cont.innerHTML = monedas.map(m => `<div class="chart-card"><h3>${escAttr(titulo)} (${escAttr(m)})</h3><div class="chart-wrap"><canvas id="${containerId}_${m}"></canvas></div></div>`).join('');
  for (const m of monedas) {
    const datos = [...porMonedaMap.get(m).entries()].sort((a, b) => b[1] - a[1]).slice(0, topN);
    renderChart(`${containerId}_${m}`, `${containerId}_${m}`, {
      type: 'bar',
      data: { labels: datos.map(d => d[0]), datasets: [{ data: datos.map(d => d[1]), backgroundColor: color, borderRadius: 4 }] },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => fmtMonto(ctx.raw, m) } } },
        scales: { x: { ticks: { callback: v => numFmt(v) } } },
      },
    });
  }
}

// Horas cargadas para una OT, por categoría — extraída de renderHorasOT()
// para que el Resumen la reuse. Llamar solo si HORAS_POR_OT ya está
// cargado.
function calcularHoras(ot) {
  const porCategoria = HORAS_POR_OT.get(formatOT(ot)) || new Map();
  const filas = [...porCategoria.entries()].sort((a, b) => b[1] - a[1]);
  const total = filas.reduce((s, [, h]) => s + h, 0);
  return { porCategoria, filas, total };
}

function renderBarrasHoras(canvasId, horasData, topN = 8) {
  const datos = horasData.filas.slice(0, topN);
  renderChart(canvasId, canvasId, {
    type: 'bar',
    data: { labels: datos.map(d => d[0]), datasets: [{ data: datos.map(d => d[1]), backgroundColor: '#f59e0b', borderRadius: 4 }] },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${numFmt(ctx.raw, 1)}h` } } },
      scales: { x: { ticks: { callback: v => numFmt(v) } } },
    },
  });
}

function estadisticasOT(items) {
  const { tot } = sumarKg(items);
  const nOK = items.filter(it => (it.estado || '').toUpperCase() === 'OK').length;
  const nDIF = items.filter(it => (it.estado || '').toUpperCase() === 'DIF').length;
  return { tot, nOK, nDIF, nItems: items.length };
}

// ------------------------------------------------------------
// Gráficos (Chart.js — mismo criterio de tema que el resto del
// tablero, ver CLAUDE.md sección 11)
// ------------------------------------------------------------
const CHARTS = {};
function renderChart(key, canvasId, config) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === 'undefined') return;
  if (CHARTS[key]) CHARTS[key].destroy();
  CHARTS[key] = new Chart(canvas.getContext('2d'), config);
}

function aplicarTemaChart() {
  if (typeof Chart === 'undefined') return;
  const cssVars = getComputedStyle(document.documentElement);
  Chart.defaults.color = cssVars.getPropertyValue('--muted').trim();
  Chart.defaults.borderColor = cssVars.getPropertyValue('--border').trim();
  Chart.defaults.font.family = "'Segoe UI',system-ui,sans-serif";
}

function renderDonutOKDIF(canvasId, nOK, nDIF) {
  const bg2 = getComputedStyle(document.documentElement).getPropertyValue('--bg2').trim();
  renderChart(canvasId, canvasId, {
    type: 'doughnut',
    data: { labels: ['OK', 'DIF'], datasets: [{ data: [nOK, nDIF], backgroundColor: ['#22c55e', '#ef4444'], borderColor: bg2, borderWidth: 2 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } },
  });
}

function renderBarrasTopOT(canvasId, grupos) {
  const datos = [...grupos.entries()]
    .map(([ot, items]) => [ot, sumarKg(items).tot.comprado])
    .filter(([, kg]) => kg > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  renderChart(canvasId, canvasId, {
    type: 'bar',
    data: { labels: datos.map(d => formatOT(d[0]) || '(Sin OT)'), datasets: [{ label: 'KGS comprados', data: datos.map(d => d[1]), backgroundColor: '#6366f1', borderRadius: 4 }] },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${numFmt(ctx.raw)} KGS` } } },
      scales: { x: { ticks: { callback: v => numFmt(v) } } },
    },
  });
}

// Mismo patrón que renderBarrasTopOT, agrupando por rubro (`agrupacion`)
// en vez de por OT — ver kgPorRubro().
function renderBarrasRubro(canvasId, items, topN = 10) {
  const porRubro = kgPorRubro(items);
  const datos = [...porRubro.entries()].filter(([, kg]) => kg > 0).sort((a, b) => b[1] - a[1]).slice(0, topN);
  renderChart(canvasId, canvasId, {
    type: 'bar',
    data: { labels: datos.map(d => d[0]), datasets: [{ label: 'KGS comprados', data: datos.map(d => d[1]), backgroundColor: '#14b8a6', borderRadius: 4 }] },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${numFmt(ctx.raw)} KGS` } } },
      scales: { x: { ticks: { callback: v => numFmt(v) } } },
    },
  });
}

// ------------------------------------------------------------
// Dashboard
// ------------------------------------------------------------
// El Dashboard (KPIs + gráficos) solo mira OT ACTIVAS (no archivadas) —
// pedido explícito del usuario (2026-10-02): una OT archivada es "ya
// cerrada", no tiene que pesar en el panorama general. El detalle de una
// OT puntual (renderDetalle) sigue mostrando sus propios indicadores
// esté o no archivada — el archivado solo afecta a este panorama y, por
// defecto, a la grilla de tarjetas (ver renderCards/MOSTRAR_ARCHIVADAS).
function renderDashboard() {
  aplicarTemaChart();
  const grupos = agruparPorOTMadre();
  const gruposActivos = new Map([...grupos].filter(([ot]) => !esArchivada(ot)));
  const itemsActivos = [...gruposActivos.values()].flat();

  const nOK = itemsActivos.filter(it => (it.estado || '').toUpperCase() === 'OK').length;
  const nDIF = itemsActivos.filter(it => (it.estado || '').toUpperCase() === 'DIF').length;
  const nSinOT = (gruposActivos.get('') || []).length;

  setTxt('mrd_k_ot', gruposActivos.size);
  setTxt('mrd_k_ok', nOK);
  setTxt('mrd_k_dif', nDIF);
  setTxt('mrd_k_sinot', nSinOT);

  renderDonutOKDIF('mrd_chart_okdif', nOK, nDIF);
  renderBarrasTopOT('mrd_chart_topot', gruposActivos);
  renderBarrasRubro('mrd_chart_toprubro', itemsActivos);
}

// ------------------------------------------------------------
// Por OT — tarjetas + detalle
// ------------------------------------------------------------
function hijasDe(otMadre) {
  return GRUPOS.filter(g => g.n_ot_madre === otMadre).map(g => g.n_ot_hija);
}

// Mismo filtro (búsqueda + archivadas) que usan tanto la grilla de
// tarjetas como "Exportar diferencias" — exportar siempre tiene que
// coincidir con lo que se está viendo en pantalla en ese momento.
function gruposVisiblesCards() {
  const q = (document.getElementById('mro_f_q')?.value || '').trim().toUpperCase();
  const grupos = agruparPorOTMadre();

  let filas = [...grupos.entries()];
  // Las archivadas quedan ocultas por defecto (pedido del usuario: el
  // archivado es para OT viejas/cerradas que no hace falta seguir
  // viendo) — el checkbox las vuelve a mostrar, mezcladas con el resto
  // pero marcadas con el badge "📦 Archivada".
  if (!MOSTRAR_ARCHIVADAS) filas = filas.filter(([ot]) => !esArchivada(ot));
  if (q) {
    filas = filas.filter(([ot]) => {
      const info = OT_INFO.get(ot);
      return (ot || 'SIN OT').toUpperCase().includes(q)
        || (info?.nombre_proyecto || '').toUpperCase().includes(q)
        || (info?.cliente || '').toUpperCase().includes(q);
    });
  }
  filas.sort((a, b) => !a[0] ? 1 : !b[0] ? -1 : a[0].localeCompare(b[0], 'es'));
  return filas;
}

function renderCards() {
  const grid = document.getElementById('mro_cards_grid');
  if (!grid) return;
  const filas = gruposVisiblesCards();

  if (!filas.length) { grid.innerHTML = '<div style="color:var(--muted);padding:12px">Sin datos todavía — cargá un archivo desde "Por OT".</div>'; return; }

  grid.innerHTML = filas.map(([ot, items]) => {
    const st = estadisticasOT(items);
    const hijas = hijasDe(ot);
    const archivada = esArchivada(ot);
    const info = OT_INFO.get(ot);
    const tituloHijas = hijas.map(h => `${formatOT(h)}${OT_INFO.get(h)?.nombre_proyecto ? ' — ' + OT_INFO.get(h).nombre_proyecto : ''}`).join('\n');
    return `<div class="ot-card" data-ot="${escAttr(ot)}" style="${archivada ? 'opacity:.6' : ''}">
      <div style="font-weight:600;font-size:15px">${ot ? escAttr(formatOT(ot)) : '<span style="color:var(--muted)">(Sin OT)</span>'}
        ${hijas.length ? `<span class="badge" style="margin-left:6px;font-weight:400" title="${escAttr(tituloHijas)}">+${hijas.length} adicional${hijas.length === 1 ? '' : 'es'}</span>` : ''}
        ${archivada ? '<span class="badge" style="margin-left:6px;font-weight:400">📦 Archivada</span>' : ''}
      </div>
      ${info?.nombre_proyecto || info?.cliente ? `<div style="font-size:12px;color:var(--muted);margin-top:-2px" title="${escAttr([info?.nombre_proyecto, info?.cliente].filter(Boolean).join(' — '))}">${escAttr(info?.nombre_proyecto || '')}${info?.nombre_proyecto && info?.cliente ? ' · ' : ''}${escAttr(info?.cliente || '')}</div>` : ''}
      <div style="font-size:13px;margin-top:8px">🛒 Comprado: <strong>${numFmt(st.tot.comprado)} KGS</strong></div>
      <div style="font-size:13px">📋 Solicitado: <strong>${numFmt(st.tot.solic)} KGS</strong></div>
      <div style="font-size:13px">📦 Asignado de stock: <strong>${numFmt(st.tot.asig)} KGS</strong></div>
      <div style="font-size:12px;color:var(--muted);margin-top:4px">${st.nItems} ítem${st.nItems === 1 ? '' : 's'}</div>
      ${st.nDIF ? `<div style="font-size:12px;color:var(--red);margin-top:6px">⚠️ ${st.nDIF} con diferencia (DIF)</div>` : ''}
      <div style="margin-top:8px">
        <button type="button" class="bsm mro-toggle-archivo" data-ot="${escAttr(ot)}" data-archivada="${archivada ? '1' : '0'}">${archivada ? '♻️ Reactivar' : '📦 Archivar'}</button>
      </div>
    </div>`;
  }).join('');
}

// Exporta a Excel el detalle artículo por artículo de los ítems con
// Estado "DIF" (ver nota de cabecera — el flag ya lo calcula Capataz,
// acá solo se filtra y se baja) entre TODAS las OT actualmente visibles
// en la grilla (mismo alcance que `renderCards()`: respeta el buscador
// y el checkbox "Mostrar archivadas") — pedido explícito del usuario
// (2026-10-08) para poder revisar/repartir las diferencias sin tener
// que abrir OT por OT.
function exportarDiferencias() {
  const filas = gruposVisiblesCards();
  const encabezado = ['OT', 'Código', 'Descripción', 'Unidad', 'Cotiz. (kg)', 'Plan. (kg)', 'Solic. (kg)', 'Comprado (kg)', 'Asig. (kg)', 'Recibido (kg)', 'Entregado (kg)', 'Diferencia (kg)'];
  const out = [];
  for (const [, items] of filas) {
    for (const it of items) {
      if ((it.estado || '').toUpperCase() !== 'DIF') continue;
      const k = kgsItem(it);
      // La regla de fondo (ver 13.1): no se puede entregar más de lo
      // recibido + asignado de stock. La diferencia muestra ese exceso
      // (positivo = se entregó sin cobertura, lo que suele disparar el
      // DIF) — es un cálculo de referencia para ubicar el desvío más
      // rápido, no reemplaza ni recalcula el Estado que ya trae Capataz.
      const diferencia = k.entregado - (k.recibido + k.asig);
      out.push([
        formatOT((it.n_ot || '').trim()),
        it.cod_articulo,
        it.descripcion || '',
        it.ume || '',
        k.cotiz, k.plan, k.solic, k.comprado, k.asig, k.recibido, k.entregado,
        diferencia,
      ]);
    }
  }
  if (!out.length) { toast('No hay ítems con diferencia (DIF) entre las OT visibles', 'er'); return; }

  const ws = XLSX.utils.aoa_to_sheet([encabezado, ...out]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Diferencias');
  XLSX.writeFile(wb, `materiales-ot-diferencias_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function abrirDetalle(ot) {
  OT_ACTUAL = ot;
  OT_TAB = 'resumen';
  const vc = document.getElementById('mro-vista-cards');
  const vd = document.getElementById('mro-vista-detalle');
  if (vc) vc.style.display = 'none';
  if (vd) vd.style.display = '';
  renderDetalle();
}

// Archiva/reactiva por OT EFECTIVA (la madre, si tiene adicionales — ver
// nota de cabecera de compras_materot_ot_archivadas): no tiene sentido
// archivar una hija sola, siempre se ven y cuentan como una sola unidad.
async function toggleArchivoOT(ot, archivadaActual) {
  if (archivadaActual) {
    const { error } = await SB.from('compras_materot_ot_archivadas').delete().eq('n_ot', ot);
    if (error) { toast(error.message, 'er'); return; }
    ARCHIVADAS.delete(ot);
    toast(`✓ OT ${formatOT(ot)} reactivada`);
  } else {
    const { error } = await SB.from('compras_materot_ot_archivadas').upsert({ n_ot: ot });
    if (error) { toast(error.message, 'er'); return; }
    ARCHIVADAS.add(ot);
    toast(`✓ OT ${formatOT(ot)} archivada`);
  }
  if (OT_ACTUAL !== null) renderDetalle(); else renderCards();
}

function volverACards() {
  OT_ACTUAL = null;
  const vc = document.getElementById('mro-vista-cards');
  const vd = document.getElementById('mro-vista-detalle');
  if (vd) vd.style.display = 'none';
  if (vc) vc.style.display = '';
}

function mostrarTabOT(tab) {
  OT_TAB = tab;
  document.querySelectorAll('#mro_det_tabs .subtab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  const pr = document.getElementById('mro_det_panel_resumen');
  const pd = document.getElementById('mro_det_panel_detalle');
  const pc = document.getElementById('mro_det_panel_costo');
  if (pr) pr.style.display = tab === 'resumen' ? '' : 'none';
  if (pd) pd.style.display = tab === 'detalle' ? '' : 'none';
  if (pc) pc.style.display = tab === 'costo' ? '' : 'none';
}

function renderDetalle() {
  if (OT_ACTUAL === null) return;
  const pr = document.getElementById('mro_det_panel_resumen');
  if (pr) pr.style.display = ''; // visible mientras se dibuja el gráfico, igual criterio que ot.js
  aplicarTemaChart();
  const grupos = agruparPorOTMadre();
  const items = grupos.get(OT_ACTUAL) || [];
  const st = estadisticasOT(items);
  const hijas = hijasDe(OT_ACTUAL);

  const archivada = esArchivada(OT_ACTUAL);
  const info = OT_INFO.get(OT_ACTUAL);
  const titulo = document.getElementById('mro_det_titulo');
  if (titulo) {
    titulo.innerHTML = `${escAttr(OT_ACTUAL ? `OT ${formatOT(OT_ACTUAL)}` : '(Sin OT)')}${hijas.length ? ` <span style="font-weight:400;font-size:14px;color:var(--muted)">(+ adicionales: ${escAttr(hijas.map(formatOT).join(', '))})</span>` : ''}`;
  }
  const subtitulo = document.getElementById('mro_det_subtitulo');
  if (subtitulo) {
    subtitulo.textContent = info?.nombre_proyecto || info?.cliente
      ? [info?.nombre_proyecto, info?.cliente].filter(Boolean).join(' — ')
      : '';
  }
  const btnToggle = document.getElementById('mro_det_toggle_archivo');
  if (btnToggle) btnToggle.textContent = archivada ? '♻️ Reactivar esta OT' : '📦 Archivar esta OT';

  renderResumenOT(items, st);

  poblarFiltroRubroDetalle(items);
  const rubroF = document.getElementById('mrod_f_rubro')?.value || '';
  const ocultarSinMov = document.getElementById('mrod_f_sinmov')?.checked ?? true;

  let itemsTabla = rubroF ? items.filter(it => it.agrupacion === rubroF) : items;
  const ocultos = ocultarSinMov ? itemsTabla.filter(it => !tieneMovimiento(it)).length : 0;
  if (ocultarSinMov) itemsTabla = itemsTabla.filter(tieneMovimiento);
  const spanOcultos = document.getElementById('mrod_f_sinmov_n');
  if (spanOcultos) spanOcultos.textContent = ocultos ? `(${ocultos} oculto${ocultos === 1 ? '' : 's'})` : '';

  const tbody = document.getElementById('t-mro-detalle');
  if (tbody) {
    const filas = itemsTabla
      .slice()
      .sort((a, b) => (a.descripcion || '').localeCompare(b.descripcion || '', 'es'))
      .map(it => {
        const k = kgsItem(it);
        const otItem = (it.n_ot || '').trim();
        return `<tr>
          <td>${otItem && otItem !== OT_ACTUAL ? `<span class="badge" title="Ítem de la OT adicional ${escAttr(formatOT(otItem))}, agrupada acá">${escAttr(formatOT(otItem))}</span>` : escAttr(formatOT(otItem) || '–')}</td>
          <td>${escAttr(it.cod_articulo)}</td>
          <td>${escAttr(it.descripcion || '')}</td>
          <td>${escAttr(it.agrupacion || '–')}</td>
          <td>${escAttr(it.ume || '–')}</td>
          <td style="text-align:right">${numFmt(k.cotiz)}</td>
          <td style="text-align:right">${numFmt(k.plan)}</td>
          <td style="text-align:right">${numFmt(k.solic)}</td>
          <td style="text-align:right">${numFmt(k.comprado)}</td>
          <td style="text-align:right">${numFmt(k.asig)}</td>
          <td style="text-align:right">${numFmt(k.recibido)}</td>
          <td style="text-align:right">${numFmt(k.entregado)}</td>
          <td><span class="badge ${(it.estado || '').toUpperCase() === 'DIF' ? 'rechazado' : 'aprobado'}">${escAttr(it.estado || '–')}</span></td>
        </tr>`;
      }).join('');
    tbody.innerHTML = filas || `<tr><td colspan="13" style="text-align:center;padding:18px;color:var(--muted)">Sin ítems para los filtros actuales</td></tr>`;
  }

  mostrarTabOT(OT_TAB);
  // Si ya se había entrado a "Costo"/Resumen antes (en esta misma OT o en
  // otra) los precios/horas ya están en caché — alcanza con repintar. Si
  // todavía no se cargaron ni una vez, se dispara acá (el Resumen ahora
  // los necesita de entrada, no solo la pestaña Costo, ver 13.10) — con
  // guarda de carrera (`otAlAbrir`) por si el usuario cambia de OT
  // mientras la carga todavía está en vuelo, para no pisar la OT nueva
  // con datos de la vieja (mismo tipo de bug que ya se corrigió una vez
  // acá, ver CLAUDE.md 13.9).
  if (OT_TAB === 'costo') renderCosto();
  if (!PRECIO_POR_ARTICULO || !HORAS_POR_OT) {
    const otAlAbrir = OT_ACTUAL;
    Promise.all([cargarPreciosCotizaciones(), cargarHorasPorOT(), cargarDolarReferencia()]).then(() => {
      if (OT_ACTUAL !== otAlAbrir) return;
      prefillTipoCambio();
      renderResumenOT(agruparPorOTMadre().get(OT_ACTUAL) || [], estadisticasOT(agruparPorOTMadre().get(OT_ACTUAL) || []));
      if (OT_TAB === 'costo') renderCosto();
    });
  }
}

// Pinta TODO el panel Resumen: avance físico en kg (Cotizado/Cubierto,
// con el "presupuesto en kg" de Presupuestos como referencia), costo real
// en pesos (si PRECIO_POR_ARTICULO ya cargó), horas de Capataz (si
// HORAS_POR_OT ya cargó), calidad de carga (OK/DIF) y los gráficos/tabla
// de desvío. Las partes de costo/horas se repintan solas cuando terminan
// de cargar (ver renderDetalle()) — mientras tanto quedan en "–", mismo
// criterio que el resto del tablero. Pedido explícito del usuario,
// 2026-10-23 ("mejoremos todo este sistema de resumen... que tenga el
// mayor lujo de detalle"), ver CLAUDE.md sección 13.10.
function renderResumenOT(items, st) {
  const tot = st.tot;
  const cubierto = tot.comprado + tot.asig;

  // -- Avance físico (kg) --
  setTxt('mrod_k_cotiz', `${numFmt(tot.cotiz)} kg`);
  setTxt('mrod_k_cubierto', `${numFmt(cubierto)} kg`);
  const avancePct = tot.solic > 0 ? Math.round(cubierto / tot.solic * 100) : null;
  setTxt('mrod_k_avance', avancePct == null ? '–' : `${avancePct}%`);
  const avanceBar = document.getElementById('mrod_k_avance_bar');
  if (avanceBar) avanceBar.style.width = `${Math.max(0, Math.min(100, avancePct || 0))}%`;
  const desvioPct = tot.cotiz > 0 ? Math.round((cubierto - tot.cotiz) / tot.cotiz * 100) : null;
  const desvioEl = document.getElementById('mrod_k_desvio');
  if (desvioEl) {
    desvioEl.textContent = desvioPct == null ? '–' : `${desvioPct > 0 ? '+' : ''}${desvioPct}%`;
    desvioEl.style.color = desvioPct == null ? '' : (desvioPct > 15 ? 'var(--red)' : (desvioPct < -15 ? 'var(--accent)' : 'var(--green)'));
  }
  setTxt('mrod_k_desvio_sub', desvioPct == null ? 'sin Cotizado cargado para esta OT' : (desvioPct > 0 ? 'por encima de lo cotizado' : 'dentro de lo cotizado'));

  // -- Calidad de carga --
  setTxt('mrod_k_items', st.nItems);
  setTxt('mrod_k_ok', st.nOK);
  setTxt('mrod_k_dif', st.nDIF);
  renderDonutOKDIF('mrod_chart_okdif', st.nOK, st.nDIF);
  renderBarrasCotizadoVsCubierto('mrod_chart_rubro', items);
  renderTablaDesvios('t-mro-desvios', items);

  // -- Costo real (si ya cargaron los precios de Cotizaciones) --
  if (PRECIO_POR_ARTICULO) {
    const { filas, costoPorMoneda, ahorroPorMoneda, nValorizados, nSinPrecio } = calcularCosto(items);
    setTxt('mrod_k_costo', chipsMonto(costoPorMoneda));
    setTxt('mrod_k_ahorro', chipsMonto(ahorroPorMoneda));
    const totalPorMoneda = new Map(costoPorMoneda);
    for (const [m, v] of ahorroPorMoneda) totalPorMoneda.set(m, (totalPorMoneda.get(m) || 0) + v);
    setTxt('mrod_k_costototal', chipsMonto(totalPorMoneda));
    let costoKgTxt = '–';
    if (costoPorMoneda.size === 1 && tot.comprado > 0) {
      const [m, v] = [...costoPorMoneda.entries()][0];
      costoKgTxt = `${fmtMonto(v / tot.comprado, m)}/kg`;
    }
    setTxt('mrod_k_costokg', costoKgTxt);
    const totalPreciables = nValorizados + nSinPrecio;
    setTxt('mrod_k_cobertura', totalPreciables > 0 ? `${Math.round(nValorizados / totalPreciables * 100)}%` : '–');
    setTxt('mrod_k_cobertura_sub', totalPreciables > 0 ? `${nValorizados} de ${totalPreciables} ítems con precio` : '');
    renderGrupoPorMoneda('mrod_wrap_costorubro', 'Costo comprado por rubro', agruparCostoPor(filas, f => f.it.agrupacion || '(Sin rubro)'), '#22c55e');
    renderGrupoPorMoneda('mrod_wrap_provs', 'Top proveedores (costo comprado)', agruparCostoPor(filas, f => f.precioInfo.proveedor_nombre || '(?)'), '#3b82f6');
  }

  // -- Mano de obra (si ya cargaron las horas de Capataz) --
  if (HORAS_POR_OT) {
    const horasData = calcularHoras(OT_ACTUAL);
    setTxt('mrod_k_horas', `${numFmt(horasData.total, 1)}h`);
    const toneladas = cubierto / 1000;
    setTxt('mrod_k_hhton', toneladas > 0 && horasData.total > 0 ? `${numFmt(horasData.total / toneladas, 1)} HH/t` : '–');
    setTxt('mrod_k_topcat', horasData.filas[0] ? `${horasData.filas[0][0]} (${numFmt(horasData.filas[0][1], 1)}h)` : '–');
    renderBarrasHoras('mrod_chart_horas', horasData);
  }
}

// Valoriza los ítems de la OT actual contra PRECIO_POR_ARTICULO —
// "Costo realizado" (Comprado × precio) y "Ahorro por stock asignado"
// (Asignado × precio: lo que hubiera costado comprar lo que en cambio
// se cubrió con stock existente — no es un gasto real, es la referencia
// de cuánto NO se gastó). Pedido explícito del usuario, 2026-10-22.
function renderCosto() {
  if (OT_ACTUAL === null || !PRECIO_POR_ARTICULO) return;
  const items = agruparPorOTMadre().get(OT_ACTUAL) || [];
  const tc = Number((document.getElementById('mroc_tipo_cambio')?.value || '').trim().replace(',', '.')) || null;

  const { filas, costoPorMoneda, ahorroPorMoneda, nValorizados, nSinPrecio } = calcularCosto(items);

  setTxt('mroc_k_costo', chipsMonto(costoPorMoneda));
  setTxt('mroc_k_ahorro', chipsMonto(ahorroPorMoneda));
  setTxt('mroc_k_valorizados', nValorizados);
  setTxt('mroc_k_sinprecio', nSinPrecio);

  const combDiv = id => document.getElementById(id);
  const combinarUSD = mapa => [...mapa.entries()].reduce((acc, [m, v]) => acc + (m === 'USD' ? v * tc : v), 0);
  const costoComb = combDiv('mroc_k_costo_comb');
  const ahorroComb = combDiv('mroc_k_ahorro_comb');
  if (costoComb) costoComb.textContent = (tc && costoPorMoneda.size > 1) ? `≈ ${fmtMonto(combinarUSD(costoPorMoneda), 'ARS')} combinado` : '';
  if (ahorroComb) ahorroComb.textContent = (tc && ahorroPorMoneda.size > 1) ? `≈ ${fmtMonto(combinarUSD(ahorroPorMoneda), 'ARS')} combinado` : '';

  const tbody = document.getElementById('t-mro-costo');
  if (tbody) {
    const filasHtml = filas
      .slice()
      .sort((a, b) => (a.it.descripcion || '').localeCompare(b.it.descripcion || '', 'es'))
      .map(f => {
        const it = f.it;
        if (!f.precioInfo) {
          return `<tr style="opacity:.6">
            <td>${escAttr(it.cod_articulo)}</td>
            <td>${escAttr(it.descripcion || '')}</td>
            <td>${escAttr(it.agrupacion || '–')}</td>
            <td style="text-align:right">${numFmt(it.comprado)} ${escAttr(it.ume || '')}</td>
            <td colspan="2" style="text-align:center;color:var(--muted)" title="${it.ume ? `Esta OT lo mide en ${escAttr(it.ume)}` : ''}">${f.motivo === 'unidad distinta' ? '⚠️ unidad distinta' : 'Sin cotización'}</td>
            <td style="text-align:right">${numFmt(it.cant_asig)} ${escAttr(it.ume || '')}</td>
            <td style="text-align:center;color:var(--muted)">–</td>
          </tr>`;
        }
        return `<tr>
          <td>${escAttr(it.cod_articulo)}</td>
          <td>${escAttr(it.descripcion || '')}</td>
          <td>${escAttr(it.agrupacion || '–')}</td>
          <td style="text-align:right">${numFmt(f.cant.comprado)} ${escAttr(f.cant.unidad)}</td>
          <td style="text-align:right" title="Proveedor ganador: ${escAttr(f.precioInfo.proveedor_nombre)}${f.precioEspecifico ? ' — precio cotizado específicamente para esta OT' : ' — precio más reciente (de otra OT/solicitud)'}">${fmtMonto(f.precioInfo.precio_unitario, f.precioInfo.moneda)}${f.precioEspecifico ? ' <span style="color:var(--accent)">🎯</span>' : ''}</td>
          <td style="text-align:right">${fmtMonto(f.costoComprado, f.precioInfo.moneda)}</td>
          <td style="text-align:right">${numFmt(f.cant.asig)} ${escAttr(f.cant.unidad)}</td>
          <td style="text-align:right">${fmtMonto(f.ahorroStock, f.precioInfo.moneda)}</td>
        </tr>`;
      }).join('');
    tbody.innerHTML = filasHtml || `<tr><td colspan="8" style="text-align:center;padding:18px;color:var(--muted)">Sin ítems</td></tr>`;
  }

  renderHorasOT();
}

// Horas cargadas en Capataz para la OT actual, por categoría — ver
// HORAS_POR_OT más arriba y CLAUDE.md sección 13.9. Independiente de
// PRECIO_POR_ARTICULO (puede faltar uno y estar el otro, cada uno se
// pinta con lo que tenga disponible).
function renderHorasOT() {
  if (OT_ACTUAL === null) return;
  const tbody = document.getElementById('t-mro-horas');
  if (!tbody) return;
  if (!HORAS_POR_OT) { setTxt('mroc_k_horas', '–'); return; }

  const { filas, total } = calcularHoras(OT_ACTUAL);

  setTxt('mroc_k_horas', `${numFmt(total, 1)}h`);
  tbody.innerHTML = filas.length
    ? filas.map(([categoria, horas]) => `<tr>
        <td>${escAttr(categoria)}</td>
        <td style="text-align:right">${numFmt(horas, 1)}h</td>
        <td style="text-align:right">${total > 0 ? Math.round(horas / total * 100) : 0}%</td>
      </tr>`).join('')
    : `<tr><td colspan="3" style="text-align:center;padding:18px;color:var(--muted)">Sin horas cargadas para esta OT</td></tr>`;
}

// Solo lista los rubros que efectivamente aparecen en ESTA OT (mismo
// criterio que poblarFiltroGrupo() en Cotizaciones) — conserva la
// elección actual si el rubro elegido sigue existiendo al repintar.
function poblarFiltroRubroDetalle(items) {
  const sel = document.getElementById('mrod_f_rubro');
  if (!sel) return;
  const actual = sel.value;
  const rubros = [...new Set(items.map(it => it.agrupacion).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  sel.innerHTML = '<option value="">Todos los rubros</option>' + rubros.map(r => `<option value="${escAttr(r)}">${escAttr(r)}</option>`).join('');
  if (rubros.includes(actual)) sel.value = actual;
}

// ------------------------------------------------------------
// Agrupar OT — administración de la relación hija → madre
// ------------------------------------------------------------
function otsDisponiblesSelect() {
  const madres = mapaMadres(); // hija -> madre
  const madresSet = new Set(GRUPOS.map(g => g.n_ot_madre)); // OT que ya son madre de alguna hija
  const todas = [...new Set(ITEMS.map(it => (it.n_ot || '').trim()).filter(Boolean))]
    .filter(ot => !esArchivada(ot)) // una OT archivada no se vuelve a tocar acá
    .sort((a, b) => a.localeCompare(b, 'es'));
  return { todas, madres, madresSet };
}

let MRG_MADRE_SEL = ''; // OT madre elegida en "Agrupar OT" — se mantiene entre renders

// Candidatas para "OT madre": cualquier OT no archivada que todavía no
// sea hija de otra (una OT que ya tiene madre no puede tener una
// segunda) — SÍ puede ya ser madre de otras hijas, elegirla de nuevo es
// cómo se le suman más adicionales.
function otsCandidatasMadre() {
  const { todas, madres } = otsDisponiblesSelect();
  return todas.filter(ot => !madres.has(ot));
}

// Candidatas para tildar como "adicional" de la madre elegida: además de
// no ser ya hija de otra, tampoco puede ser YA madre de sus propias
// hijas (evita cadenas hija→hija→madre — una OT no puede tener 2 madres
// ni ser a la vez madre y adicional de otra) ni ser la madre elegida.
function otsCandidatasHija(madreSeleccionada) {
  const { todas, madres, madresSet } = otsDisponiblesSelect();
  return todas.filter(ot => ot !== madreSeleccionada && !madres.has(ot) && !madresSet.has(ot));
}

function renderGrupos() {
  const candidatasMadre = otsCandidatasMadre();

  const selMadre = document.getElementById('mrog_madre');
  if (selMadre) {
    const opciones = candidatasMadre.map(ot => `<option value="${escAttr(ot)}">${escAttr(formatOT(ot))}</option>`).join('');
    selMadre.innerHTML = `<option value="">— Elegí una OT —</option>${opciones}`;
    selMadre.value = candidatasMadre.includes(MRG_MADRE_SEL) ? MRG_MADRE_SEL : '';
    MRG_MADRE_SEL = selMadre.value;
  }
  renderPanelHijas();

  const tbody = document.getElementById('t-mro-grupos');
  if (tbody) {
    tbody.innerHTML = GRUPOS.map(g => `
      <tr>
        <td>${escAttr(formatOT(g.n_ot_hija))}</td>
        <td>${escAttr(formatOT(g.n_ot_madre))}</td>
        <td><button type="button" class="bsm d mro-quitar-grupo" data-id="${escAttr(g.n_ot_hija)}">🗑️ Quitar</button></td>
      </tr>`).join('') || `<tr><td colspan="3" style="text-align:center;padding:18px;color:var(--muted)">Sin agrupaciones todavía</td></tr>`;
  }
}

// Lista de checkboxes con las OT disponibles para ser adicionales de la
// madre elegida — permite tildar varias de una y agruparlas todas
// juntas en un solo click, en vez de repetir el flujo OT por OT.
function renderPanelHijas() {
  const panel = document.getElementById('mrog_panel_hijas');
  const cont = document.getElementById('mrog_hijas_lista');
  if (!panel || !cont) return;
  if (!MRG_MADRE_SEL) { panel.style.display = 'none'; return; }
  panel.style.display = '';

  const q = (document.getElementById('mrog_f_q')?.value || '').trim().toUpperCase();
  let candidatas = otsCandidatasHija(MRG_MADRE_SEL);
  if (q) candidatas = candidatas.filter(ot => formatOT(ot).toUpperCase().includes(q));

  cont.innerHTML = candidatas.map(ot => `
    <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
      <input type="checkbox" class="mrog-check-hija" value="${escAttr(ot)}" style="width:auto">
      ${escAttr(formatOT(ot))}
    </label>`).join('') || '<div style="color:var(--muted);grid-column:1/-1">No hay otras OT disponibles para agrupar</div>';
  actualizarContadorHijas();
}

function actualizarContadorHijas() {
  const n = document.querySelectorAll('.mrog-check-hija:checked').length;
  const span = document.getElementById('mrog_contador');
  if (span) span.textContent = n;
}

async function agruparOT() {
  const madre = MRG_MADRE_SEL;
  const hijas = [...document.querySelectorAll('.mrog-check-hija:checked')].map(c => c.value);
  if (!madre) { toast('Elegí la OT madre', 'er'); return; }
  if (!hijas.length) { toast('Tildá al menos una OT adicional', 'er'); return; }

  const filas = hijas.map(hija => ({ n_ot_hija: hija, n_ot_madre: madre }));
  const { error } = await SB.from('compras_materot_ot_grupos').upsert(filas);
  if (error) { toast(error.message, 'er'); return; }
  toast(`✓ ${hijas.length} OT agrupada${hijas.length === 1 ? '' : 's'} bajo ${formatOT(madre)}`);
  await cargarTodo();
  renderGrupos();
}

async function quitarGrupo(nOtHija) {
  if (!confirm(`¿Quitar la agrupación de OT ${formatOT(nOtHija)}? Vuelve a verse como una OT independiente.`)) return;
  const { error } = await SB.from('compras_materot_ot_grupos').delete().eq('n_ot_hija', nOtHija);
  if (error) { toast(error.message, 'er'); return; }
  await cargarTodo();
  renderGrupos();
}

// ------------------------------------------------------------
export async function render(secId) {
  if (!['materot-dash', 'materot-cards', 'materot-grupos'].includes(secId)) return;
  await cargarTodo();
  if (secId === 'materot-dash') { renderDashboard(); return; }
  if (secId === 'materot-grupos') { renderGrupos(); return; }
  // materot-cards
  if (OT_ACTUAL !== null) { renderDetalle(); return; }
  renderCards();
}

export function init() {
  document.getElementById('mro_f_q')?.addEventListener('input', renderCards);
  document.getElementById('mro_f_archivadas')?.addEventListener('change', e => {
    MOSTRAR_ARCHIVADAS = e.target.checked;
    renderCards();
  });
  document.getElementById('mro_det_volver')?.addEventListener('click', volverACards);
  document.getElementById('mrd-ir-cards')?.addEventListener('click', () => document.querySelector('.nav-item[data-sec="materot-cards"]')?.click());
  document.getElementById('mro_det_toggle_archivo')?.addEventListener('click', () => {
    if (OT_ACTUAL !== null) toggleArchivoOT(OT_ACTUAL, esArchivada(OT_ACTUAL));
  });
  document.getElementById('mro_cards_grid')?.addEventListener('click', e => {
    const btnArch = e.target.closest('.mro-toggle-archivo');
    if (btnArch) { toggleArchivoOT(btnArch.dataset.ot, btnArch.dataset.archivada === '1'); return; }
    const card = e.target.closest('.ot-card');
    if (card) abrirDetalle(card.dataset.ot);
  });
  document.getElementById('mro_det_tabs')?.addEventListener('click', async e => {
    const btn = e.target.closest('.subtab');
    if (!btn) return;
    mostrarTabOT(btn.dataset.tab);
    if (btn.dataset.tab === 'costo') {
      if (!PRECIO_POR_ARTICULO || !HORAS_POR_OT) await Promise.all([cargarPreciosCotizaciones(), cargarHorasPorOT(), cargarDolarReferencia()]);
      prefillTipoCambio();
      if (OT_TAB === 'costo') renderCosto(); // repinta siempre contra la OT actual, cargue o no datos nuevos
    }
  });
  document.getElementById('mrod_f_rubro')?.addEventListener('change', renderDetalle);
  document.getElementById('mrod_f_sinmov')?.addEventListener('change', renderDetalle);
  document.getElementById('mroc_tipo_cambio')?.addEventListener('input', () => { if (PRECIO_POR_ARTICULO) renderCosto(); });

  document.getElementById('mro_file')?.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) cargarArchivo(file);
    e.target.value = '';
  });
  document.getElementById('mro_btn_cargar_info')?.addEventListener('click', () => document.getElementById('mro_file_info')?.click());
  document.getElementById('mro_btn_exportar_dif')?.addEventListener('click', exportarDiferencias);
  document.getElementById('mro_file_info')?.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) cargarArchivoInfo(file);
    e.target.value = '';
  });

  document.getElementById('mrog_madre')?.addEventListener('change', e => {
    MRG_MADRE_SEL = e.target.value;
    renderPanelHijas();
  });
  document.getElementById('mrog_f_q')?.addEventListener('input', renderPanelHijas);
  document.getElementById('mrog_hijas_lista')?.addEventListener('change', e => {
    if (e.target.classList.contains('mrog-check-hija')) actualizarContadorHijas();
  });
  document.getElementById('mrog_agrupar')?.addEventListener('click', agruparOT);
  document.getElementById('t-mro-grupos')?.addEventListener('click', e => {
    const btn = e.target.closest('.mro-quitar-grupo');
    if (btn) quitarGrupo(btn.dataset.id);
  });
}
