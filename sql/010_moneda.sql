-- ============================================================
-- Migración incremental — Moneda en Notas de Pedido
-- Correr esto en el SQL Editor de Supabase.
-- ============================================================
-- Para aclarar si los importes de la NP son en pesos o dólares (antes
-- el precio de cada ítem era texto libre y podía incluir "U$s" a
-- mano; ahora que es numérico hace falta este campo aparte) — ver
-- CLAUDE.md sección 8.
-- ============================================================

alter table compras_notas_pedido add column moneda text not null default 'ARS' check (moneda in ('ARS', 'USD'));
