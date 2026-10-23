// ============================================================
// Módulo Dólar — histórico diario del dólar oficial (Banco Nación),
// pensado como referencia para convertir precios USD↔ARS en el resto
// del tablero (hoy: Materiales OT → Costo, ver 13.11). Pedido explícito
// del usuario, 2026-10-24: "cargar una cotización de todos los días del
// dólar... para que puedas tomar como referencia para pasar los precios
// en pesos a dólares".
//
// Fuente: ArgentinaDatos (api.argentinadatos.com), API pública y
// gratuita con CORS abierto (confirmado antes de usarla) — mismo
// criterio de "sin backend propio" que el resto del tablero. Se usa el
// dólar OFICIAL (casa=oficial, Banco Nación), a pedido explícito del
// usuario; cambiar a "mayorista" es solo cambiar la constante CASA.
//
// Es su propia tabla (compras_dolar_historico), sin relación con
// ninguna otra — otros módulos la consultan directo (no se importan
// funciones de este archivo desde afuera), mismo criterio de "cada
// módulo independiente, se comparte por tabla no por import" de
// siempre.
// ============================================================
import { SB } from '../supabase-client.js';
import { toast, fetchAll, fmt, today, obtenerDolarReferencia } from '../utils.js';

const API_BASE = 'https://api.argentinadatos.com/v1/cotizaciones/dolares';
const CASA = 'oficial'; // dólar oficial, Banco Nación — pedido explícito del usuario, 2026-10-24

const numFmt = (n, dec = 2) => Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
function setTxt(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }

let FILAS = []; // [{fecha, compra, venta}], ascendente por fecha

async function cargarDesdeSupabase() {
  const { data, error } = await fetchAll(() => SB.from('compras_dolar_historico').select('fecha,compra,venta').order('fecha', { ascending: true }));
  if (error) { toast(error.message, 'er'); return []; }
  return data || [];
}

// ------------------------------------------------------------
// Sincronización con ArgentinaDatos
// ------------------------------------------------------------
async function fetchSerieCompleta() {
  const r = await fetch(`${API_BASE}/${CASA}`);
  if (!r.ok) throw new Error(`ArgentinaDatos respondió ${r.status}`);
  return r.json(); // [{casa, compra, venta, fecha}, ...] ascendente por fecha
}

async function guardarFilas(serie) {
  const filas = serie.map(f => ({ fecha: f.fecha, compra: f.compra, venta: f.venta }));
  const BATCH = 500;
  for (let i = 0; i < filas.length; i += BATCH) {
    const { error } = await SB.from('compras_dolar_historico').upsert(filas.slice(i, i + BATCH), { onConflict: 'fecha' });
    if (error) throw new Error(error.message);
  }
}

// Carga/actualiza el histórico COMPLETO (hoy ronda los 5700+ días) — con
// aviso previo, mismo criterio que cualquier carga masiva del tablero
// (OC/Stock/Materiales OT). Upsert por fecha: nunca borra nada, así que
// se puede repetir sin riesgo — sirve tanto para la carga inicial como
// para "repasar" todo el histórico si hiciera falta.
async function cargarHistoricoCompleto() {
  let serie;
  try {
    serie = await fetchSerieCompleta();
  } catch (e) {
    toast(`No se pudo consultar ArgentinaDatos: ${e.message}`, 'er');
    return;
  }
  if (!serie.length) { toast('ArgentinaDatos no devolvió datos', 'er'); return; }
  const desde = serie[0].fecha, hasta = serie[serie.length - 1].fecha;
  if (!confirm(`Se van a cargar/actualizar ${serie.length} días de cotización del dólar oficial (${fmt(desde)} a ${fmt(hasta)}).\n\nNo borra nada — solo agrega/actualiza por fecha. ¿Continuar?`)) return;
  try {
    await guardarFilas(serie);
  } catch (e) {
    toast(`Error al guardar: ${e.message}`, 'er');
    return;
  }
  toast(`✓ ${serie.length} días cargados/actualizados`);
  FILAS = await cargarDesdeSupabase();
  renderVista();
}

// Sincronización liviana (últimos N días) — para no tener que repetir la
// carga completa solo para ponerse al día con lo más reciente.
async function sincronizarUltimosDias() {
  let serie;
  try {
    serie = await fetchSerieCompleta();
  } catch (e) {
    toast(`No se pudo consultar ArgentinaDatos: ${e.message}`, 'er');
    return;
  }
  const recientes = serie.slice(-30);
  try {
    await guardarFilas(recientes);
  } catch (e) {
    toast(`Error al guardar: ${e.message}`, 'er');
    return;
  }
  toast(`✓ Actualizado hasta ${fmt(recientes[recientes.length - 1].fecha)}`);
  FILAS = await cargarDesdeSupabase();
  renderVista();
}

// ------------------------------------------------------------
// Vista — KPIs + evolución + últimos días
// ------------------------------------------------------------
function renderVista() {
  const n = FILAS.length;
  setTxt('dol_k_dias', n ? numFmt(n, 0) : '–');
  setTxt('dol_k_desde', n ? fmt(FILAS[0].fecha) : '–');
  setTxt('dol_k_hasta', n ? fmt(FILAS[n - 1].fecha) : '–');
  const hoyF = FILAS[n - 1];
  const esHoy = hoyF && hoyF.fecha === today();
  setTxt('dol_k_hoy', hoyF ? `$${numFmt(hoyF.venta)}` : '–');
  const sub = document.getElementById('dol_k_hoy_sub');
  if (sub) sub.textContent = hoyF ? (esHoy ? 'cotización de hoy' : `última disponible, ${fmt(hoyF.fecha)}`) : '';

  // Gráfico: últimos ~2 años, para que la variación reciente no quede
  // aplastada contra todo el histórico desde 2011 (hiperinflación
  // incluida) — el histórico completo igual queda guardado en la base.
  const recorte = FILAS.slice(-730);
  renderChart(recorte);

  const tbody = document.getElementById('t-dolar-dias');
  if (tbody) {
    const ultimos = FILAS.slice(-10).reverse();
    tbody.innerHTML = ultimos.length
      ? ultimos.map(f => `<tr><td>${fmt(f.fecha)}</td><td style="text-align:right">$${numFmt(f.compra)}</td><td style="text-align:right">$${numFmt(f.venta)}</td></tr>`).join('')
      : `<tr><td colspan="3" style="text-align:center;padding:18px;color:var(--muted)">Sin histórico cargado todavía</td></tr>`;
  }
}

let CHART = null;
function renderChart(filas) {
  const canvas = document.getElementById('dol_chart');
  if (!canvas || typeof Chart === 'undefined') return;
  if (CHART) CHART.destroy();
  const cssVars = getComputedStyle(document.documentElement);
  Chart.defaults.color = cssVars.getPropertyValue('--muted').trim();
  Chart.defaults.borderColor = cssVars.getPropertyValue('--border').trim();
  CHART = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: filas.map(f => fmt(f.fecha)),
      datasets: [{ label: 'Dólar oficial (venta)', data: filas.map(f => f.venta), borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,.12)', fill: true, pointRadius: 0, borderWidth: 2, tension: .15 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `$${numFmt(ctx.raw)}` } } },
      scales: { x: { ticks: { maxTicksLimit: 10 } }, y: { ticks: { callback: v => '$' + numFmt(v, 0) } } },
    },
  });
}

// ------------------------------------------------------------
export async function render(secId) {
  if (secId !== 'param-dolar') return;
  // Antes de mostrar, aprovecha el mismo chequeo liviano que ya usan
  // Materiales OT/Cotizaciones (ver obtenerDolarReferencia() en
  // js/utils.js) para completar solo los días recientes que falten — así
  // entrar acá también sirve para verlo al día, no solo los botones.
  await obtenerDolarReferencia();
  FILAS = await cargarDesdeSupabase();
  renderVista();
}

export function init() {
  document.getElementById('dol_btn_completo')?.addEventListener('click', cargarHistoricoCompleto);
  document.getElementById('dol_btn_reciente')?.addEventListener('click', sincronizarUltimosDias);
}
