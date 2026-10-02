-- Capataz ahora exporta el kg equivalente de CADA etapa (no solo de lo
-- comprado, como traía el archivo original) — columnas nuevas kg_cotiz,
-- kg_plan, kg_solic, kg_asig, kg_recibido, kg_entregado, mismo criterio
-- que ya traía KgsComprados. Esto deja obsoleto el factor kg-por-unidad
-- que se cargaba/corregía a mano por artículo
-- (compras_articulos_kg_equivalencia) — ya no hace falta derivar nada,
-- el archivo trae el kg real de cada fila. Se renombra en vez de
-- borrarse (mismo criterio que compras_seguros_old/compras_permisos_old,
-- ver CLAUDE.md sección 4.4), por si hiciera falta consultarla.
--
-- Ver CLAUDE.md sección 13 para el resto del módulo.

alter table compras_materot_items
  add column if not exists kg_cotiz numeric,
  add column if not exists kg_plan numeric,
  add column if not exists kg_solic numeric,
  add column if not exists kg_asig numeric,
  add column if not exists kg_recibido numeric,
  add column if not exists kg_entregado numeric;

alter table if exists compras_articulos_kg_equivalencia
  rename to compras_articulos_kg_equivalencia_old;
