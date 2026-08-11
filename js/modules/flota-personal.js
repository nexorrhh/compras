// ============================================================
// Personal habilitado a manejar / solicitar vehículo: mensuales
// activos + quincenales con puesto "Camion". Viene de las tablas
// de legajos (mismo proyecto Supabase, ver rrhh_puestos_config /
// v_empleados_activos) — no hay FK entre ellas, se cruzan por
// desc_puesto en el cliente. Mismo criterio que porteria.html /
// solicitud.html.
// ============================================================
import { SB } from '../supabase-client.js';

export const PERSONAL = [];

export async function loadPersonal() {
  const [{ data: puestos }, { data: empleados }] = await Promise.all([
    SB.from('rrhh_puestos_config').select('desc_puesto,tipo'),
    SB.from('v_empleados_activos').select('legajo,empresa,apellido_y_nombre,desc_puesto'),
  ]);
  const mensuales = new Set((puestos || []).filter(p => p.tipo === 'mensual').map(p => p.desc_puesto));
  const merged = (empleados || [])
    .filter(e => mensuales.has(e.desc_puesto) || e.desc_puesto === 'Camion')
    .sort((a, b) => a.apellido_y_nombre.localeCompare(b.apellido_y_nombre, 'es'));
  PERSONAL.length = 0;
  PERSONAL.push(...merged);
  return PERSONAL;
}
