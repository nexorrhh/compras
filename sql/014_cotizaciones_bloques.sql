-- ============================================================
-- Migración incremental — Bloques en Cotizaciones (ej. Pañol /
-- Despacho, o cualquier otra división que el usuario necesite).
-- Correr esto en el SQL Editor de Supabase.
-- ============================================================
-- Una misma solicitud casi siempre mezcla artículos que en la
-- práctica van a proveedores distintos (ej. lo que confirma Pañol
-- lo cotizan unos proveedores, lo que confirma Despacho otros) —
-- "bloque" es una etiqueta libre que el usuario asigna a mano por
-- artículo, y cada bloque tiene su propia lista de proveedores
-- invitados (no una lista única para toda la solicitud). Ver
-- CLAUDE.md sección 9.
-- ============================================================

alter table compras_cotizaciones_items add column bloque text not null default '';
alter table compras_cotizaciones_proveedores add column bloque text not null default '';

-- El unique(cotizacion_id, proveedor_id) original impediría invitar al
-- mismo proveedor a más de un bloque de la misma solicitud — se
-- reemplaza por uno que incluya bloque. El nombre del constraint
-- original lo puso Postgres solo (y puede venir truncado/hasheado por
-- el límite de 63 caracteres), así que se busca dinámicamente en vez
-- de asumir un nombre fijo.
do $$
declare
  conname text;
begin
  select tc.constraint_name into conname
  from information_schema.table_constraints tc
  where tc.table_name = 'compras_cotizaciones_proveedores' and tc.constraint_type = 'UNIQUE'
  limit 1;
  if conname is not null then
    execute format('alter table compras_cotizaciones_proveedores drop constraint %I', conname);
  end if;
end $$;

alter table compras_cotizaciones_proveedores
  add constraint compras_cot_prov_bloque_unica unique (cotizacion_id, proveedor_id, bloque);
