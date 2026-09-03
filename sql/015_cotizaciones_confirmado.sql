-- ============================================================
-- Migración incremental — Confirmar compra por proveedor en Cotizaciones.
-- Correr esto en el SQL Editor de Supabase.
-- ============================================================
-- Desde la tarjeta de "Resumen por proveedor" se puede confirmar la
-- compra a ese proveedor aunque no haya sido el más barato en algún
-- ítem — los ítems confirmados se ocultan de la tabla comparativa (ya
-- están resueltos) y, cuando no queda ningún ítem a comprar sin
-- confirmar, la solicitud se cierra sola. Ver CLAUDE.md sección 9.
-- ============================================================

alter table compras_cotizaciones_items add column confirmado boolean not null default false;
