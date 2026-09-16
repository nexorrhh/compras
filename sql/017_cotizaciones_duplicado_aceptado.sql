-- ============================================================
-- Migración incremental — Aceptar un artículo duplicado a mano en
-- Cotizaciones. Correr esto en el SQL Editor de Supabase.
-- ============================================================
-- Un ítem que aparece en otra solicitud ABIERTA (ver
-- buscarDuplicadosEntreSolicitudes() en js/modules/cotizaciones.js) se
-- aparta solo a un tab "⚠️ Duplicado" en vez de contar en el bloque
-- real (General/Pañol/Despacho) — pedido del usuario, 2026-09-16, para
-- no cotizarlo/comprarlo dos veces sin darse cuenta. `duplicado_aceptado`
-- es la excepción explícita: el usuario decide que este ítem puntual sí
-- se cotiza/compra también en ESTA solicitud a pesar del duplicado, y
-- desde ese momento vuelve a contar en su bloque real como cualquier
-- otro ítem, para siempre (no se resetea solo si la otra solicitud se
-- cierra después). Ver CLAUDE.md sección 9.
-- ============================================================

alter table compras_cotizaciones_items add column duplicado_aceptado boolean not null default false;
