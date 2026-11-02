-- Presupuesto en precio por OT, para el módulo Materiales OT — pedido
-- explícito del usuario, 2026-10-30: "quiero que sumemos lo presupuestado
-- en precio... la idea sería poder comparar presupuestado vs.
-- comprado/asignado". Primera versión (un monto único por OT, en ARS o
-- USD) se descartó el mismo día: el usuario aclaró que lo que tiene es un
-- precio en USD por ARTÍCULO ("lo que yo quiero es poner por artículo los
-- precios en USD a los que se cotizó, ese dato lo tengo") — ver CLAUDE.md
-- sección 13.13.
--
-- `(n_ot, cod_articulo)` como PK: `n_ot` es siempre la OT EFECTIVA (madre,
-- si tiene adicionales agrupadas — mismo criterio que el archivado, ver
-- sql/021_materot_archivado.sql) — el presupuesto es un documento por
-- obra, no por cada N° de OT hija individual. El precio es siempre
-- U$S por KG (preguntado explícitamente al usuario: el rubro se maneja
-- mayormente por peso, mismo criterio que ya usa "Costo realizado" — ver
-- CLAUDE.md sección 13.9) — se multiplica contra `kg_cotiz` de cada
-- artículo para obtener el total presupuestado de la OT.
create table if not exists compras_materot_presupuesto_precios (
  n_ot text not null,
  cod_articulo text not null,
  precio_usd numeric not null,
  actualizado_en timestamptz not null default now(),
  primary key (n_ot, cod_articulo)
);
