// ============================================================
// Utilidades compartidas por todos los módulos del tablero
// ============================================================
import { SB } from './supabase-client.js';

export function toast(msg, type = 'ok') {
  const c = document.getElementById('TC');
  if (!c) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${type === 'ok' ? '✓' : '✗'}</span> ${msg}`;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

export const om = id => document.getElementById(id)?.classList.add('open');
export const cm = id => document.getElementById(id)?.classList.remove('open');

export const fmt = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('es-AR') : '–';
export const fmtDT = d => d ? new Date(d).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–';
export const fmtM = n => (n !== null && n !== undefined && n !== '') ? '$' + Number(n).toLocaleString('es-AR') : '–';
export const today = () => new Date().toISOString().slice(0, 10);
export const nowLocal = () => { const n = new Date(); n.setMinutes(n.getMinutes() - n.getTimezoneOffset()); return n.toISOString().slice(0, 16); };

export function descVehiculo(v) {
  if (!v) return '';
  return v.marca ? `${v.marca} ${v.modelo || ''}`.trim() : (v.modelo || '');
}

// Estado de un vencimiento (fecha ISO) según proximidad. Umbrales: 7 / 15 / 30 días.
export function estadoVencimiento(fechaISO) {
  if (!fechaISO) return { cls: '', label: '–' };
  const dias = Math.floor((new Date(fechaISO + 'T00:00:00') - new Date(today() + 'T00:00:00')) / 86400000);
  if (dias < 0) return { cls: 'vencido', label: `Vencido (${fmt(fechaISO)})` };
  if (dias <= 30) return { cls: 'porvencer', label: `Vence en ${dias}d (${fmt(fechaISO)})` };
  return { cls: 'vigente', label: fmt(fechaISO) };
}

// ------------------------------------------------------------
// Parseo de Excel — compartido por los módulos que importan
// exports de sistemas externos (Órdenes de Compra ← Tango,
// Stock ← Capataz). Header matching case/acento-insensible porque
// cada sistema exporta sus columnas con capitalización distinta.
// ------------------------------------------------------------
export function norm(s) {
  return String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
}

export function fechaISO(v) {
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

export const txt = v => { const s = String(v ?? '').trim(); return s || null; };
export const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };

// Códigos de artículo (bulonería sobre todo) suelen traer comillas
// literales — ej. `BUL5/8"X134A257`, la marca de pulgada. Sin escapar
// esto, un onclick="fn('${cod}')" o un data-cod="${cod}" se corta en
// la comilla y desalinea el resto del HTML generado. escAttr() es
// para atributos comunes (data-*); escJsArg() es para cuando el valor
// va DENTRO de un string JS de un solo entrecomillado dentro de un
// atributo doble-entrecomillado, ej. onclick="fn('${escJsArg(cod)}')".
export function escAttr(s) {
  return String(s ?? '').replace(/"/g, '&quot;');
}
export function escJsArg(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

// ------------------------------------------------------------
// Supabase (PostgREST) devuelve como máximo 1000 filas por request
// sin importar qué `.limit()` se le pida del lado del cliente — un
// `.select('*').limit(20000)` en una tabla con más de 1000 filas se
// trunca en silencio a las primeras 1000 (sin orden garantizado).
// Para traer una tabla completa hay que paginar con `.range()` hasta
// que una página vuelva incompleta. `makeQuery` tiene que devolver
// un query NUEVO cada vez (no se puede reusar un builder ya usado).
// ------------------------------------------------------------
// ------------------------------------------------------------
// Módulos del tablero disponibles para restringir por perfil (ver
// módulo Parametrización, sección 12). El `key` de cada uno coincide
// con el sufijo del id de su <div class="nav-group" id="nav-<key>">
// en index.html — así main.js puede ocultar el grupo entero por perfil
// sin tener que mantener una segunda lista de ids en otro archivo.
// ------------------------------------------------------------
export const MODULOS_APP = [
  { key: 'flota', label: '🚗 Flota' },
  { key: 'oc', label: '🧾 Órdenes de Compra' },
  { key: 'stock', label: '📦 Stock' },
  { key: 'proveedores', label: '🏭 Proveedores' },
  { key: 'np', label: '📝 Notas de Pedido' },
  { key: 'cot', label: '🧮 Cotizaciones' },
  { key: 'ot', label: '🏷️ OT' },
  { key: 'materot', label: '📐 Materiales OT' },
  { key: 'consol', label: '💰 Consolidado' },
  { key: 'param', label: '⚙️ Parametrización' },
];

export async function fetchAll(makeQuery, pageSize = 1000) {
  let all = [];
  let from = 0;
  while (true) {
    const { data, error } = await makeQuery().range(from, from + pageSize - 1);
    if (error) return { data: null, error };
    all = all.concat(data || []);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return { data: all, error: null };
}

// ------------------------------------------------------------
// Dólar oficial — referencia compartida para convertir USD↔ARS en
// cualquier módulo (hoy: Materiales OT → Costo, Cotizaciones). La carga
// MASIVA del histórico completo sigue siendo 100% manual, con aviso
// previo (Parametrización → Dólar histórico, ver CLAUDE.md 12.5/12.6) —
// acá solo se completan los días recientes que falten, uno por uno, con
// el endpoint puntual de ArgentinaDatos (liviano, nada que ver con traer
// la serie entera), para que ningún módulo dependa de que alguien entre
// a tocar un botón para ver un dato fresco. Pedido explícito del
// usuario, 2026-10-24: "que a la hora de cotizar... me traiga el precio
// del dólar... para que se arme sola la comparativa".
// ------------------------------------------------------------
const DOLAR_API_UN_DIA = 'https://api.argentinadatos.com/v1/cotizaciones/dolares/oficial';
let dolarSincronizadoEstaCarga = false; // una sola vez por carga de página, sin importar cuántos módulos lo pidan

function sumarDiasISO(fechaISO, n) {
  const d = new Date(fechaISO + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

async function fetchDolarDeUnDia(fechaISO) {
  const [y, m, d] = fechaISO.split('-');
  const r = await fetch(`${DOLAR_API_UN_DIA}/${y}/${m}/${d}`);
  if (r.status === 404) return null; // sin cotización ese día (feriado/fin de semana/todavía sin publicar)
  if (!r.ok) throw new Error(`ArgentinaDatos respondió ${r.status}`);
  return r.json();
}

async function sincronizarDolarDiasFaltantes() {
  const { data } = await SB.from('compras_dolar_historico').select('fecha').order('fecha', { ascending: false }).limit(1);
  const ultima = data?.[0]?.fecha;
  if (!ultima) return; // tabla vacía todavía — la carga inicial sigue siendo manual, con aviso (ver 12.5)
  const hoy = today();
  const filas = [];
  let cursor = sumarDiasISO(ultima, 1);
  let tope = 0;
  while (cursor <= hoy && tope < 10) { // tope de seguridad — nunca debería hacer falta tanto si se usa seguido
    const fila = await fetchDolarDeUnDia(cursor).catch(() => null);
    if (fila) filas.push(fila);
    cursor = sumarDiasISO(cursor, 1);
    tope++;
  }
  if (filas.length) {
    await SB.from('compras_dolar_historico').upsert(filas.map(f => ({ fecha: f.fecha, compra: f.compra, venta: f.venta })), { onConflict: 'fecha' });
  }
}

// Última cotización del dólar oficial disponible ({fecha, compra, venta}
// o null si todavía no hay nada cargado) — se completa sola (una vez por
// carga de página) con los días recientes que falten antes de devolver
// el valor. Si la sincronización falla (sin internet, API caída), se
// sigue con lo que ya hubiera en la tabla, sin romper nada.
export async function obtenerDolarReferencia() {
  if (!dolarSincronizadoEstaCarga) {
    dolarSincronizadoEstaCarga = true;
    await sincronizarDolarDiasFaltantes().catch(() => {});
  }
  const { data, error } = await SB.from('compras_dolar_historico').select('fecha,compra,venta').order('fecha', { ascending: false }).limit(1);
  if (error || !data?.length) return null;
  return data[0];
}
