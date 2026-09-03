// ============================================================
// Módulo OT — seguimiento de compras por orden de trabajo. Módulo
// propio (no una sub-vista de Cotizaciones), pedido explícito del
// usuario (2026-09-02) para poder trabajarlo con tarjetas por OT +
// gráficos de detalle, en vez de una tabla más dentro de Cotizaciones.
//
// El dato de OT NO sale de Tango — compras_oc_lineas (el export de OC)
// no trae ningún campo de OT — sino de la columna N_OT que ya trae el
// export de Capataz con el que se arma cada solicitud de Cotizaciones
// (ver CLAUDE.md 9.1), guardada en compras_cotizaciones_items.n_ot. Por
// eso este módulo solo puede cubrir lo que pasa por Cotizaciones, no
// las compras que van directo por Tango sin pasar por una solicitud —
// el usuario lo aceptó como punto de partida.
//
// Cada ítem se clasifica en tres orígenes (clasificarItemOT()):
// 'comprado' (a_comprar=true + ganador elegido), 'stock' (a_comprar=
// false, ya había — el "purgado" del Excel de Capataz) y 'pendiente'
// (a_comprar=true sin ganador todavía) — ver CLAUDE.md sección 10.
// ============================================================
import { SB } from '../supabase-client.js';
import { toast, fetchAll, escAttr } from '../utils.js';

let ITEMS = [];        // TODOS los ítems de compras_cotizaciones_items, de todas las solicitudes
let PRECIOS = [];       // TODOS los precios de compras_cotizaciones_precios
let PROVEEDORES = [];   // {id, nombre} — compras_proveedores
let COTIZACIONES = [];  // {id, nombre, fecha} — compras_cotizaciones

let OT_ACTUAL = null;   // OT (string, '' = sin OT) que se está viendo en el detalle; null = vista de tarjetas
let OT_TAB = 'resumen'; // sub-pestaña activa dentro del detalle: 'resumen' (gráficos) o 'detalle' (tabla de ítems)

const SIMBOLO = m => m === 'USD' ? 'U$S' : '$';
const numFmt = (n, dec = 2) => Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: dec });
const fmtMonto = (n, moneda) => SIMBOLO(moneda) + (moneda === 'USD' ? ' ' : '') + numFmt(n, 2);
const MESES_CORTO = { '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr', '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic' };

function setTxt(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }

// Capataz trae el N° de OT con ceros a la izquierda ("000000000596") — se
// muestran sin esos ceros ("596"). Solo se recorta si es puramente
// numérico: "OT1" (el cajón de compras de planta en general, ver
// CLAUDE.md 10.1) y otros valores no numéricos quedan tal cual.
function formatOT(ot) {
  if (!ot) return ot;
  return /^\d+$/.test(ot) ? String(parseInt(ot, 10)) : ot;
}

// El campo UMC de Capataz a veces trae basura en vez de una unidad real
// ("***", "?" cuando venía vacío — ver estadisticasItems) — una unidad
// de verdad siempre tiene alguna letra (KGS, LTS, UNI, MTS...), así que
// cualquier valor sin ninguna letra se descarta antes de mostrarlo.
const esUnidadValida = u => /[A-Za-z]/.test(u);

// KGS es la unidad de referencia del rubro (estructuras/tanques — la
// mayoría del material se compra por peso), así que siempre se muestra
// aunque esta OT no tenga nada comprado/de stock en kg todavía (queda
// en "0 KGS"), y siempre primero en la lista — el resto de las unidades
// presentes (LTS, UNI, etc.) van después, en el orden en que aparecen.
function chipsUnidades(mapaUnidad) {
  const entries = new Map([...mapaUnidad].filter(([u]) => esUnidadValida(u)));
  if (![...entries.keys()].some(u => /^KG/i.test(u))) entries.set('KGS', 0);
  const claves = [...entries.keys()].sort((a, b) => {
    const aKg = /^KG/i.test(a) ? 0 : 1, bKg = /^KG/i.test(b) ? 0 : 1;
    return aKg - bKg;
  });
  return claves.map(u => `${numFmt(entries.get(u))} ${escAttr(u)}`).join(' · ');
}

// ------------------------------------------------------------
// Carga — siempre entera, en cada visita a cualquiera de las dos
// vistas del módulo (no se cachea): lo que alimenta los totales
// (confirmar una compra, elegir un ganador, marcar "No") pasa en la
// vista detalle de una solicitud de Cotizaciones, no acá.
// ------------------------------------------------------------
async function cargarTodo() {
  const [{ data: items, error: e1 }, { data: precios, error: e2 }, { data: provs, error: e3 }, { data: cots, error: e4 }] = await Promise.all([
    fetchAll(() => SB.from('compras_cotizaciones_items')
      .select('id,cotizacion_id,cod_articulo,descripcion,n_ot,a_comprar,cant_umc,umc,ganador_proveedor_id,confirmado')),
    fetchAll(() => SB.from('compras_cotizaciones_precios').select('item_id,proveedor_id,precio_unitario,moneda')),
    fetchAll(() => SB.from('compras_proveedores').select('id,nombre')),
    fetchAll(() => SB.from('compras_cotizaciones').select('id,nombre,fecha')),
  ]);
  const error = e1 || e2 || e3 || e4;
  if (error) { toast(error.message, 'er'); return; }
  ITEMS = items || [];
  PRECIOS = precios || [];
  PROVEEDORES = provs || [];
  COTIZACIONES = cots || [];
}

// 'comprado' = se decidió comprarlo y tiene ganador elegido; 'stock' = se
// marcó "No" en la solicitud porque ya había stock (ver CLAUDE.md 9.2
// punto 2, el "purgado" del Excel de Capataz); 'pendiente' = todavía a
// comprar pero sin ganador elegido — ni comprado ni de stock, no cuenta
// en ninguno de los dos totales para no inflar uno u otro con algo sin
// definir.
function clasificarItemOT(it) {
  if (!it.a_comprar) return 'stock';
  return it.ganador_proveedor_id ? 'comprado' : 'pendiente';
}

// '' agrupa los ítems sin OT (el archivo de Capataz no siempre trae la
// columna N_OT completa) — quedan como su propio grupo "(Sin OT)" en
// vez de perderse del total, para que se note que faltan etiquetar.
function agruparPorOT() {
  const grupos = new Map();
  for (const it of ITEMS) {
    const ot = (it.n_ot || '').trim();
    if (!grupos.has(ot)) grupos.set(ot, []);
    grupos.get(ot).push(it);
  }
  return grupos;
}

function precioMapa() {
  return new Map(PRECIOS.map(p => [`${p.item_id}|${p.proveedor_id}`, p]));
}

// Estadísticas de un conjunto de ítems (una OT, o todos para el
// Dashboard) — separa comprado/stock/pendiente y, dentro de comprado,
// agrupa por moneda para el monto, por proveedor y por mes de la
// solicitud (nunca se mezclan ARS/USD en una misma suma ni en un mismo
// gráfico, mismo criterio de Cotizaciones — ver CLAUDE.md 9.2 punto 7).
function estadisticasItems(items, mapaPrecios, cotMap) {
  const st = {
    nComprado: 0, nStock: 0, nPendiente: 0, sinConfirmar: 0,
    compradoUnidad: new Map(),        // umc -> cantidad
    stockUnidad: new Map(),           // umc -> cantidad
    compradoMoneda: new Map(),        // moneda -> monto total
    porProveedorMoneda: new Map(),    // moneda -> Map(proveedor_id -> monto)
    porMesMoneda: new Map(),          // moneda -> Map('YYYY-MM' -> monto)
  };
  for (const it of items) {
    const tipo = clasificarItemOT(it);
    const umc = it.umc || '?';
    if (tipo === 'comprado') {
      st.nComprado++;
      st.compradoUnidad.set(umc, (st.compradoUnidad.get(umc) || 0) + (Number(it.cant_umc) || 0));
      if (!it.confirmado) st.sinConfirmar++;
      const precio = mapaPrecios.get(`${it.id}|${it.ganador_proveedor_id}`);
      if (precio && precio.precio_unitario != null) {
        const subtotal = Number(precio.precio_unitario) * (Number(it.cant_umc) || 0);
        const m = precio.moneda;
        st.compradoMoneda.set(m, (st.compradoMoneda.get(m) || 0) + subtotal);
        if (!st.porProveedorMoneda.has(m)) st.porProveedorMoneda.set(m, new Map());
        const pm = st.porProveedorMoneda.get(m);
        pm.set(it.ganador_proveedor_id, (pm.get(it.ganador_proveedor_id) || 0) + subtotal);
        const mes = cotMap.get(it.cotizacion_id)?.fecha?.slice(0, 7);
        if (mes) {
          if (!st.porMesMoneda.has(m)) st.porMesMoneda.set(m, new Map());
          const mm = st.porMesMoneda.get(m);
          mm.set(mes, (mm.get(mes) || 0) + subtotal);
        }
      }
    } else if (tipo === 'stock') {
      st.nStock++;
      st.stockUnidad.set(umc, (st.stockUnidad.get(umc) || 0) + (Number(it.cant_umc) || 0));
    } else {
      st.nPendiente++;
    }
  }
  return st;
}

// ------------------------------------------------------------
// Gráficos (Chart.js, cargado por CDN en index.html — mismo criterio
// que el Dashboard de Órdenes de Compra, ver CLAUDE.md sección 11: los
// colores de texto/grilla se leen de las variables CSS del tema activo
// en cada render, los de acento quedan fijos en los dos temas).
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

// Un donut "Comprado vs. de stock" **por unidad** (KGS, LTS, UNI...) en
// vez de uno solo por cantidad de ítems — un ítem "1 tonelada" y un
// ítem "1 tornillo" no pesan lo mismo en la decisión de compra, así que
// mezclarlos en un solo número de ítems no dice mucho. Mismo criterio de
// "un chart-card por serie" que renderBarrasPorMoneda/renderEvolucionPorMoneda,
// y mismo criterio de chipsUnidades() de siempre incluir KGS (aunque sea
// "0 KGS") por ser la unidad de referencia del rubro.
function renderDonutsPorUnidad(contId, compradoUnidad, stockUnidad) {
  const cont = document.getElementById(contId);
  if (!cont) return;
  const claves = new Set([...compradoUnidad.keys(), ...stockUnidad.keys()].filter(esUnidadValida));
  if (![...claves].some(u => /^KG/i.test(u))) claves.add('KGS');
  const ordenadas = [...claves].sort((a, b) => {
    const aKg = /^KG/i.test(a) ? 0 : 1, bKg = /^KG/i.test(b) ? 0 : 1;
    return aKg - bKg || a.localeCompare(b);
  });
  cont.innerHTML = ordenadas.map((u, i) => `<div class="chart-card">
    <h3>Comprado vs. de stock (${escAttr(u)})</h3>
    <div class="chart-wrap"><canvas id="${contId}_c${i}"></canvas></div>
  </div>`).join('');
  const bg2 = getComputedStyle(document.documentElement).getPropertyValue('--bg2').trim();
  ordenadas.forEach((u, i) => {
    const canvasId = `${contId}_c${i}`;
    const comprado = compradoUnidad.get(u) || 0;
    const stock = stockUnidad.get(u) || 0;
    renderChart(canvasId, canvasId, {
      type: 'doughnut',
      data: { labels: ['Comprado', 'De stock'], datasets: [{ data: [comprado, stock], backgroundColor: ['#22c55e', '#64748b'], borderColor: bg2, borderWidth: 2 }] },
      options: {
        responsive: true, maintainAspectRatio: false, plugins: {
          legend: { position: 'bottom' },
          tooltip: { callbacks: { label: ctx => `${ctx.label}: ${numFmt(ctx.raw)} ${u}` } },
        },
      },
    });
  });
}

// Un gráfico de barras horizontales por cada moneda presente en
// `porMoneda` (Map moneda -> Map key -> monto) — nunca mezcla ARS y
// USD en el mismo eje (sería un dual-axis encubierto), así que son
// gráficos aparte uno al lado del otro en vez de uno solo con dos
// escalas. Con una sola moneda (el caso normal) queda un único gráfico.
function renderBarrasPorMoneda(contId, porMoneda, labelFn, tituloBase) {
  const cont = document.getElementById(contId);
  if (!cont) return;
  const monedas = [...porMoneda.keys()].filter(m => porMoneda.get(m).size > 0);
  if (!monedas.length) { cont.innerHTML = '<div class="chart-card"><div class="chart-empty">Sin datos todavía</div></div>'; return; }
  cont.innerHTML = monedas.map((m, i) => `<div class="chart-card">
    <h3>${tituloBase}${monedas.length > 1 ? ` (${SIMBOLO(m)})` : ''}</h3>
    <div class="chart-wrap"><canvas id="${contId}_c${i}"></canvas></div>
  </div>`).join('');
  monedas.forEach((m, i) => {
    const canvasId = `${contId}_c${i}`;
    const datos = [...porMoneda.get(m).entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    renderChart(canvasId, canvasId, {
      type: 'bar',
      data: { labels: datos.map(d => labelFn(d[0])), datasets: [{ label: 'Monto', data: datos.map(d => d[1]), backgroundColor: '#6366f1', borderRadius: 4 }] },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => fmtMonto(ctx.raw, m) } } },
        scales: { x: { ticks: { callback: v => fmtMonto(v, m) } } },
      },
    });
  });
}

// Mismo criterio de "un gráfico por moneda" para la evolución mensual.
function renderEvolucionPorMoneda(contId, porMesMoneda, tituloBase) {
  const cont = document.getElementById(contId);
  if (!cont) return;
  const monedas = [...porMesMoneda.keys()].filter(m => porMesMoneda.get(m).size > 0);
  if (!monedas.length) { cont.innerHTML = '<div class="chart-card"><div class="chart-empty">Sin datos todavía</div></div>'; return; }
  cont.innerHTML = monedas.map((m, i) => `<div class="chart-card">
    <h3>${tituloBase}${monedas.length > 1 ? ` (${SIMBOLO(m)})` : ''}</h3>
    <div class="chart-wrap"><canvas id="${contId}_c${i}"></canvas></div>
  </div>`).join('');
  monedas.forEach((m, i) => {
    const canvasId = `${contId}_c${i}`;
    const meses = [...porMesMoneda.get(m).keys()].sort();
    renderChart(canvasId, canvasId, {
      type: 'bar',
      data: {
        labels: meses.map(mes => `${MESES_CORTO[mes.slice(5)] || mes.slice(5)} ${mes.slice(2, 4)}`),
        datasets: [{ label: 'Monto', data: meses.map(mes => porMesMoneda.get(m).get(mes)), backgroundColor: '#3b82f6', borderRadius: 4 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => fmtMonto(ctx.raw, m) } } },
        scales: { y: { ticks: { callback: v => fmtMonto(v, m) } } },
      },
    });
  });
}

// ------------------------------------------------------------
// Dashboard
// ------------------------------------------------------------
function renderDashboard() {
  aplicarTemaChart();
  const grupos = agruparPorOT();
  const mapaPrecios = precioMapa();
  const cotMap = new Map(COTIZACIONES.map(c => [c.id, c]));

  const stGeneral = estadisticasItems(ITEMS, mapaPrecios, cotMap);
  setTxt('otd_k_ot', [...grupos.keys()].filter(Boolean).length);
  setTxt('otd_k_comprados', stGeneral.nComprado);
  setTxt('otd_k_stock', stGeneral.nStock);
  setTxt('otd_k_sinot', (grupos.get('') || []).length);

  renderDonutsPorUnidad('otd_chart_compstock_wrap', stGeneral.compradoUnidad, stGeneral.stockUnidad);

  // Ranking de OTs por monto comprado — se calcula agrupando el total
  // de cada OT por moneda (mismo criterio de no mezclar de arriba).
  const porMonedaOT = new Map();
  for (const [ot, items] of grupos) {
    const st = estadisticasItems(items, mapaPrecios, cotMap);
    for (const [m, v] of st.compradoMoneda) {
      if (!porMonedaOT.has(m)) porMonedaOT.set(m, new Map());
      porMonedaOT.get(m).set(ot || '(Sin OT)', v);
    }
  }
  renderBarrasPorMoneda('otd_ranking_wrap', porMonedaOT, k => k, 'Ranking de OTs por monto');
}

// ------------------------------------------------------------
// Por OT — tarjetas + detalle de una OT
// ------------------------------------------------------------
function renderCards() {
  const grid = document.getElementById('ot_cards_grid');
  if (!grid) return;
  const q = (document.getElementById('ot_f_q')?.value || '').trim().toUpperCase();
  const grupos = agruparPorOT();
  const mapaPrecios = precioMapa();
  const cotMap = new Map(COTIZACIONES.map(c => [c.id, c]));

  let filas = [...grupos.entries()];
  if (q) filas = filas.filter(([ot]) => (ot || 'SIN OT').toUpperCase().includes(q));
  // "Sin OT" siempre al final — no es una OT real.
  filas.sort((a, b) => !a[0] ? 1 : !b[0] ? -1 : a[0].localeCompare(b[0], 'es'));

  if (!filas.length) { grid.innerHTML = '<div style="color:var(--muted);padding:12px">Sin ítems todavía</div>'; return; }

  grid.innerHTML = filas.map(([ot, items]) => {
    const st = estadisticasItems(items, mapaPrecios, cotMap);
    const chipsComprado = st.nComprado ? chipsUnidades(st.compradoUnidad) : '–';
    const chipsMonto = [...st.compradoMoneda.entries()].map(([m, v]) => fmtMonto(v, m)).join(' + ') || '–';
    const chipsStock = st.nStock ? chipsUnidades(st.stockUnidad) : '–';
    return `<div class="ot-card" data-ot="${escAttr(ot)}">
      <div style="font-weight:600;font-size:15px">${ot ? escAttr(formatOT(ot)) : '<span style="color:var(--muted)">(Sin OT)</span>'}</div>
      <div style="font-size:13px;margin-top:8px">🛒 <strong>${st.nComprado}</strong> comprado${st.nComprado === 1 ? '' : 's'}</div>
      <div style="font-size:12px;color:var(--muted)">${chipsComprado}</div>
      <div style="font-size:13px;margin-top:2px">${chipsMonto}</div>
      <div style="font-size:13px;margin-top:8px">📦 <strong>${st.nStock}</strong> de stock</div>
      <div style="font-size:12px;color:var(--muted)">${chipsStock}</div>
      ${st.nPendiente ? `<div style="font-size:12px;color:var(--yellow);margin-top:6px">⏳ ${st.nPendiente} pendiente${st.nPendiente === 1 ? '' : 's'}</div>` : ''}
    </div>`;
  }).join('');
}

function abrirDetalle(ot) {
  OT_ACTUAL = ot;
  OT_TAB = 'resumen'; // cada OT se abre mostrando primero el resumen/gráficos
  const vc = document.getElementById('ot-vista-cards');
  const vd = document.getElementById('ot-vista-detalle');
  if (vc) vc.style.display = 'none';
  if (vd) vd.style.display = '';
  renderDetalle();
}

function volverACards() {
  OT_ACTUAL = null;
  const vc = document.getElementById('ot-vista-cards');
  const vd = document.getElementById('ot-vista-detalle');
  if (vd) vd.style.display = 'none';
  if (vc) vc.style.display = '';
}

// Los gráficos (Chart.js) necesitan que su contenedor tenga tamaño real
// en el momento en que se crean — si el panel "Resumen" estuviera
// display:none en ese momento (ej. se había quedado en la sub-pestaña
// "Detalle" de una OT anterior), el canvas queda con dimensiones 0.
// Por eso renderDetalle() lo fuerza visible antes de dibujar y recién
// después aplica la sub-pestaña realmente activa.
function mostrarTabOT(tab) {
  OT_TAB = tab;
  document.querySelectorAll('#ot_det_tabs .subtab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  const pr = document.getElementById('ot_det_panel_resumen');
  const pd = document.getElementById('ot_det_panel_detalle');
  if (pr) pr.style.display = tab === 'resumen' ? '' : 'none';
  if (pd) pd.style.display = tab === 'detalle' ? '' : 'none';
}

function renderDetalle() {
  if (OT_ACTUAL === null) return;
  const pr = document.getElementById('ot_det_panel_resumen');
  if (pr) pr.style.display = ''; // visible mientras se dibujan los gráficos, ver mostrarTabOT()
  aplicarTemaChart();
  const grupos = agruparPorOT();
  const items = grupos.get(OT_ACTUAL) || [];
  const mapaPrecios = precioMapa();
  const cotMap = new Map(COTIZACIONES.map(c => [c.id, c]));
  const provNombre = new Map(PROVEEDORES.map(p => [p.id, p.nombre]));

  const titulo = document.getElementById('ot_det_titulo');
  if (titulo) titulo.textContent = OT_ACTUAL ? `OT ${formatOT(OT_ACTUAL)}` : '(Sin OT)';

  const st = estadisticasItems(items, mapaPrecios, cotMap);
  setTxt('otdet_k_comprados', st.nComprado);
  setTxt('otdet_k_stock', st.nStock);
  setTxt('otdet_k_pendientes', st.nPendiente);
  setTxt('otdet_k_sinconfirmar', st.sinConfirmar);

  renderDonutsPorUnidad('otdet_chart_compstock_wrap', st.compradoUnidad, st.stockUnidad);
  renderBarrasPorMoneda('otdet_prov_wrap', st.porProveedorMoneda, id => provNombre.get(id) || '(?)', 'Gasto por proveedor');
  renderEvolucionPorMoneda('otdet_evol_wrap', st.porMesMoneda, 'Monto comprado por mes');

  const tbody = document.getElementById('t-ot-detalle');
  if (tbody) {
    const filas = items
      .slice()
      .sort((a, b) => (a.descripcion || '').localeCompare(b.descripcion || '', 'es'))
      .map(it => {
        const tipo = clasificarItemOT(it);
        const umc = it.umc || '?';
        const precio = tipo === 'comprado' ? mapaPrecios.get(`${it.id}|${it.ganador_proveedor_id}`) : null;
        const subtotal = precio && precio.precio_unitario != null ? Number(precio.precio_unitario) * (Number(it.cant_umc) || 0) : null;
        const origen = tipo === 'comprado' ? '🛒 Comprado' : tipo === 'stock' ? '📦 De stock' : '⏳ Pendiente';
        return `<tr>
          <td>${escAttr(it.cod_articulo)}</td>
          <td>${escAttr(it.descripcion || '')}</td>
          <td style="text-align:right">${it.cant_umc != null ? numFmt(it.cant_umc) : '–'} ${escAttr(umc)}</td>
          <td>${origen}</td>
          <td>${tipo === 'comprado' ? escAttr(provNombre.get(it.ganador_proveedor_id) || '(?)') : '–'}</td>
          <td style="text-align:right">${precio && precio.precio_unitario != null ? fmtMonto(Number(precio.precio_unitario), precio.moneda) : '–'}</td>
          <td style="text-align:right">${subtotal != null ? fmtMonto(subtotal, precio.moneda) : '–'}</td>
          <td>${tipo === 'comprado' ? (it.confirmado ? '✅ Confirmada' : 'Sin confirmar') : '–'}</td>
          <td>${escAttr(cotMap.get(it.cotizacion_id)?.nombre || '(?)')}</td>
        </tr>`;
      }).join('');
    tbody.innerHTML = filas || `<tr><td colspan="9" style="text-align:center;padding:18px;color:var(--muted)">Sin ítems</td></tr>`;
  }

  mostrarTabOT(OT_TAB); // recién ahora se aplica la sub-pestaña real (puede ocultar el resumen que se mostró arriba para dibujar los gráficos)
}

// ------------------------------------------------------------
export async function render(secId) {
  await cargarTodo();
  if (secId === 'ot-dash') { renderDashboard(); return; }
  if (secId !== 'ot-cards') return;
  // Si se navegó de vuelta con el detalle de una OT todavía abierto, se
  // vuelve a pintar ESE detalle (con los datos recién recargados) en vez
  // de resetear a la grilla — mismo criterio que Cotizaciones con
  // COT_ACTUAL.
  if (OT_ACTUAL !== null) { renderDetalle(); return; }
  renderCards();
}

export function init() {
  document.getElementById('ot_f_q')?.addEventListener('input', renderCards);
  document.getElementById('ot_det_volver')?.addEventListener('click', volverACards);
  document.getElementById('otd-ir-cards')?.addEventListener('click', () => document.querySelector('.nav-item[data-sec="ot-cards"]')?.click());
  document.getElementById('ot_cards_grid')?.addEventListener('click', e => {
    const card = e.target.closest('.ot-card');
    if (card) abrirDetalle(card.dataset.ot);
  });
  document.getElementById('ot_det_tabs')?.addEventListener('click', e => {
    const btn = e.target.closest('.subtab');
    if (btn) mostrarTabOT(btn.dataset.tab);
  });
}
