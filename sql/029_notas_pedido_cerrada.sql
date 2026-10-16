-- ============================================================
-- Migración incremental — Permite cerrar una Nota de Pedido sin que
-- tenga una Orden de Compra vinculada (caso real: se pidió una
-- cotización urgente pero al final no se compró, se canceló, o se
-- resolvió de otra forma, sin pasar por una OC formal). Correr esto en
-- el SQL Editor de Supabase. Ver CLAUDE.md sección 8.2 y
-- cerrarNota()/reabrirNota() en js/modules/notas-pedido.js.
-- ============================================================

alter table compras_notas_pedido drop constraint if exists compras_notas_pedido_estado_check;
alter table compras_notas_pedido add constraint compras_notas_pedido_estado_check
  check (estado in ('PENDIENTE', 'VINCULADA', 'CERRADA'));

alter table compras_notas_pedido
  add column if not exists motivo_cierre text,
  add column if not exists cerrada_en timestamptz;
