// ============================================================
// Utilidades compartidas por todos los módulos del tablero
// ============================================================

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
