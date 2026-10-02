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
import { toast, norm, txt, num, fetchAll, escAttr } from '../utils.js';

let ITEMS = [];      // compras_materot_items, todas las filas
let GRUPOS = [];      // compras_materot_ot_grupos — [{n_ot_hija, n_ot_madre}]
let ARCHIVADAS = new Set(); // n_ot (OT efectiva) ya archivadas

let OT_ACTUAL = null; // OT madre que se está viendo en el detalle; null = vista de tarjetas
let OT_TAB = 'resumen';
let MOSTRAR_ARCHIVADAS = false; // checkbox de "Por OT" — oculta archivadas por defecto

const numFmt = (n, dec = 2) => Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: dec });
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
// Carga de datos
// ------------------------------------------------------------
async function cargarTodo() {
  const [{ data: items, error: e1 }, { data: grupos, error: e2 }, { data: arch, error: e3 }] = await Promise.all([
    fetchAll(() => SB.from('compras_materot_items').select('*')),
    SB.from('compras_materot_ot_grupos').select('*').then(r => r),
    SB.from('compras_materot_ot_archivadas').select('n_ot').then(r => r),
  ]);
  const error = e1 || e2 || e3;
  if (error) { toast(error.message, 'er'); return; }
  ITEMS = items || [];
  GRUPOS = grupos || [];
  ARCHIVADAS = new Set((arch || []).map(a => a.n_ot));
}

const esArchivada = ot => ARCHIVADAS.has(ot);

// ------------------------------------------------------------
// Agrupación OT hija → madre
// ------------------------------------------------------------
function mapaMadres() {
  return new Map(GRUPOS.map(g => [g.n_ot_hija, g.n_ot_madre]));
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
}

// ------------------------------------------------------------
// Por OT — tarjetas + detalle
// ------------------------------------------------------------
function hijasDe(otMadre) {
  return GRUPOS.filter(g => g.n_ot_madre === otMadre).map(g => g.n_ot_hija);
}

function renderCards() {
  const grid = document.getElementById('mro_cards_grid');
  if (!grid) return;
  const q = (document.getElementById('mro_f_q')?.value || '').trim().toUpperCase();
  const grupos = agruparPorOTMadre();

  let filas = [...grupos.entries()];
  // Las archivadas quedan ocultas por defecto (pedido del usuario: el
  // archivado es para OT viejas/cerradas que no hace falta seguir
  // viendo) — el checkbox las vuelve a mostrar, mezcladas con el resto
  // pero marcadas con el badge "📦 Archivada".
  if (!MOSTRAR_ARCHIVADAS) filas = filas.filter(([ot]) => !esArchivada(ot));
  if (q) filas = filas.filter(([ot]) => (ot || 'SIN OT').toUpperCase().includes(q));
  filas.sort((a, b) => !a[0] ? 1 : !b[0] ? -1 : a[0].localeCompare(b[0], 'es'));

  if (!filas.length) { grid.innerHTML = '<div style="color:var(--muted);padding:12px">Sin datos todavía — cargá un archivo desde "Por OT".</div>'; return; }

  grid.innerHTML = filas.map(([ot, items]) => {
    const st = estadisticasOT(items);
    const hijas = hijasDe(ot);
    const archivada = esArchivada(ot);
    return `<div class="ot-card" data-ot="${escAttr(ot)}" style="${archivada ? 'opacity:.6' : ''}">
      <div style="font-weight:600;font-size:15px">${ot ? escAttr(formatOT(ot)) : '<span style="color:var(--muted)">(Sin OT)</span>'}
        ${hijas.length ? `<span class="badge" style="margin-left:6px;font-weight:400" title="${escAttr(hijas.map(formatOT).join(', '))}">+${hijas.length} adicional${hijas.length === 1 ? '' : 'es'}</span>` : ''}
        ${archivada ? '<span class="badge" style="margin-left:6px;font-weight:400">📦 Archivada</span>' : ''}
      </div>
      <div style="font-size:13px;margin-top:8px">🛒 Comprado: <strong>${numFmt(st.tot.comprado)} KGS</strong></div>
      <div style="font-size:13px">📋 Solicitado: <strong>${numFmt(st.tot.solic)} KGS</strong></div>
      <div style="font-size:12px;color:var(--muted);margin-top:4px">${st.nItems} ítem${st.nItems === 1 ? '' : 's'}</div>
      ${st.nDIF ? `<div style="font-size:12px;color:var(--red);margin-top:6px">⚠️ ${st.nDIF} con diferencia (DIF)</div>` : ''}
      <div style="margin-top:8px">
        <button type="button" class="bsm mro-toggle-archivo" data-ot="${escAttr(ot)}" data-archivada="${archivada ? '1' : '0'}">${archivada ? '♻️ Reactivar' : '📦 Archivar'}</button>
      </div>
    </div>`;
  }).join('');
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
  if (pr) pr.style.display = tab === 'resumen' ? '' : 'none';
  if (pd) pd.style.display = tab === 'detalle' ? '' : 'none';
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
  const titulo = document.getElementById('mro_det_titulo');
  if (titulo) {
    titulo.innerHTML = `${escAttr(OT_ACTUAL ? `OT ${formatOT(OT_ACTUAL)}` : '(Sin OT)')}${hijas.length ? ` <span style="font-weight:400;font-size:14px;color:var(--muted)">(+ adicionales: ${escAttr(hijas.map(formatOT).join(', '))})</span>` : ''}`;
  }
  const btnToggle = document.getElementById('mro_det_toggle_archivo');
  if (btnToggle) btnToggle.textContent = archivada ? '♻️ Reactivar esta OT' : '📦 Archivar esta OT';

  setTxt('mrod_k_items', st.nItems);
  setTxt('mrod_k_ok', st.nOK);
  setTxt('mrod_k_dif', st.nDIF);

  renderDonutOKDIF('mrod_chart_okdif', st.nOK, st.nDIF);

  const tbody = document.getElementById('t-mro-detalle');
  if (tbody) {
    const filas = items
      .slice()
      .sort((a, b) => (a.descripcion || '').localeCompare(b.descripcion || '', 'es'))
      .map(it => {
        const k = kgsItem(it);
        return `<tr>
          <td>${escAttr(it.cod_articulo)}</td>
          <td>${escAttr(it.descripcion || '')}</td>
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
    tbody.innerHTML = filas || `<tr><td colspan="11" style="text-align:center;padding:18px;color:var(--muted)">Sin ítems</td></tr>`;
  }

  mostrarTabOT(OT_TAB);
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
  document.getElementById('mro_det_tabs')?.addEventListener('click', e => {
    const btn = e.target.closest('.subtab');
    if (btn) mostrarTabOT(btn.dataset.tab);
  });

  document.getElementById('mro_file')?.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) cargarArchivo(file);
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
