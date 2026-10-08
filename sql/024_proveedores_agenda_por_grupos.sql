-- ============================================================
-- Migración incremental — Proveedores: agenda manual por grupos
-- Correr en el SQL Editor de Supabase después de 023.
--
-- No se elimina grupo_manual_id ni compras_articulos_grupo: el primero
-- queda como dato legado y el segundo sigue siendo usado por Cotizaciones
-- para filtrar artículos por rubro. La agenda pasa a usar exclusivamente
-- la relación muchos-a-muchos de esta migración.
-- ============================================================

alter table compras_proveedores
  add column if not exists estado text not null default 'ACTIVO'
    check (estado in ('ACTIVO', 'SUSPENDIDO'));

create table if not exists compras_proveedores_grupos (
  proveedor_id uuid not null references compras_proveedores(id) on delete cascade,
  grupo_id uuid not null references compras_grupos(id) on delete cascade,
  estado text not null default 'ACTIVO'
    check (estado in ('PREFERIDO', 'ACTIVO', 'ALTERNATIVO', 'SUSPENDIDO')),
  notas text,
  origen text not null default 'MANUAL'
    check (origen in ('MANUAL', 'MIGRADO')),
  created_at timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  primary key (proveedor_id, grupo_id)
);

create index if not exists idx_compras_proveedores_grupos_grupo
  on compras_proveedores_grupos(grupo_id);

-- Conserva las asignaciones manuales de la versión anterior.
insert into compras_proveedores_grupos (proveedor_id, grupo_id, origen)
select id, grupo_manual_id, 'MIGRADO'
from compras_proveedores
where grupo_manual_id is not null
on conflict (proveedor_id, grupo_id) do nothing;

-- Materializa una sola vez las pertenencias que antes se derivaban de OC.
-- Desde esta migración, nuevas OC no agregan proveedores silenciosamente:
-- la agenda queda bajo control explícito de Compras.
insert into compras_proveedores_grupos (proveedor_id, grupo_id, origen)
select distinct p.id, ag.grupo_id, 'MIGRADO'
from compras_proveedores p
join compras_oc_lineas oc on oc.proveedor_cod = p.cod_tango
join compras_articulos_grupo ag on ag.cod_articulo = oc.articulo_cod
where p.cod_tango is not null
on conflict (proveedor_id, grupo_id) do nothing;

