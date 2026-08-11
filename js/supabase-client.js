// ============================================================
// Conexión a Supabase — credenciales fijas, sin pantalla de config.
// Proyecto compartido con el sistema de legajos (Nexo RRHH); todas
// las tablas de este tablero usan el prefijo compras_ (ver sql/schema.sql).
// La anon key es pública por diseño (va en el front, se protege con
// RLS del lado de Supabase), por eso no hay problema en hardcodearla.
// ============================================================

const SUPABASE_URL = 'https://bmueojeeexheprteavay.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJtdWVvamVlZXhoZXBydGVhdmF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MjEyMzQsImV4cCI6MjA5NTk5NzIzNH0.Rh_OGhhnWZwOil1Rp7261QETH9kFgSvylZVJS35e7-o';

export const SB = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });

/**
 * Conecta automáticamente (no hay credenciales que pedir) y muestra #app.
 * Si la conexión falla (ej. tablas todavía no creadas en Supabase), se
 * muestra el error en #app-error en vez de dejar la pantalla en blanco.
 */
export async function initSupabaseConnection(onConnected) {
  const app = document.getElementById('app');
  try {
    const { error } = await SB.from('compras_vehiculos').select('id').limit(1);
    if (error) throw error;
    app.style.display = 'block';
    onConnected(SB);
  } catch (e) {
    document.getElementById('app-error-msg').textContent = e.message;
    document.getElementById('app-error').style.display = 'flex';
  }
}
