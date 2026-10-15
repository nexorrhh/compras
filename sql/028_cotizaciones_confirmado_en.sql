-- ============================================================
-- Migración incremental — Fecha real de confirmación de compra, para
-- poder armar un consolidado de compras por semana y por proveedor.
-- Correr esto en el SQL Editor de Supabase. Ver CLAUDE.md sección 14 y
-- confirmarCompraProveedor()/confirmarCompraPendienteProveedor()/
-- deshacerConfirmacion() en js/modules/cotizaciones.js.
-- ============================================================
-- `confirmado` (boolean, ya existía) marca que se decidió comprarle a
-- ese proveedor, pero nunca guardaba CUÁNDO — hacía falta esa fecha para
-- poder agrupar las compras confirmadas por semana en el módulo
-- Consolidado (ver js/modules/consolidado.js).
-- ============================================================

alter table compras_cotizaciones_items
  add column if not exists confirmado_en timestamptz;

-- Backfill para lo que ya estaba confirmado antes de esta migración: no
-- hay forma de saber la fecha real en que se tocó "✅ Confirmar compra"
-- (no se guardaba todavía), así que se aproxima con la fecha de creación
-- de la solicitud (compras_cotizaciones.created_at) — mejor esa
-- aproximación que perder esas compras del consolidado por semana. De
-- acá en más, confirmado_en se completa solo con la fecha real al
-- confirmar (y se borra solo si se deshace la confirmación).
update compras_cotizaciones_items ci
set confirmado_en = c.created_at
from compras_cotizaciones c
where ci.cotizacion_id = c.id
  and ci.confirmado = true
  and ci.confirmado_en is null;
