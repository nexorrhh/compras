// ============================================================
// Módulo Parametrización — alta de perfiles con acceso restringido a
// módulos preseleccionados (pedido del usuario, 2026-09-28: "necesitaria
// agregar perfiles pero que no tengan acceso a todos los módulos si no
// que a módulos preseleccionados"). Reusa el mismo circuito de PIN que
// ya existía (ver js/login.js, sql/008_usuarios.sql): un perfil se crea
// SIN PIN y la propia persona lo define en su primer ingreso — acá solo
// se agrega, además del nombre, la lista de módulos que puede ver.
//
// Es una restricción a nivel INTERFAZ (oculta grupos de nav en
// js/main.js), no seguridad real — mismo criterio que el resto del
// login por PIN: no hay RLS, cualquiera con la anon key sigue pudiendo
// leer/escribir todas las tablas compras_* sin pasar por acá. Confirmado
// con el usuario antes de construir esto (ver CLAUDE.md sección 12).
//
// `modulos_habilitados`: `null` = sin restricción (admin, ve todo —
// mismo comportamiento que tenían Cimolai/Angulo antes de que existiera
// esta pantalla, así que no cambia nada para ellos). Un array (aunque
// sea de un solo elemento) restringe a esos módulos únicamente.
// ============================================================
import { SB } from '../supabase-client.js';
import { toast, om, cm, escAttr, MODULOS_APP } from '../utils.js';

let USUARIOS = [];
let EDITANDO_ID = null; // null = alta nueva; si no, solo se editan los módulos (ver abrirModalUsuario)

async function cargarUsuarios() {
  const { data, error } = await SB.from('compras_usuarios').select('*').order('nombre');
  if (error) { toast(error.message, 'er'); return; }
  USUARIOS = data || [];
}

function nombreModulos(modulos) {
  if (modulos == null) return 'Todos (admin)';
  if (!modulos.length) return '— ninguno todavía —';
  return modulos.map(k => MODULOS_APP.find(m => m.key === k)?.label || k).join(', ');
}

function renderTablaUsuarios() {
  const tbody = document.getElementById('t-param-usuarios');
  if (!tbody) return;
  tbody.innerHTML = USUARIOS.map(u => `
    <tr${u.activo ? '' : ' style="opacity:.55"'}>
      <td>${escAttr(u.nombre)}</td>
      <td>${u.pin ? 'Ya creado' : 'Pendiente (lo crea en su primer ingreso)'}</td>
      <td>${escAttr(nombreModulos(u.modulos_habilitados))}</td>
      <td><span class="badge ${u.activo ? 'aprobado' : 'rechazado'}">${u.activo ? 'Activo' : 'Inactivo'}</span></td>
      <td style="white-space:nowrap">
        <button type="button" class="bsm param-editar" data-id="${u.id}">✏️ Módulos</button>
        <button type="button" class="bsm param-toggle-activo" data-id="${u.id}">${u.activo ? '🚫 Desactivar' : '✅ Reactivar'}</button>
      </td>
    </tr>`).join('') || `<tr><td colspan="5" style="text-align:center;padding:18px;color:var(--muted)">Sin perfiles todavía</td></tr>`;
}

function poblarChecksModulos(seleccionados) {
  const cont = document.getElementById('param_modulos_checks');
  if (!cont) return;
  const set = new Set(seleccionados || []);
  cont.innerHTML = MODULOS_APP.map(m => `
    <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
      <input type="checkbox" class="param-modulo-check" value="${m.key}" ${set.has(m.key) ? 'checked' : ''} style="width:auto">
      ${m.label}
    </label>`).join('');
}

function actualizarDisabledModulos() {
  const admin = document.getElementById('param_admin_check')?.checked;
  document.querySelectorAll('.param-modulo-check').forEach(c => { c.disabled = admin; });
}

// Solo se puede EDITAR los módulos de un perfil ya existente, no su
// nombre — cambiar el nombre acá podría desalinearlo del que ya quedó
// guardado como texto libre en otros lados (ej. compras_notas_pedido.
// revisado_por), así que ese campo queda de solo lectura al editar.
function abrirModalUsuario(usuarioId) {
  EDITANDO_ID = usuarioId;
  const u = usuarioId ? USUARIOS.find(x => x.id === usuarioId) : null;
  document.getElementById('mUSUARIO_t').textContent = u ? `Módulos habilitados — ${u.nombre}` : '+ Nuevo perfil';
  const nombreInput = document.getElementById('param_nombre');
  nombreInput.value = u ? u.nombre : '';
  nombreInput.disabled = !!u;
  const adminCheck = document.getElementById('param_admin_check');
  adminCheck.checked = !!(u && u.modulos_habilitados == null);
  poblarChecksModulos(u ? u.modulos_habilitados : []);
  actualizarDisabledModulos();
  om('mUSUARIO');
  if (!u) nombreInput.focus();
}

async function guardarUsuario() {
  const esAdmin = document.getElementById('param_admin_check')?.checked;
  const seleccionados = esAdmin ? null : Array.from(document.querySelectorAll('.param-modulo-check:checked')).map(c => c.value);
  if (!esAdmin && !seleccionados.length) { toast('Elegí al menos un módulo, o marcá "Acceso total"', 'er'); return; }

  if (EDITANDO_ID) {
    const { error } = await SB.from('compras_usuarios').update({ modulos_habilitados: seleccionados }).eq('id', EDITANDO_ID);
    if (error) { toast(error.message, 'er'); return; }
    toast('✓ Módulos actualizados');
  } else {
    const nombre = (document.getElementById('param_nombre')?.value || '').trim();
    if (!nombre) { toast('Ingresá un nombre', 'er'); return; }
    const { error } = await SB.from('compras_usuarios').insert({ nombre, modulos_habilitados: seleccionados });
    if (error) { toast(error.message.includes('duplicate') ? 'Ya existe un perfil con ese nombre' : error.message, 'er'); return; }
    toast(`✓ Perfil creado — ${nombre} crea su PIN solo en el primer ingreso`);
  }
  cm('mUSUARIO');
  await cargarUsuarios();
  renderTablaUsuarios();
}

async function toggleActivo(usuarioId) {
  const u = USUARIOS.find(x => x.id === usuarioId);
  if (!u) return;
  const nuevo = !u.activo;
  if (!nuevo && !confirm(`¿Desactivar a ${u.nombre}? Deja de poder entrar al tablero (no se borra nada de lo que ya cargó).`)) return;
  const { error } = await SB.from('compras_usuarios').update({ activo: nuevo }).eq('id', usuarioId);
  if (error) { toast(error.message, 'er'); return; }
  u.activo = nuevo;
  renderTablaUsuarios();
}

export async function render(secId) {
  if (secId !== 'param-usuarios') return;
  await cargarUsuarios();
  renderTablaUsuarios();
}

export function init() {
  document.getElementById('param_nuevo')?.addEventListener('click', () => abrirModalUsuario(null));
  document.getElementById('param_admin_check')?.addEventListener('change', actualizarDisabledModulos);
  document.getElementById('param_guardar')?.addEventListener('click', guardarUsuario);
  document.getElementById('t-param-usuarios')?.addEventListener('click', e => {
    const editar = e.target.closest('.param-editar');
    if (editar) { abrirModalUsuario(editar.dataset.id); return; }
    const toggle = e.target.closest('.param-toggle-activo');
    if (toggle) { toggleActivo(toggle.dataset.id); return; }
  });
}
