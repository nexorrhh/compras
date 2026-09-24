-- ============================================================
-- Migración incremental — Largo comercial de barra por artículo, para
-- poder ajustar la Cantidad de Cotizaciones a un múltiplo entero de
-- barra antes de pedírselo al proveedor (no se puede comprar media
-- barra). Correr esto en el SQL Editor de Supabase. Ver CLAUDE.md
-- sección 9 y ajustarABarraEntera()/guardarLargoBarra() en
-- js/modules/cotizaciones.js.
-- ============================================================
-- El largo de barra varía según el perfil/diámetro EXACTO, no solo por
-- "tipo" de material (ej. un ángulo chico puede venir en 6m y uno grande
-- en 12m según el catálogo del proveedor) — por eso se guarda por
-- cod_articulo, mismo criterio que compras_articulos_grupo, y lo carga
-- Compras a mano la primera vez que aparece cada artículo.
-- ============================================================

create table compras_articulos_largo_barra (
  cod_articulo text primary key,
  largo_barra numeric not null,
  updated_at timestamptz not null default now()
);
