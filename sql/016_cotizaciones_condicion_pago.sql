-- ============================================================
-- Migración incremental — Condición de pago por proveedor invitado en
-- Cotizaciones. Correr esto en el SQL Editor de Supabase.
-- ============================================================
-- El director financiero pidió que el informe de reparto muestre a quién,
-- cuánto, cuándo (condición de pago) y para qué OT se compra — sin esto
-- no había ningún dato de condición de pago en el módulo. Se guarda por
-- proveedor invitado (no por precio ni por ítem), mismo alcance que
-- `bloque`: se fija una vez que se decide comprarle a ese proveedor en
-- ese bloque, no varía ítem por ítem. Texto libre con las mismas opciones
-- fijas que ya usa Notas de Pedido (ver CLAUDE.md sección 8.3), para no
-- inventar una lista nueva. Ver CLAUDE.md sección 9.
-- ============================================================

alter table compras_cotizaciones_proveedores add column condicion_pago text;
