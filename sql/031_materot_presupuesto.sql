-- Presupuesto en precio (no solo en kg) por OT, para el módulo Materiales
-- OT — pedido explícito del usuario, 2026-10-30: "quiero que sumemos lo
-- presupuestado en precio... la idea sería poder comparar presupuestado
-- vs. comprado/asignado". Hoy el único "presupuesto" que existe en el
-- módulo es `cant_cotiz`/`kg_cotiz` (en kg, viene del export de Capataz) —
-- esto es un monto en dinero, que el usuario tiene en un PDF aparte y por
-- ahora carga a mano (sin importador todavía, ver CLAUDE.md sección 13.13).
--
-- `n_ot` como PK: un presupuesto por OT EFECTIVA (la madre, si tiene
-- adicionales agrupadas — mismo criterio que compras_materot_ot_archivadas,
-- ver sql/021_materot_archivado.sql), así que se guarda/actualiza con
-- `upsert`. `moneda` admite ARS/USD (el PDF puede traer cualquiera de las
-- dos, no se asume una) y `fecha` es la del presupuesto (para poder
-- convertir un monto en ARS al dólar oficial de ESE día, igual criterio
-- que "Costo realizado" — nunca al de hoy, ver CLAUDE.md sección 13.12).
create table if not exists compras_materot_presupuesto (
  n_ot text primary key,
  monto numeric not null,
  moneda text not null default 'ARS' check (moneda in ('ARS', 'USD')),
  fecha date not null default current_date,
  actualizado_en timestamptz not null default now()
);
