-- ============================================================
-- Migración incremental — N°/código de cotización en Notas de Pedido
-- Correr esto en el SQL Editor de Supabase.
-- ============================================================
-- Campo opcional para el número o código de cotización que a veces
-- pide el proveedor (referencia DE ELLOS, distinta de nuestro N° de
-- NP y del O.T. interno) — ver CLAUDE.md sección 8.
-- ============================================================

alter table compras_notas_pedido add column cotizacion_ref text;
