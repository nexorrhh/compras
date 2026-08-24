-- ============================================================
-- Reset de Notas de Pedido — borra todas las NP cargadas hasta ahora
-- (eran todas de prueba mientras se armaba el módulo) y reinicia la
-- numeración para que la próxima NP creada sea la 8122.
-- Correr esto en el SQL Editor de Supabase.
-- ============================================================

delete from compras_notas_pedido;

alter sequence compras_np_numero_seq restart with 8122;
