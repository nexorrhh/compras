-- ============================================================
-- Migración incremental — Entrega parcial en Notas de Pedido
-- Correr esto en el SQL Editor de Supabase.
-- ============================================================
-- Campo libre opcional para describir una entrega en partes (ej. "50%
-- en 10 días, resto en 20 días") — sin fechas múltiples ni nada más
-- estructurado por ahora, ver CLAUDE.md sección 8.
-- ============================================================

alter table compras_notas_pedido add column entrega_parcial text;
