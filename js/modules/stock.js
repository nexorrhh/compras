// ============================================================
// Módulo Stock — saldos por depósito (Capataz) + lista de
// artículos en seguimiento con stock mínimo. Sin relación con
// Flota ni con Órdenes de Compra — es su propio módulo.
//
// El .xlsx que se sube es una FOTO del stock a la fecha del export
// (una fila por lote/partida, no por artículo — el mismo artículo
// puede tener varias filas en el mismo depósito si hay más de un
// lote con saldo). Como es una foto completa, cada carga REEMPLAZA
// toda la tabla compras_stock_saldos (a diferencia de Órdenes de
// Compra, que reemplaza solo lo que trae cada archivo) — no hace
// falta razonar qué parte tocar, el archivo ya es todo el estado.
//
// El usuario elige a mano qué artículos trackear con un stock
// mínimo (compras_stock_minimos, un mínimo por artículo, no por
// artículo+depósito — se compara contra la suma del saldo del
// artículo). El archivo de Capataz trae ~16 depósitos, pero solo
// importan Principal (01) y Pañol (90) — el resto (contenedores de
// obra, mantenimiento, etc.) se descarta al cargar el archivo, no
// se guarda en la base (decisión del usuario: "tengamos en cuenta
// solo estos, los otros retiralos").
// ============================================================
import { SB } from '../supabase-client.js';
import { toast, om, cm, norm, fechaISO, txt, num } from '../utils.js';

let SALDOS = [];
let MINIMOS = [];
let ARTICULO_ACTUAL = null;

const DEPOSITOS_RELEVANTES = ['01', '90']; // Principal + Pañol — únicos que se importan

// ------------------------------------------------------------
// Parseo del Excel (export de saldos de Capataz)
// ------------------------------------------------------------
function parseWorkbookStock(arrayBuffer, filename) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, cellDates: true, defval: null });
  if (!rows.length) return [];

  const header = rows[0].map(norm);
  const idx = name => header.indexOf(name);
  const col = {
    articulo: idx('COD_ARTICU'), desc: idx('DESCRIPCIO'), descAdic: idx('DESC_ADIC'),
    partida: idx('N_PARTIDA'), despacho: idx('N_DESPACHO'), saldo: idx('SALDO'),
    unidad: idx('UNIDAD_MED'), depCod: idx('COD_DEPOSI'), depNom: idx('NOMBRE_SUC'),
    fecha: idx('FECHA'), fechaVto: idx('FECHA_VTO'),
  };
  for (const req of ['articulo', 'saldo']) {
    if (col[req] === -1) throw new Error(`No se encontró la columna esperada en el archivo (falta "${req}").`);
  }

  const out = [];
  let descartadas = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every(c => c === null || c === '')) continue;
    const articulo = txt(r[col.articulo]);
    if (!articulo) continue;
    const codDeposito = col.depCod >= 0 ? txt(r[col.depCod]) : null;
    if (!DEPOSITOS_RELEVANTES.includes(codDeposito)) { descartadas++; continue; }
    out.push({
      cod_articulo: articulo,
      descripcion: col.desc >= 0 ? txt(r[col.desc]) : null,
      desc_adicional: col.descAdic >= 0 ? txt(r[col.descAdic]) : null,
      n_partida: col.partida >= 0 ? txt(r[col.partida]) : null,
      n_despacho: col.despacho >= 0 ? txt(r[col.despacho]) : null,
      saldo: num(r[col.saldo]),
      unidad_medida: col.unidad >= 0 ? txt(r[col.unidad]) : null,
      cod_deposito: codDeposito,
      nombre_deposito: col.depNom >= 0 ? txt(r[col.depNom]) : null,
      fecha: col.fecha >= 0 ? fechaISO(r[col.fecha]) : null,
      fecha_vto: col.fechaVto >= 0 ? fechaISO(r[col.fechaVto]) : null,
      archivo_origen: filename,
    });
  }
  out.descartadas = descartadas; // filas de otros depósitos, ignoradas a propósito
  return out;
}

// ------------------------------------------------------------
// Carga (reemplazo total — ver nota arriba)
// ------------------------------------------------------------
async function cargarArchivo(file) {
  let filas;
  try {
    const buf = await file.arrayBuffer();
    filas = parseWorkbookStock(buf, file.name);
  } catch (e) {
    toast('No se pudo leer el archivo: ' + e.message, 'er');
    return;
  }
  const descartadas = filas.descartadas || 0;
  if (!filas.length) { toast('No se encontraron filas de Principal/Pañol en el archivo', 'er'); return; }

  const articulos = new Set(filas.map(f => f.cod_articulo)).size;
  const avisoDescartadas = descartadas ? ` (se ignoraron ${descartadas} filas de otros depósitos — solo importan Principal y Pañol)` : '';
  const ok = confirm(
    `Se leyeron ${filas.length} filas de ${articulos} artículos en Principal + Pañol${avisoDescartadas}.\n\n` +
    `Esto REEMPLAZA todo el stock cargado anteriormente (es una foto completa, no un incremental).\n\n¿Continuar?`
  );
  if (!ok) return;

  // Supabase exige un filtro para delete(): esto matchea todas las filas
  // sin excepción (equivalente a un truncate).
  const { error: delErr } = await SB.from('compras_stock_saldos').delete().not('id', 'is', null);
  if (delErr) { toast(delErr.message, 'er'); return; }

  const chunkSize = 500;
  for (let i = 0; i < filas.length; i += chunkSize) {
    const chunk = filas.slice(i, i + chunkSize);
    const { error } = await SB.from('compras_stock_saldos').insert(chunk);
    if (error) { toast('Error insertando: ' + error.message, 'er'); return; }
  }
  toast(`✓ ${filas.length} filas cargadas (${articulos} artículos)`);
  render('stock-todo');
}

// ------------------------------------------------------------
// Agrupado por artículo, sumando saldo entre lotes. `depFiltro` ('' =
// ambos, '01' = Principal, '90' = Pañol) filtra de verdad la lista:
// si se pide Pañol, solo aparecen artículos que tienen algo en Pañol
// y con el saldo de Pañol únicamente (no de Principal) — no es solo
// un recorte del total, es "traeme lo que hay en ese depósito".
// ------------------------------------------------------------
function agruparPorArticulo(depFiltro) {
  const map = new Map();
  for (const s of SALDOS) {
    if (depFiltro && s.cod_deposito !== depFiltro) continue;
    if (!map.has(s.cod_articulo)) {
      map.set(s.cod_articulo, {
        cod_articulo: s.cod_articulo, descripcion: s.descripcion, desc_adicional: s.desc_adicional,
        unidad_medida: s.unidad_medida, saldo: 0, lotes: [],
      });
    }
    const g = map.get(s.cod_articulo);
    g.lotes.push(s);
    g.saldo += s.saldo || 0;
  }
  return [...map.values()];
}

function estadoStock(saldo, minimo) {
  return saldo < minimo ? 'BAJO' : 'OK';
}

function detalleArticulo(a) {
  const porDeposito = new Map();
  for (const l of a.lotes) {
    const key = l.cod_deposito || '–';
    if (!porDeposito.has(key)) porDeposito.set(key, { nombre: l.nombre_deposito, saldo: 0 });
    porDeposito.get(key).saldo += l.saldo || 0;
  }
  const filas = [...porDeposito.entries()].sort((a, b) => b[1].saldo - a[1].saldo);
  return filas.map(([cod, info]) => `<div class="stock-linea">
    <div class="oc-linea-desc">${(info.nombre || cod || '').trim()}</div>
    <div>Saldo: <strong>${info.saldo.toLocaleString('es-AR')} ${a.unidad_medida || ''}</strong></div>
  </div>`).join('');
}

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

// ------------------------------------------------------------
// Todo el stock — listado completo con búsqueda + filtro de
// depósito. Acá vive el botón de carga de archivo.
// ------------------------------------------------------------
function renderTodo() {
  const q = (document.getElementById('sto_f_q')?.value || '').trim().toUpperCase();
  const depFiltro = document.getElementById('sto_f_dep')?.value || '';

  let articulos = agruparPorArticulo(depFiltro);
  if (q) articulos = articulos.filter(a => a.cod_articulo.toUpperCase().includes(q) || (a.descripcion || '').toUpperCase().includes(q));
  articulos.sort((a, b) => a.cod_articulo.localeCompare(b.cod_articulo));

  const minimosMap = new Map(MINIMOS.map(m => [m.cod_articulo, m]));
  const resumen = document.getElementById('sto_resumen');
  if (resumen) resumen.textContent = `${articulos.length} artículo${articulos.length === 1 ? '' : 's'}`;

  const tb = document.getElementById('t-stock-todo');
  if (!tb) return;
  if (!articulos.length) { tb.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:18px;color:var(--muted)">Sin artículos</td></tr>'; return; }

  tb.innerHTML = articulos.map(a => {
    const min = minimosMap.get(a.cod_articulo);
    const badge = !min
      ? `<span class="badge" style="opacity:.5">Sin seguimiento</span>`
      : estadoStock(a.saldo, min.stock_minimo) === 'BAJO'
        ? `<span class="badge vencido">⚠️ Bajo mín. (${min.stock_minimo.toLocaleString('es-AR')})</span>`
        : `<span class="badge vigente">✓ OK (mín. ${min.stock_minimo.toLocaleString('es-AR')})</span>`;
    return `<tr class="oc-row">
      <td><span class="oc-chevron">▸</span> ${a.cod_articulo}</td>
      <td>${a.descripcion || ''}${a.desc_adicional ? ' ' + a.desc_adicional : ''}</td>
      <td>${a.saldo.toLocaleString('es-AR')}</td>
      <td>${a.unidad_medida || '–'}</td>
      <td>${badge}</td>
      <td><button class="bsm sto-accion" onclick="window.stock.abrirSeguimiento('${a.cod_articulo}')">${min ? '✏️ Editar' : '⭐ Agregar'}</button></td>
    </tr>
    <tr class="oc-detail" style="display:none"><td colspan="6">${detalleArticulo(a)}</td></tr>`;
  }).join('');
}

// ------------------------------------------------------------
// Seguimiento / A comprar — comparten el mismo componente: lista
// de artículos marcados con su stock actual vs. mínimo. "A comprar"
// es la misma vista pre-filtrada a los que están bajo el mínimo.
// Factorizado en calcularSeguimiento() para que el render y la
// exportación a Excel usen exactamente la misma lista.
// ------------------------------------------------------------
function calcularSeguimiento(depFiltro, soloBajoMinimo) {
  const articulos = agruparPorArticulo(depFiltro);
  const porCodigo = new Map(articulos.map(a => [a.cod_articulo, a]));

  let filas = MINIMOS.map(m => {
    const a = porCodigo.get(m.cod_articulo);
    const saldo = a ? a.saldo : 0;
    return { min: m, articulo: a, saldoScope: saldo, estado: estadoStock(saldo, m.stock_minimo) };
  });
  if (soloBajoMinimo) filas = filas.filter(f => f.estado === 'BAJO');
  filas.sort((a, b) => (a.estado === b.estado ? 0 : a.estado === 'BAJO' ? -1 : 1) || a.min.cod_articulo.localeCompare(b.min.cod_articulo));
  return filas;
}

function renderSeguimiento(prefix, tbodyId, soloBajoMinimo) {
  const depFiltro = document.getElementById(`${prefix}_f_dep`)?.value || '';
  const filas = calcularSeguimiento(depFiltro, soloBajoMinimo);

  const resumen = document.getElementById(`${prefix}_resumen`);
  if (resumen) {
    const bajo = filas.filter(f => f.estado === 'BAJO').length;
    resumen.textContent = soloBajoMinimo
      ? `${filas.length} artículo${filas.length === 1 ? '' : 's'} para comprar`
      : `${filas.length} en seguimiento — ${bajo} bajo el mínimo`;
  }

  const tb = document.getElementById(tbodyId);
  if (!tb) return;
  if (!filas.length) {
    tb.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:18px;color:var(--muted)">${soloBajoMinimo ? 'Nada por debajo del mínimo 🎉' : 'Todavía no marcaste artículos en seguimiento'}</td></tr>`;
    return;
  }

  tb.innerHTML = filas.map(f => {
    const unidad = f.articulo?.unidad_medida || f.min.unidad_medida || '';
    const noEncontrado = !f.articulo ? ' <span style="color:var(--muted);font-size:11px">(no está en el último archivo)</span>' : '';
    return `<tr>
      <td>${f.min.cod_articulo}${noEncontrado}</td>
      <td>${f.min.descripcion || f.articulo?.descripcion || ''}</td>
      <td>${f.saldoScope.toLocaleString('es-AR')} ${unidad}</td>
      <td>${f.min.stock_minimo.toLocaleString('es-AR')} ${unidad}</td>
      <td><span class="badge ${f.estado === 'BAJO' ? 'vencido' : 'vigente'}">${f.estado === 'BAJO' ? '⚠️ Bajo mínimo' : '✓ OK'}</span></td>
      <td>
        <button class="bsm" onclick="window.stock.abrirSeguimiento('${f.min.cod_articulo}')">✏️</button>
        <button class="bsm d" onclick="window.stock.quitarSeguimiento('${f.min.cod_articulo}')">🗑️</button>
      </td>
    </tr>`;
  }).join('');
}

// ------------------------------------------------------------
// Dashboard
// ------------------------------------------------------------
function renderDashboard() {
  const articulos = agruparPorArticulo(''); // Principal + Pañol combinados
  const porCodigo = new Map(articulos.map(a => [a.cod_articulo, a]));
  let bajoMinimo = 0;
  for (const m of MINIMOS) {
    const a = porCodigo.get(m.cod_articulo);
    if (estadoStock(a ? a.saldo : 0, m.stock_minimo) === 'BAJO') bajoMinimo++;
  }
  const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setTxt('sd_k_articulos', new Set(SALDOS.map(s => s.cod_articulo)).size);
  setTxt('sd_k_depositos', new Set(SALDOS.map(s => s.cod_deposito)).size);
  setTxt('sd_k_seguimiento', MINIMOS.length);
  setTxt('sd_k_bajo', bajoMinimo);
  setTxt('sd-ir-comprar', `⚠️ Ver a comprar (${bajoMinimo})`);
  setTxt('sd-ir-segui', `⭐ Ver seguimiento (${MINIMOS.length})`);
}

// ------------------------------------------------------------
// Modal — agregar/editar artículo en seguimiento
// ------------------------------------------------------------
function abrirSeguimiento(codArticulo) {
  const articulos = agruparPorArticulo(''); // Principal + Pañol combinados
  const a = articulos.find(x => x.cod_articulo === codArticulo);
  const min = MINIMOS.find(m => m.cod_articulo === codArticulo);
  ARTICULO_ACTUAL = {
    cod_articulo: codArticulo,
    descripcion: a?.descripcion || min?.descripcion || '',
    unidad_medida: a?.unidad_medida || min?.unidad_medida || '',
  };
  document.getElementById('sg_codigo').textContent = codArticulo;
  document.getElementById('sg_desc').textContent = ARTICULO_ACTUAL.descripcion || '(sin descripción)';
  document.getElementById('sg_unidad').textContent = ARTICULO_ACTUAL.unidad_medida || '–';
  document.getElementById('sg_saldo_actual').textContent = a ? `${a.saldo.toLocaleString('es-AR')} ${a.unidad_medida || ''} (Principal + Pañol)` : 'No está en el último archivo cargado';
  document.getElementById('sg_minimo').value = min ? min.stock_minimo : '';
  document.getElementById('sg_notas').value = min ? (min.notas || '') : '';
  om('mSEGUI');
}

async function guardarSeguimiento(e) {
  e.preventDefault();
  const minimo = parseFloat(document.getElementById('sg_minimo').value);
  if (!ARTICULO_ACTUAL || isNaN(minimo) || minimo < 0) { toast('Ingresá un stock mínimo válido', 'er'); return; }
  const { error } = await SB.from('compras_stock_minimos').upsert({
    cod_articulo: ARTICULO_ACTUAL.cod_articulo,
    descripcion: ARTICULO_ACTUAL.descripcion,
    unidad_medida: ARTICULO_ACTUAL.unidad_medida,
    stock_minimo: minimo,
    notas: document.getElementById('sg_notas').value.trim() || null,
    actualizado_en: new Date().toISOString(),
  }, { onConflict: 'cod_articulo' });
  if (error) { toast(error.message, 'er'); return; }
  toast('✓ Guardado en seguimiento');
  cm('mSEGUI');
  const secId = document.querySelector('.sec.on')?.id?.replace(/^s-/, '');
  if (secId) render(secId);
}

async function quitarSeguimiento(codArticulo) {
  if (!confirm(`¿Quitar "${codArticulo}" de la lista de seguimiento?\n\nEsto no borra el stock, solo el mínimo configurado.`)) return;
  const { error } = await SB.from('compras_stock_minimos').delete().eq('cod_articulo', codArticulo);
  if (error) { toast(error.message, 'er'); return; }
  toast('Quitado de seguimiento');
  const secId = document.querySelector('.sec.on')?.id?.replace(/^s-/, '');
  if (secId) render(secId);
}

// ------------------------------------------------------------
// Exportar "A comprar" a Excel — mismo criterio (depósito elegido)
// que se está viendo en pantalla, para llevar la lista a un proveedor
// o al circuito de compras sin tener que transcribirla a mano.
// ------------------------------------------------------------
function exportarAComprar() {
  const depFiltro = document.getElementById('stoc_f_dep')?.value || '';
  const filas = calcularSeguimiento(depFiltro, true);
  if (!filas.length) { toast('No hay artículos bajo el mínimo para exportar', 'er'); return; }

  const datos = filas.map(f => {
    const unidad = f.articulo?.unidad_medida || f.min.unidad_medida || '';
    return {
      'Código': f.min.cod_articulo,
      'Descripción': f.min.descripcion || f.articulo?.descripcion || '',
      'Unidad': unidad,
      'Stock actual': f.saldoScope,
      'Mínimo': f.min.stock_minimo,
      'A comprar (aprox.)': Math.max(0, f.min.stock_minimo - f.saldoScope),
    };
  });
  const ws = XLSX.utils.json_to_sheet(datos);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'A comprar');
  const fecha = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `a-comprar_${fecha}.xlsx`);
}

const TBODY_POR_SECCION = { 'stock-comprar': 't-stock-comprar', 'stock-segui': 't-stock-segui', 'stock-todo': 't-stock-todo' };

export async function render(secId) {
  const tbodyId = TBODY_POR_SECCION[secId];
  if (tbodyId) { const tb = document.getElementById(tbodyId); if (tb) tb.innerHTML = '<tr><td colspan="6" class="loading">Cargando...</td></tr>'; }

  const [{ data: saldos, error: e1 }, { data: minimos, error: e2 }] = await Promise.all([
    SB.from('compras_stock_saldos').select('*').limit(20000),
    SB.from('compras_stock_minimos').select('*'),
  ]);
  const error = e1 || e2;
  if (error) {
    if (tbodyId) { const tb = document.getElementById(tbodyId); if (tb) tb.innerHTML = `<tr><td colspan="6" style="color:var(--red);padding:12px">${error.message}</td></tr>`; }
    return;
  }
  SALDOS = saldos || [];
  MINIMOS = minimos || [];

  if (secId === 'stock-comprar') { renderSeguimiento('stoc', 't-stock-comprar', true); return; }
  if (secId === 'stock-segui') { renderSeguimiento('stos', 't-stock-segui', false); return; }
  if (secId === 'stock-todo') { renderTodo(); return; }
  renderDashboard();
}

export function init() {
  document.getElementById('sto_file')?.addEventListener('change', e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) cargarArchivo(file);
  });
  ['sto_f_q', 'sto_f_dep'].forEach(id => document.getElementById(id)?.addEventListener('input', renderTodo));
  initExpandCollapse('t-stock-todo');

  ['stoc_f_dep'].forEach(id => document.getElementById(id)?.addEventListener('change', () => renderSeguimiento('stoc', 't-stock-comprar', true)));
  ['stos_f_dep'].forEach(id => document.getElementById(id)?.addEventListener('change', () => renderSeguimiento('stos', 't-stock-segui', false)));
  document.getElementById('stoc_export')?.addEventListener('click', exportarAComprar);

  document.getElementById('fSEGUI')?.addEventListener('submit', guardarSeguimiento);

  document.getElementById('sd-ir-comprar')?.addEventListener('click', () => document.querySelector('.nav-item[data-sec="stock-comprar"]')?.click());
  document.getElementById('sd-ir-segui')?.addEventListener('click', () => document.querySelector('.nav-item[data-sec="stock-segui"]')?.click());
  document.getElementById('sd-ir-todo')?.addEventListener('click', () => document.querySelector('.nav-item[data-sec="stock-todo"]')?.click());

  window.stock = { abrirSeguimiento, quitarSeguimiento };
}
