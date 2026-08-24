-- ============================================================
-- Migración incremental — Login por PIN
-- Correr esto en el SQL Editor de Supabase.
-- ============================================================
-- No es autenticación real — mismo criterio de seguridad que el resto
-- del tablero (protegido por no compartir el link/anon key, sin RLS).
-- Sirve para saber QUIÉN está usando la sesión en cada carga de
-- página (se pide de nuevo cada vez, no se persiste), principalmente
-- para que las Notas de Pedido registren quién las autorizó (queda en
-- `compras_notas_pedido.revisado_por`, ver sql/007_notas_pedido.sql).
-- El PIN se guarda en texto plano — a la par del resto de los datos
-- de este proyecto, cualquiera con la anon key puede leerlo igual.
--
-- `pin` arranca en null a propósito: un perfil sin PIN todavía muestra
-- "Crear PIN" en el login y la propia persona lo define la primera vez
-- que entra (se lo pide dos veces para evitar typos) — no hace falta
-- que un admin precargue PINs a mano.
-- ============================================================

create table compras_usuarios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  pin text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Los dos usuarios iniciales — sin PIN a propósito: la tarjeta de cada
-- uno va a mostrar "Crear PIN" hasta que esa persona entre por primera
-- vez y lo defina ella misma (se le pide dos veces para confirmar).
insert into compras_usuarios (nombre) values
  ('Cimolai, Pablo Luis'),
  ('Angulo, Valentin Eduardo');

-- Sin RLS (mismo criterio que el resto de las tablas compras_*).
