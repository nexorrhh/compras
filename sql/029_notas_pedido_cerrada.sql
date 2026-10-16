-- ============================================================
-- Migración incremental — Permite cerrar una Nota de Pedido sin que
-- tenga una Orden de Compra vinculada (caso real: la NP se cumplió
-- igual pero el material entró directo a stock sin pasar por una OC
-- formal — no es solo por cancelación). Correr esto en el SQL Editor
-- de Supabase. Ver CLAUDE.md sección 8.2 y
-- cerrarNota()/reabrirNota() en js/modules/notas-pedido.js.
-- ============================================================

alter table compras_notas_pedido drop constraint if exists compras_notas_pedido_estado_check;
alter table compras_notas_pedido add constraint compras_notas_pedido_estado_check
  check (estado in ('PENDIENTE', 'VINCULADA', 'CERRADA'));

alter table compras_notas_pedido
  add column if not exists tipo_cierre text,
  add column if not exists motivo_cierre text,
  add column if not exists cerrada_en timestamptz;

alter table compras_notas_pedido drop constraint if exists compras_notas_pedido_tipo_cierre_check;
alter table compras_notas_pedido add constraint compras_notas_pedido_tipo_cierre_check
  check (tipo_cierre is null or tipo_cierre in ('CUMPLIDA', 'CANCELADA'));
