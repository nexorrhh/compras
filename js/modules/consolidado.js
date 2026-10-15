// ============================================================
// Módulo Consolidado — cuánto se le compró ya CONFIRMADO a cada
// proveedor, agrupado por semana. Pedido explícito del usuario
// (2026-10-15): "por cada cotización que voy armando que me diga tanto
// a cada proveedor... en lo posible separado por semana" — hasta acá
// esto se armaba a mano mirando la hoja "Consolidado" del informe de
// reparto de cada cotización por separado (ver CLAUDE.md sección 9.2).
// Mismo criterio que OT/Materiales OT: módulo de nav propio, sin tablas
// propias, lee y reagrupa los datos de Cotizaciones.
//
// Solo cuenta lo CONFIRMADO (`confirmado = true`, botón "✅ Confirmar
// compra" en Cotizaciones) — no lo que todavía es solo un ganador
// sugerido/elegido en la comparativa, para que el consolidado refleje
// compras realmente decididas, no una estimación. La semana se arma con
// `confirmado_en` (fecha real en que se confirmó — ver
// sql/028_cotizaciones_confirmado_en.sql); las compras confirmadas antes
// de esa migración quedaron con un backfill aproximado (la fecha de
// creación de la solicitud), documentado ahí y en CLAUDE.md sección 14.
// ============================================================
import { SB } from '../supabase-client.js';
import { toast, fetchAll, escAttr } from '../utils.js';

let ITEMS = [];       // compras_cotizaciones_items con confirmado=true
let PRECIOS = [];      // compras_cotizaciones_precios
let PROVEEDORES = [];  // {id, nombre}

const SIMBOLO = m => m === 'USD' ? 'U$S' : '$';
const numFmt = (n, dec = 2) => Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: dec });
const fmtMonto = (n, moneda) => SIMBOLO(moneda) + (moneda === 'USD' ? ' ' : '') + numFmt(n, 2);

function setTxt(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }

// Semana = lunes a domingo, identificada por la fecha (YYYY-MM-DD, hora
// local) de su lunes — ordena bien como texto y sirve de clave de
// agrupación sin tener que guardar nada aparte.
function inicioSemana(fechaStr) {
  const d = new Date(fechaStr);
  const dia = d.getDay(); // 0=domingo .. 6=sábado
  const offset = dia === 0 ? -6 : 1 - dia;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset);
}
function claveSemana(fechaStr) {
  const l = inicioSemana(fechaStr);
  return `${l.getFullYear()}-${String(l.getMonth() + 1).padStart(2, '0')}-${String(l.getDate()).padStart(2, '0')}`;
}
function labelSemana(clave) {
  const [y, m, d] = clave.split('-').map(Number);
  const lunes = new Date(y, m - 1, d);
  const domingo = new Date(y, m - 1, d + 6);
  const fmtDia = dt => `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}`;
  return `${fmtDia(lunes)} – ${fmtDia(domingo)}/${domingo.getFullYear()}`;
}

// ------------------------------------------------------------
// Carga — siempre entera en cada visita (no se cachea, mismo motivo que
// OT: lo que alimenta los totales pasa al confirmar una compra dentro de
// una solicitud de Cotizaciones, no acá). Solo trae los ítems ya
// confirmados — es lo único que importa para este módulo.
// ------------------------------------------------------------
async function cargarTodo() {
  const [{ data: items, error: e1 }, { data: precios, error: e2 }, { data: provs, error: e3 }] = await Promise.all([
    fetchAll(() => SB.from('compras_cotizaciones_items')
      .select('id,ganador_proveedor_id,cant_umc,umc,confirmado_en')
      .eq('confirmado', true)),
    fetchAll(() => SB.from('compras_cotizaciones_precios').select('item_id,proveedor_id,precio_unitario,moneda')),
    fetchAll(() => SB.from('compras_proveedores').select('id,nombre')),
  ]);
  const error = e1 || e2 || e3;
  if (error) { toast(error.message, 'er'); return; }
  // Defensivo: un ítem confirmado sin confirmado_en no debería existir
  // después de correr la migración 028 (que hizo el backfill), pero si
  // pasara (ej. todavía no se corrió) se descarta en vez de romper el
  // agrupado por semana — no se inventa una fecha.
  ITEMS = (items || []).filter(it => it.confirmado_en && it.ganador_proveedor_id);
  PRECIOS = precios || [];
  PROVEEDORES = provs || [];
}

function precioMapa() {
  return new Map(PRECIOS.map(p => [`${p.item_id}|${p.proveedor_id}`, p]));
}

// Map(claveSemana -> Map(proveedor_id -> {nItems, montoPorMoneda, cantidadPorUnidad}))
function agruparPorSemana() {
  const mapaPrecios = precioMapa();
  const porSemana = new Map();
  for (const it of ITEMS) {
    const clave = claveSemana(it.confirmado_en);
    if (!porSemana.has(clave)) porSemana.set(clave, new Map());
    const porProv = porSemana.get(clave);
    if (!porProv.has(it.ganador_proveedor_id)) {
      porProv.set(it.ganador_proveedor_id, { nItems: 0, montoPorMoneda: new Map(), cantidadPorUnidad: new Map() });
    }
    const g = porProv.get(it.ganador_proveedor_id);
    g.nItems++;
    const umc = it.umc || '?';
    g.cantidadPorUnidad.set(umc, (g.cantidadPorUnidad.get(umc) || 0) + (Number(it.cant_umc) || 0));
    const precio = mapaPrecios.get(`${it.id}|${it.ganador_proveedor_id}`);
    if (precio && precio.precio_unitario != null) {
      const subtotal = Number(precio.precio_unitario) * (Number(it.cant_umc) || 0);
      g.montoPorMoneda.set(precio.moneda, (g.montoPorMoneda.get(precio.moneda) || 0) + subtotal);
    }
  }
  return porSemana;
}

function chipsUnidad(mapa) {
  return [...mapa.entries()].map(([u, c]) => `${numFmt(c)} ${escAttr(u)}`).join(' · ') || '–';
}
function chipsMonto(mapa) {
  return [...mapa.entries()].map(([m, v]) => fmtMonto(v, m)).join(' + ') || '–';
}

// ------------------------------------------------------------
// Gráficos (Chart.js) — mismo criterio que OT/Materiales OT/Órdenes de
// Compra: un gráfico por moneda (nunca se mezcla ARS/USD en el mismo
// eje), colores de texto/grilla leídos del tema activo en cada render.
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

// Monto confirmado por semana, últimas N semanas en orden cronológico —
// un .chart-card por moneda presente.
function renderEvolucionSemanal(contId, porSemana, n = 12) {
  const cont = document.getElementById(contId);
  if (!cont) return;
  const claves = [...porSemana.keys()].sort().slice(-n);
  const porMoneda = new Map(); // moneda -> Map(clave -> monto)
  for (const clave of claves) {
    for (const g of porSemana.get(clave).values()) {
      for (const [m, v] of g.montoPorMoneda) {
        if (!porMoneda.has(m)) porMoneda.set(m, new Map());
        const mm = porMoneda.get(m);
        mm.set(clave, (mm.get(clave) || 0) + v);
      }
    }
  }
  const monedas = [...porMoneda.keys()];
  if (!monedas.length || !claves.length) { cont.innerHTML = '<div class="chart-card"><div class="chart-empty">Sin compras confirmadas todavía</div></div>'; return; }
  cont.innerHTML = monedas.map((m, i) => `<div class="chart-card">
    <h3>Monto confirmado por semana${monedas.length > 1 ? ` (${SIMBOLO(m)})` : ''}</h3>
    <div class="chart-wrap"><canvas id="${contId}_c${i}"></canvas></div>
  </div>`).join('');
  monedas.forEach((m, i) => {
    const canvasId = `${contId}_c${i}`;
    renderChart(canvasId, canvasId, {
      type: 'bar',
      data: {
        labels: claves.map(labelSemana),
        datasets: [{ label: 'Monto', data: claves.map(c => porMoneda.get(m).get(c) || 0), backgroundColor: '#3b82f6', borderRadius: 4 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => fmtMonto(ctx.raw, m) } } },
        scales: { y: { ticks: { callback: v => fmtMonto(v, m) } } },
      },
    });
  });
}

// Top 10 proveedores por monto confirmado (todas las semanas) — un
// .chart-card por moneda presente.
function renderRankingProveedores(contId, porSemana) {
  const cont = document.getElementById(contId);
  if (!cont) return;
  const nombrePorId = new Map(PROVEEDORES.map(p => [p.id, p.nombre]));
  const porMoneda = new Map(); // moneda -> Map(proveedor_id -> monto)
  for (const porProv of porSemana.values()) {
    for (const [provId, g] of porProv) {
      for (const [m, v] of g.montoPorMoneda) {
        if (!porMoneda.has(m)) porMoneda.set(m, new Map());
        const mm = porMoneda.get(m);
        mm.set(provId, (mm.get(provId) || 0) + v);
      }
    }
  }
  const monedas = [...porMoneda.keys()];
  if (!monedas.length) { cont.innerHTML = '<div class="chart-card"><div class="chart-empty">Sin compras confirmadas todavía</div></div>'; return; }
  cont.innerHTML = monedas.map((m, i) => `<div class="chart-card">
    <h3>Top proveedores por monto confirmado${monedas.length > 1 ? ` (${SIMBOLO(m)})` : ''}</h3>
    <div class="chart-wrap"><canvas id="${contId}_c${i}"></canvas></div>
  </div>`).join('');
  monedas.forEach((m, i) => {
    const canvasId = `${contId}_c${i}`;
    const datos = [...porMoneda.get(m).entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    renderChart(canvasId, canvasId, {
      type: 'bar',
      data: { labels: datos.map(d => nombrePorId.get(d[0]) || '(?)'), datasets: [{ label: 'Monto', data: datos.map(d => d[1]), backgroundColor: '#6366f1', borderRadius: 4 }] },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => fmtMonto(ctx.raw, m) } } },
        scales: { x: { ticks: { callback: v => fmtMonto(v, m) } } },
      },
    });
  });
}

// ------------------------------------------------------------
// Dashboard
// ------------------------------------------------------------
function renderDashboard() {
  aplicarTemaChart();
  const porSemana = agruparPorSemana();
  const semanaActual = claveSemana(new Date().toISOString());
  const proveedoresUnicos = new Set();
  let nItemsEstaSemana = 0;
  for (const [clave, porProv] of porSemana) {
    for (const provId of porProv.keys()) proveedoresUnicos.add(provId);
    if (clave === semanaActual) for (const g of porProv.values()) nItemsEstaSemana += g.nItems;
  }

  setTxt('consd_k_semanas', porSemana.size);
  setTxt('consd_k_proveedores', proveedoresUnicos.size);
  setTxt('consd_k_items', ITEMS.length);
  setTxt('consd_k_semanaactual', nItemsEstaSemana);

  renderEvolucionSemanal('consd_evol_wrap', porSemana);
  renderRankingProveedores('consd_ranking_wrap', porSemana);
}

// ------------------------------------------------------------
// Por semana — tabla expandible (mismo patrón .oc-row/.oc-detail que
// OC/Stock/Proveedores/Notas de Pedido).
// ------------------------------------------------------------
function renderSemanas() {
  const tbody = document.getElementById('t-consol-semanas');
  if (!tbody) return;
  const porSemana = agruparPorSemana();
  const nombrePorId = new Map(PROVEEDORES.map(p => [p.id, p.nombre]));
  const claves = [...porSemana.keys()].sort().reverse(); // más reciente primero

  if (!claves.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:18px;color:var(--muted)">Sin compras confirmadas todavía</td></tr>';
    return;
  }

  tbody.innerHTML = claves.map(clave => {
    const porProv = porSemana.get(clave);
    const proveedores = [...porProv.entries()].sort((a, b) => (nombrePorId.get(a[0]) || '').localeCompare(nombrePorId.get(b[0]) || '', 'es'));
    const montoTotal = new Map();
    let itemsTotal = 0;
    for (const [, g] of proveedores) {
      itemsTotal += g.nItems;
      for (const [m, v] of g.montoPorMoneda) montoTotal.set(m, (montoTotal.get(m) || 0) + v);
    }
    const detalleFilas = proveedores.map(([provId, g]) => `<tr>
      <td>${escAttr(nombrePorId.get(provId) || '(?)')}</td>
      <td style="text-align:right">${g.nItems}</td>
      <td style="text-align:right">${chipsMonto(g.montoPorMoneda)}</td>
      <td style="text-align:right">${chipsUnidad(g.cantidadPorUnidad)}</td>
    </tr>`).join('');
    return `<tr class="oc-row">
      <td><span class="oc-chevron">▸</span> ${escAttr(labelSemana(clave))}</td>
      <td>${proveedores.length}</td>
      <td style="text-align:right">${itemsTotal}</td>
      <td style="text-align:right">${chipsMonto(montoTotal)}</td>
    </tr>
    <tr class="oc-detail" style="display:none"><td colspan="4">
      <table style="width:100%">
        <thead><tr><th>Proveedor</th><th style="text-align:right">Ítems</th><th style="text-align:right">Monto</th><th style="text-align:right">Cantidad</th></tr></thead>
        <tbody>${detalleFilas}</tbody>
      </table>
    </td></tr>`;
  }).join('');
}

function initExpandCollapse(tbodyId) {
  document.getElementById(tbodyId)?.addEventListener('click', e => {
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

// Exporta TODAS las semanas de una (no solo lo que se está viendo) — una
// sola hoja Semana/Proveedor/$/Monto/Cantidad, mismo criterio que el
// resto de los exports del tablero (SheetJS, sin backend).
function exportarConsolidado() {
  const porSemana = agruparPorSemana();
  const nombrePorId = new Map(PROVEEDORES.map(p => [p.id, p.nombre]));
  const claves = [...porSemana.keys()].sort().reverse();
  if (!claves.length) { toast('No hay compras confirmadas para exportar', 'er'); return; }

  const encabezado = ['Semana', 'Proveedor', '$', 'Monto', 'Cantidad'];
  const filas = [];
  for (const clave of claves) {
    const porProv = porSemana.get(clave);
    const proveedores = [...porProv.entries()].sort((a, b) => (nombrePorId.get(a[0]) || '').localeCompare(nombrePorId.get(b[0]) || '', 'es'));
    for (const [provId, g] of proveedores) {
      const nombre = nombrePorId.get(provId) || '(?)';
      if (!g.montoPorMoneda.size) { filas.push([labelSemana(clave), nombre, '', '', chipsUnidad(g.cantidadPorUnidad)]); continue; }
      for (const [moneda, monto] of g.montoPorMoneda) {
        filas.push([labelSemana(clave), nombre, SIMBOLO(moneda), Math.round(monto * 100) / 100, chipsUnidad(g.cantidadPorUnidad)]);
      }
    }
  }
  const ws = XLSX.utils.aoa_to_sheet([encabezado, ...filas]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Consolidado');
  XLSX.writeFile(wb, `Consolidado_compras_${new Date().toISOString().slice(0, 10)}.xlsx`);
  toast(`✓ Exportado (${filas.length} fila${filas.length === 1 ? '' : 's'})`);
}

// ------------------------------------------------------------
export async function render(secId) {
  await cargarTodo();
  if (secId === 'consol-dash') { renderDashboard(); return; }
  if (secId === 'consol-semanas') { renderSemanas(); return; }
}

export function init() {
  document.getElementById('consd-ir-semanas')?.addEventListener('click', () => document.querySelector('.nav-item[data-sec="consol-semanas"]')?.click());
  document.getElementById('consem_exportar')?.addEventListener('click', exportarConsolidado);
  initExpandCollapse('t-consol-semanas');
}
