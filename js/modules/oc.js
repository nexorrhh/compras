// ============================================================
// Módulo Órdenes de Compra — indicador de compras
// Se alimenta del export de OC de Tango Gestión (.xlsx). No tiene
// relación con Flota — es su propio módulo, independiente.
//
// Cada fila del Excel es una LÍNEA de una orden de compra (una OC
// puede tener varios artículos). Al subir un archivo:
//   1. Se parsea en el navegador con SheetJS (no hace falta backend).
//   2. Se detectan las órdenes de compra presentes en ese archivo.
//   3. Se borran las líneas que ya hubiera cargadas de esas órdenes
//      puntuales (no se toca ninguna otra) y se insertan las nuevas.
// Esto permite tanto subir un archivo por mes (como hoy) como, más
// adelante, un archivo con el año completo re-subido cada semana
// para refrescar cantidades recibidas/pendientes — en los dos casos
// el resultado es el mismo: cada orden queda con el estado que
// figura en el último archivo donde apareció.
// ============================================================
import { SB } from '../supabase-client.js';
import { toast, fmt } from '../utils.js';

let LINEAS = [];

// Montos: en las tarjetas de KPI se abrevia (K/M) para que entre cómodo y se
// lea de un vistazo; en la tabla se muestra completo pero sin decimales (no
// tiene sentido trackear centavos en un indicador de compras). El valor
// completo siempre queda en el atributo title (tooltip al pasar el mouse).
function fmtPesos(n) {
  return '$' + Math.round(Number(n) || 0).toLocaleString('es-AR');
}
function fmtCompacto(n) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1_000_000) return sign + '$' + (abs / 1_000_000).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + 'M';
  if (abs >= 1_000) return sign + '$' + (abs / 1_000).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + 'K';
  return fmtPesos(v);
}

// ------------------------------------------------------------
// Parseo del Excel
// ------------------------------------------------------------
function norm(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
}

function fechaISO(v) {
  if (v instanceof Date && !isNaN(v)) {
    const y = v.getFullYear(), m = String(v.getMonth() + 1).padStart(2, '0'), d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof v === 'string') {
    const s = v.trim();
    const dmy = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    const ymd = s.match(/^\d{4}-\d{2}-\d{2}$/);
    if (ymd) return s;
  }
  return null;
}

const txt = v => { const s = String(v ?? '').trim(); return s || null; };
const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };

function parseWorkbook(arrayBuffer, filename) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, cellDates: true, defval: null });
  if (!rows.length) return [];

  const header = rows[0].map(norm);
  const idx = name => header.indexOf(name);
  const col = {
    fecha: idx('FECHA'), orden: idx('N_ORDEN_C'), compCod: idx('COMPRADOR'), compNom: idx('N_COMPRAD'),
    provCod: idx('COD_PROV'), provNom: idx('NOM_PROV'), artCod: idx('COD_ARTICU'), artDesc: idx('DESC_ART'),
    deposito: idx('DEPOSITO'), pedida: idx('CANT_PED'), recibida: idx('CANT_REC'), pendiente: idx('CANT_PEN'),
    precio: idx('PRECIO_UNI'), importe: idx('IMPORTE'),
  };
  for (const req of ['fecha', 'orden', 'artCod']) {
    if (col[req] === -1) throw new Error(`No se encontró la columna esperada en el archivo (falta "${req}").`);
  }

  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every(c => c === null || c === '')) continue;
    const orden = txt(r[col.orden]);
    const articulo = txt(r[col.artCod]);
    if (!orden || !articulo) continue;
    out.push({
      orden_compra: orden,
      fecha: fechaISO(r[col.fecha]),
      comprador_cod: col.compCod >= 0 ? txt(r[col.compCod]) : null,
      comprador_nombre: col.compNom >= 0 ? txt(r[col.compNom]) : null,
      proveedor_cod: col.provCod >= 0 ? txt(r[col.provCod]) : null,
      proveedor_nombre: col.provNom >= 0 ? txt(r[col.provNom]) : null,
      articulo_cod: articulo,
      articulo_desc: col.artDesc >= 0 ? txt(r[col.artDesc]) : null,
      deposito: col.deposito >= 0 ? txt(r[col.deposito]) : null,
      cant_pedida: col.pedida >= 0 ? num(r[col.pedida]) : 0,
      cant_recibida: col.recibida >= 0 ? num(r[col.recibida]) : 0,
      cant_pendiente: col.pendiente >= 0 ? num(r[col.pendiente]) : 0,
      precio_unitario: col.precio >= 0 ? num(r[col.precio]) : null,
      importe: col.importe >= 0 ? num(r[col.importe]) : null,
      archivo_origen: filename,
    });
  }
  return out;
}

// ------------------------------------------------------------
// Carga (reemplaza solo las órdenes presentes en el archivo)
// ------------------------------------------------------------
async function cargarArchivo(file) {
  let lineas;
  try {
    const buf = await file.arrayBuffer();
    lineas = parseWorkbook(buf, file.name);
  } catch (e) {
    toast('No se pudo leer el archivo: ' + e.message, 'er');
    return;
  }
  if (!lineas.length) { toast('No se encontraron filas válidas en el archivo', 'er'); return; }

  const ordenesArchivo = new Set(lineas.map(l => l.orden_compra));
  const fechas = lineas.map(l => l.fecha).filter(Boolean).sort();
  const fechaMin = fechas[0];
  const fechaMax = fechas[fechas.length - 1];

  // El archivo es "autoridad" sobre su propio rango de fechas: cualquier OC
  // ya cargada con fecha dentro de ese rango que NO aparezca en el archivo
  // nuevo probablemente fue anulada/reemplazada en Tango — se detecta acá
  // (comparando contra lo que ya hay en la base) y se avisa antes de
  // borrarla, en vez de dejarla pisada para siempre (ver CLAUDE.md 5.2).
  let desaparecidas = [];
  if (fechaMin && fechaMax) {
    const { data: existentes, error: errExist } = await SB.from('compras_oc_lineas')
      .select('orden_compra, proveedor_nombre, importe')
      .gte('fecha', fechaMin).lte('fecha', fechaMax);
    if (errExist) { toast(errExist.message, 'er'); return; }
    const mapa = new Map();
    for (const l of (existentes || [])) {
      if (ordenesArchivo.has(l.orden_compra)) continue;
      if (!mapa.has(l.orden_compra)) mapa.set(l.orden_compra, { proveedor: l.proveedor_nombre, importe: 0 });
      mapa.get(l.orden_compra).importe += l.importe || 0;
    }
    desaparecidas = [...mapa.entries()];
  }

  let mensaje = `Se leyeron ${lineas.length} líneas de ${ordenesArchivo.size} órdenes de compra.\n\n` +
    `Esto reemplaza los datos que ya hubiera cargados de esas órdenes puntuales (el resto del historial no se toca).`;
  if (desaparecidas.length) {
    mensaje += `\n\n⚠️ Estas ${desaparecidas.length} OC ya estaban cargadas (con fecha dentro del rango de este archivo) pero ya NO aparecen en el archivo nuevo — probablemente anuladas en Tango. Se van a ELIMINAR del tablero:\n` +
      desaparecidas.map(([orden, info]) => `  • ${(orden || '').trim()} — ${info.proveedor || 'Sin proveedor'} — ${fmtPesos(info.importe)}`).join('\n');
  }
  mensaje += `\n\n¿Continuar?`;

  const ok = confirm(mensaje);
  if (!ok) return;

  const ordenesABorrar = [...ordenesArchivo, ...desaparecidas.map(([orden]) => orden)];
  const { error: delErr } = await SB.from('compras_oc_lineas').delete().in('orden_compra', ordenesABorrar);
  if (delErr) { toast(delErr.message, 'er'); return; }

  const chunkSize = 500;
  for (let i = 0; i < lineas.length; i += chunkSize) {
    const chunk = lineas.slice(i, i + chunkSize);
    const { error } = await SB.from('compras_oc_lineas').insert(chunk);
    if (error) { toast('Error insertando: ' + error.message, 'er'); return; }
  }
  toast(`✓ ${lineas.length} líneas cargadas (${ordenesArchivo.size} órdenes)` + (desaparecidas.length ? `, ${desaparecidas.length} anulada(s) eliminada(s)` : ''));
  render('oc-todas');
}

// ------------------------------------------------------------
// Agrupado por orden — la tabla muestra una fila resumen por OC
// (desplegable) en vez de una fila por línea/artículo, porque así es
// como se piensa el problema ("esta orden ¿llegó o no llegó?"). El
// detalle de artículos con sus cantidades queda adentro, al
// desplegar cada fila.
//
// Estado de una OC (en base a cantidades, no a $ — el estado de una
// orden no depende de cuánto vale, depende de si llegó o no):
//   - PENDIENTE:  ninguna línea tiene nada recibido todavía.
//   - COMPLETADA: ninguna línea tiene nada pendiente (llegó todo).
//   - PARCIAL:    cualquier otra combinación (llegó parte).
// ------------------------------------------------------------
function estadoLinea(l) { return (l.cant_pendiente || 0) > 0.01 ? 'PENDIENTE' : 'RECIBIDO'; }

function agruparPorOrden(lineas) {
  const map = new Map();
  for (const l of lineas) {
    if (!map.has(l.orden_compra)) {
      map.set(l.orden_compra, {
        orden_compra: l.orden_compra, fecha: l.fecha, proveedor_nombre: l.proveedor_nombre, comprador_nombre: l.comprador_nombre,
        importe: 0, recibido: 0, pendiente: 0, algunaRecibida: false, algunaPendiente: false, lineas: [],
      });
    }
    const g = map.get(l.orden_compra);
    g.importe += l.importe || 0;
    g.recibido += (l.cant_recibida || 0) * (l.precio_unitario || 0);
    g.pendiente += (l.cant_pendiente || 0) * (l.precio_unitario || 0);
    if ((l.cant_recibida || 0) > 0.01) g.algunaRecibida = true;
    if ((l.cant_pendiente || 0) > 0.01) g.algunaPendiente = true;
    g.lineas.push(l);
    if (l.fecha && (!g.fecha || l.fecha < g.fecha)) g.fecha = l.fecha;
  }
  return [...map.values()];
}

function estadoOC(g) {
  if (!g.algunaRecibida) return 'PENDIENTE';
  if (!g.algunaPendiente) return 'COMPLETADA';
  return 'PARCIAL';
}
const ESTADO_LABEL = { PENDIENTE: 'Pendiente', PARCIAL: 'Parcial', COMPLETADA: 'Completada' };
const ESTADO_CLASE = { PENDIENTE: 'vencido', PARCIAL: 'porvencer', COMPLETADA: 'vigente' };

// Filtros de proveedor/comprador/mes se repiten en varias sub-vistas
// (Todas, Pendientes, Parciales, Completadas) — mismo comportamiento,
// solo cambia el prefijo de ids según la sección.
function poblarFiltrosPrefijo(prefix) {
  const provSel = document.getElementById(`${prefix}_f_prov`);
  if (provSel) {
    const cur = provSel.value;
    const provs = [...new Set(LINEAS.map(l => l.proveedor_nombre).filter(Boolean))].sort();
    provSel.innerHTML = '<option value="">Todos los proveedores</option>' + provs.map(p => `<option value="${p}">${p}</option>`).join('');
    if (provs.includes(cur)) provSel.value = cur;
  }
  const compSel = document.getElementById(`${prefix}_f_comp`);
  if (compSel) {
    const cur = compSel.value;
    const comps = [...new Set(LINEAS.map(l => l.comprador_nombre).filter(Boolean))].sort();
    compSel.innerHTML = '<option value="">Todos los compradores</option>' + comps.map(c => `<option value="${c}">${c}</option>`).join('');
    if (comps.includes(cur)) compSel.value = cur;
  }
  const mesSel = document.getElementById(`${prefix}_f_mes`);
  if (mesSel) {
    const cur = mesSel.value;
    const nombres = { '01': 'Enero', '02': 'Febrero', '03': 'Marzo', '04': 'Abril', '05': 'Mayo', '06': 'Junio', '07': 'Julio', '08': 'Agosto', '09': 'Septiembre', '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre' };
    const meses = [...new Set(LINEAS.map(l => l.fecha?.slice(0, 7)).filter(Boolean))].sort().reverse();
    mesSel.innerHTML = '<option value="">Todos los meses</option>' + meses.map(m => `<option value="${m}">${nombres[m.slice(5)] || m.slice(5)} ${m.slice(0, 4)}</option>`).join('');
    if (meses.includes(cur)) mesSel.value = cur;
  }
}

function renderKPIs(prefix, grupos, lineas) {
  const totalComprado = lineas.reduce((s, l) => s + (l.importe || 0), 0);
  const totalRecibido = lineas.reduce((s, l) => s + (l.cant_recibida || 0) * (l.precio_unitario || 0), 0);
  const totalPendiente = lineas.reduce((s, l) => s + (l.cant_pendiente || 0) * (l.precio_unitario || 0), 0);
  const pct = totalComprado > 0 ? Math.round((totalRecibido / totalComprado) * 100) : 0;
  const porEstado = { PENDIENTE: 0, PARCIAL: 0, COMPLETADA: 0 };
  grupos.forEach(g => porEstado[estadoOC(g)]++);
  const set = (id, val, full) => { const el = document.getElementById(id); if (!el) return; el.textContent = val; if (full !== undefined) el.title = full; };
  set(`${prefix}_k_comprado`, fmtCompacto(totalComprado), fmtPesos(totalComprado));
  set(`${prefix}_k_recibido`, fmtCompacto(totalRecibido), fmtPesos(totalRecibido));
  set(`${prefix}_k_pendiente`, fmtCompacto(totalPendiente), fmtPesos(totalPendiente));
  set(`${prefix}_k_pct`, pct + '%');
  set(`${prefix}_k_pendientes`, porEstado.PENDIENTE);
  set(`${prefix}_k_parciales`, porEstado.PARCIAL);
  set(`${prefix}_k_completadas`, porEstado.COMPLETADA);
}

// Tabla agrupada por OC: una fila resumen por orden (con totales) que
// al tocarla despliega el detalle de artículos con sus cantidades
// pedida/recibida/pendiente — ahí es donde tiene sentido ver
// cantidades, no en la fila resumen (una OC puede mezclar artículos
// de distinta unidad, no se pueden sumar cantidades entre sí).
function renderTabla(tbodyId, grupos) {
  const tb = document.getElementById(tbodyId);
  if (!tb) return;
  const ordenadas = [...grupos].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  if (!ordenadas.length) { tb.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:18px;color:var(--muted)">Sin órdenes</td></tr>'; return; }
  tb.innerHTML = ordenadas.map(g => {
    const est = estadoOC(g);
    const lineasOrdenadas = [...g.lineas].sort((a, b) => (a.articulo_desc || a.articulo_cod).localeCompare(b.articulo_desc || b.articulo_cod));
    const detalle = lineasOrdenadas.map(l => {
      const estL = estadoLinea(l);
      return `<div class="oc-linea">
        <div class="oc-linea-desc">${l.articulo_desc || l.articulo_cod}</div>
        <div>Pedida: <strong>${l.cant_pedida?.toLocaleString('es-AR') ?? '–'}</strong></div>
        <div>Recibida: <strong>${l.cant_recibida?.toLocaleString('es-AR') ?? '–'}</strong></div>
        <div>Pendiente: <strong>${l.cant_pendiente?.toLocaleString('es-AR') ?? '–'}</strong></div>
        <div>Precio unit.: <strong>${fmtPesos(l.precio_unitario)}</strong></div>
        <div>Importe: <strong>${fmtPesos(l.importe)}</strong></div>
        <div><span class="badge ${estL === 'PENDIENTE' ? 'porvencer' : 'vigente'}">${estL === 'PENDIENTE' ? 'Pendiente' : 'Recibido'}</span></div>
      </div>`;
    }).join('');
    return `<tr class="oc-row">
      <td><span class="oc-chevron">▸</span> ${g.orden_compra}</td>
      <td>${fmt(g.fecha)}</td>
      <td>${g.proveedor_nombre || '–'}</td>
      <td>${g.comprador_nombre || '–'}</td>
      <td>${g.lineas.length}</td>
      <td><span class="badge ${ESTADO_CLASE[est]}">${ESTADO_LABEL[est]}</span></td>
      <td>${fmtPesos(g.importe)}</td>
      <td><button class="bsm d oc-del" title="Eliminar esta OC del tablero (no afecta a Tango)" onclick="window.oc.eliminarOrden('${g.orden_compra}')">🗑️</button></td>
    </tr>
    <tr class="oc-detail" style="display:none"><td colspan="8">${detalle}</td></tr>`;
  }).join('');
}

function initExpandCollapse(tbodyId) {
  document.getElementById(tbodyId)?.addEventListener('click', e => {
    if (e.target.closest('.oc-del')) return;
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

// Borrado manual de una OC completa (todas sus líneas) — para casos
// como una OC cargada por error o anulada/reemplazada en Tango: como
// la carga de archivo solo reemplaza las órdenes presentes en el
// Excel subido, una orden anulada que ya no aparece en los archivos
// nuevos NUNCA se borra sola (no hay nada que la reemplace), queda
// pisada en el tablero para siempre hasta que se borre a mano acá.
async function eliminarOrden(orden) {
  if (!confirm(`¿Eliminar la OC ${orden} de este tablero?\n\nEsto borra sus líneas de este indicador (no afecta nada en Tango). Usalo para OC cargadas por error o anuladas/reemplazadas que ya no deberían figurar.`)) return;
  const { error } = await SB.from('compras_oc_lineas').delete().eq('orden_compra', orden);
  if (error) { toast(error.message, 'er'); return; }
  toast(`✓ OC ${orden} eliminada del tablero`);
  const secId = document.querySelector('.sec.on')?.id?.replace(/^s-/, '');
  if (secId) render(secId);
}

function aplicarFiltrosYRender() {
  const provSel = document.getElementById('oc_f_prov')?.value || '';
  const compSel = document.getElementById('oc_f_comp')?.value || '';
  const mesSel = document.getElementById('oc_f_mes')?.value || '';
  const estSel = document.getElementById('oc_f_est')?.value || '';

  let lineas = LINEAS;
  if (provSel) lineas = lineas.filter(l => l.proveedor_nombre === provSel);
  if (compSel) lineas = lineas.filter(l => l.comprador_nombre === compSel);
  if (mesSel) lineas = lineas.filter(l => l.fecha?.slice(0, 7) === mesSel);

  let grupos = agruparPorOrden(lineas);
  if (estSel) grupos = grupos.filter(g => estadoOC(g) === estSel);
  const ordenesVisibles = new Set(grupos.map(g => g.orden_compra));
  const lineasVisibles = lineas.filter(l => ordenesVisibles.has(l.orden_compra));

  renderKPIs('oc', grupos, lineasVisibles);

  // "Ocultar completadas" solo recorta lo que se ve en la tabla (para
  // no tener que scrollear entre decenas de OC ya cerradas) — no toca
  // los KPIs, que siguen reflejando el total real aunque estén ocultas.
  const ocultarCompletadas = document.getElementById('oc_f_ocultar_completadas')?.checked;
  const gruposTabla = (ocultarCompletadas && estSel !== 'COMPLETADA')
    ? grupos.filter(g => estadoOC(g) !== 'COMPLETADA')
    : grupos;
  renderTabla('t-oc', gruposTabla);
}

// ------------------------------------------------------------
// Gráficos del Dashboard (Chart.js, cargado por CDN en index.html)
// ------------------------------------------------------------
const CHARTS = {};
function renderChart(key, canvasId, config) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === 'undefined') return;
  if (CHARTS[key]) CHARTS[key].destroy();
  CHARTS[key] = new Chart(canvas.getContext('2d'), config);
}

const MESES_CORTO = { '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr', '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic' };

function datosEvolucionMensual(lineas) {
  const map = new Map();
  for (const l of lineas) {
    const mes = l.fecha?.slice(0, 7);
    if (!mes) continue;
    if (!map.has(mes)) map.set(mes, { comprado: 0, recibido: 0 });
    const m = map.get(mes);
    m.comprado += l.importe || 0;
    m.recibido += (l.cant_recibida || 0) * (l.precio_unitario || 0);
  }
  const meses = [...map.keys()].sort();
  return {
    labels: meses.map(m => `${MESES_CORTO[m.slice(5)] || m.slice(5)} ${m.slice(2, 4)}`),
    comprado: meses.map(m => map.get(m).comprado),
    recibido: meses.map(m => map.get(m).recibido),
  };
}

function datosTopProveedoresPendiente(grupos, n = 8) {
  const map = new Map();
  for (const g of grupos) {
    if (g.pendiente <= 0.01) continue;
    const key = g.proveedor_nombre || 'Sin proveedor';
    map.set(key, (map.get(key) || 0) + g.pendiente);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

function datosTopCompradoresVolumen(grupos, n = 8) {
  const map = new Map();
  for (const g of grupos) {
    const key = g.comprador_nombre || 'Sin comprador';
    map.set(key, (map.get(key) || 0) + g.importe);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

function renderGraficosDashboard(grupos) {
  if (typeof Chart === 'undefined') return;
  Chart.defaults.color = '#7c8db5';
  Chart.defaults.borderColor = '#2a3248';
  Chart.defaults.font.family = "'Segoe UI',system-ui,sans-serif";

  const evol = datosEvolucionMensual(LINEAS);
  renderChart('evol', 'ocd_chart_evol', {
    type: 'bar',
    data: {
      labels: evol.labels,
      datasets: [
        { label: 'Comprado', data: evol.comprado, backgroundColor: '#3b82f6', borderRadius: 4 },
        { label: 'Recibido', data: evol.recibido, backgroundColor: '#22c55e', borderRadius: 4 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmtPesos(ctx.raw)}` } } },
      scales: { y: { ticks: { callback: v => fmtCompacto(v) } } },
    },
  });

  const porEstado = { PENDIENTE: 0, PARCIAL: 0, COMPLETADA: 0 };
  grupos.forEach(g => porEstado[estadoOC(g)]++);
  renderChart('estado', 'ocd_chart_estado', {
    type: 'doughnut',
    data: {
      labels: ['Pendientes', 'Parciales', 'Completadas'],
      datasets: [{ data: [porEstado.PENDIENTE, porEstado.PARCIAL, porEstado.COMPLETADA], backgroundColor: ['#ef4444', '#f97316', '#22c55e'], borderColor: '#161b27', borderWidth: 2 }],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } },
  });

  const topProv = datosTopProveedoresPendiente(grupos);
  renderChart('prov', 'ocd_chart_prov', {
    type: 'bar',
    data: { labels: topProv.map(p => p[0]), datasets: [{ label: 'Pendiente', data: topProv.map(p => p[1]), backgroundColor: '#f59e0b', borderRadius: 4 }] },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => fmtPesos(ctx.raw) } } },
      scales: { x: { ticks: { callback: v => fmtCompacto(v) } } },
    },
  });

  const topComp = datosTopCompradoresVolumen(grupos);
  renderChart('comp', 'ocd_chart_comp', {
    type: 'bar',
    data: { labels: topComp.map(c => c[0]), datasets: [{ label: 'Comprado', data: topComp.map(c => c[1]), backgroundColor: '#6366f1', borderRadius: 4 }] },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => fmtPesos(ctx.raw) } } },
      scales: { x: { ticks: { callback: v => fmtCompacto(v) } } },
    },
  });
}

// Dashboard: panorama general (sin filtros) + accesos rápidos a cada
// sub-vista.
function renderDashboard() {
  const grupos = agruparPorOrden(LINEAS);
  renderKPIs('ocd', grupos, LINEAS);
  const porEstado = { PENDIENTE: 0, PARCIAL: 0, COMPLETADA: 0 };
  grupos.forEach(g => porEstado[estadoOC(g)]++);
  const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setTxt('ocd-ir-abiertas', `🕐 Ver abiertas (${porEstado.PENDIENTE + porEstado.PARCIAL})`);
  setTxt('ocd-ir-comp', `✅ Ver completadas (${porEstado.COMPLETADA})`);
  renderGraficosDashboard(grupos);
}

// Abiertas: pendientes + parciales juntas (una orden con algo por
// recibir es "abierta", sin importar si ya llegó una parte o nada) —
// separarlas en dos pantallas distintas no aportaba, según feedback.
function renderAbiertas() {
  poblarFiltrosPrefijo('oca');
  const prov = document.getElementById('oca_f_prov')?.value || '';
  const comp = document.getElementById('oca_f_comp')?.value || '';
  const mes = document.getElementById('oca_f_mes')?.value || '';

  let lineas = LINEAS;
  if (prov) lineas = lineas.filter(l => l.proveedor_nombre === prov);
  if (comp) lineas = lineas.filter(l => l.comprador_nombre === comp);
  if (mes) lineas = lineas.filter(l => l.fecha?.slice(0, 7) === mes);

  const grupos = agruparPorOrden(lineas).filter(g => estadoOC(g) !== 'COMPLETADA');
  const porEstado = { PENDIENTE: 0, PARCIAL: 0 };
  grupos.forEach(g => porEstado[estadoOC(g)]++);
  const importeTotal = grupos.reduce((s, g) => s + g.importe, 0);
  const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setTxt('oca_k_pendientes', porEstado.PENDIENTE);
  setTxt('oca_k_parciales', porEstado.PARCIAL);
  const impEl = document.getElementById('oca_k_importe');
  if (impEl) { impEl.textContent = fmtCompacto(importeTotal); impEl.title = fmtPesos(importeTotal); }

  renderTabla('t-oc-abiertas', grupos);
}

// Completadas: mismo componente (filtros + resumen chico + tabla
// agrupada) que Abiertas, pero con el estado fijo en COMPLETADA.
function renderSeccionEstado(prefix, tbodyId, estadoFijo) {
  poblarFiltrosPrefijo(prefix);
  const prov = document.getElementById(`${prefix}_f_prov`)?.value || '';
  const comp = document.getElementById(`${prefix}_f_comp`)?.value || '';
  const mes = document.getElementById(`${prefix}_f_mes`)?.value || '';

  let lineas = LINEAS;
  if (prov) lineas = lineas.filter(l => l.proveedor_nombre === prov);
  if (comp) lineas = lineas.filter(l => l.comprador_nombre === comp);
  if (mes) lineas = lineas.filter(l => l.fecha?.slice(0, 7) === mes);

  const grupos = agruparPorOrden(lineas).filter(g => estadoOC(g) === estadoFijo);
  const importeTotal = grupos.reduce((s, g) => s + g.importe, 0);
  const cantEl = document.getElementById(`${prefix}_k_cant`);
  if (cantEl) cantEl.textContent = grupos.length;
  const impEl = document.getElementById(`${prefix}_k_importe`);
  if (impEl) { impEl.textContent = fmtCompacto(importeTotal); impEl.title = fmtPesos(importeTotal); }

  renderTabla(tbodyId, grupos);
}

const SECCIONES_ESTADO = [
  { prefix: 'occ', tbodyId: 't-oc-comp', estado: 'COMPLETADA' },
];

const TBODY_POR_SECCION = { 'oc-abiertas': 't-oc-abiertas', 'oc-comp': 't-oc-comp', 'oc-todas': 't-oc' };

export async function render(secId) {
  const tbodyId = TBODY_POR_SECCION[secId];
  if (tbodyId) { const tb = document.getElementById(tbodyId); if (tb) tb.innerHTML = '<tr><td colspan="7" class="loading">Cargando...</td></tr>'; }

  const { data, error } = await SB.from('compras_oc_lineas').select('*').limit(20000);
  if (error) {
    if (tbodyId) { const tb = document.getElementById(tbodyId); if (tb) tb.innerHTML = `<tr><td colspan="7" style="color:var(--red);padding:12px">${error.message}</td></tr>`; }
    return;
  }
  LINEAS = data || [];

  if (secId === 'oc-abiertas') { renderAbiertas(); return; }
  const seccion = SECCIONES_ESTADO.find(s => s.tbodyId === tbodyId);
  if (seccion) { renderSeccionEstado(seccion.prefix, seccion.tbodyId, seccion.estado); return; }
  if (secId === 'oc-todas') { poblarFiltrosPrefijo('oc'); aplicarFiltrosYRender(); return; }
  renderDashboard();
}

export function init() {
  document.getElementById('oc_file')?.addEventListener('change', e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) cargarArchivo(file);
  });
  ['oc_f_prov', 'oc_f_comp', 'oc_f_mes', 'oc_f_est', 'oc_f_ocultar_completadas'].forEach(id => document.getElementById(id)?.addEventListener('change', aplicarFiltrosYRender));
  initExpandCollapse('t-oc');

  ['prov', 'comp', 'mes'].forEach(k => document.getElementById(`oca_f_${k}`)?.addEventListener('change', renderAbiertas));
  initExpandCollapse('t-oc-abiertas');

  SECCIONES_ESTADO.forEach(({ prefix, tbodyId, estado }) => {
    ['prov', 'comp', 'mes'].forEach(k => document.getElementById(`${prefix}_f_${k}`)?.addEventListener('change', () => renderSeccionEstado(prefix, tbodyId, estado)));
    initExpandCollapse(tbodyId);
  });

  document.getElementById('ocd-ir-abiertas')?.addEventListener('click', () => document.querySelector('.nav-item[data-sec="oc-abiertas"]')?.click());
  document.getElementById('ocd-ir-comp')?.addEventListener('click', () => document.querySelector('.nav-item[data-sec="oc-comp"]')?.click());
  document.getElementById('ocd-ir-todas')?.addEventListener('click', () => document.querySelector('.nav-item[data-sec="oc-todas"]')?.click());

  window.oc = { eliminarOrden };
}
