-- ============================================================
-- Migración incremental — Módulo Cotizaciones (solicitudes de
-- cotización). Correr esto en el SQL Editor de Supabase.
-- ============================================================
-- Ver CLAUDE.md para el detalle del flujo: se sube el export de
-- Capataz ("Venta y Compras → Movimientos → Gestión personalizada
-- de ventas y compras"), se marca qué artículos NO hace falta
-- comprar (ya hay stock), se invita a proveedores a cotizar, se
-- cargan precios y se compara — con un resumen por proveedor en
-- las unidades reales (kg/lts/uni) para poder repartir la compra
-- respetando mínimos por proveedor.
-- ============================================================

create table compras_cotizaciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  fecha date not null default current_date,
  estado text not null default 'ABIERTA' check (estado in ('ABIERTA', 'CERRADA')),
  created_at timestamptz not null default now()
);

create table compras_cotizaciones_items (
  id uuid primary key default gen_random_uuid(),
  cotizacion_id uuid not null references compras_cotizaciones(id) on delete cascade,
  nro_solicitud text,
  cod_articulo text not null,
  descripcion text,
  desc_adicional text,
  cant_ums numeric,
  ums text,
  cant_umc numeric,
  umc text,
  t_comp text,
  n_ot text,
  a_comprar boolean not null default true,
  ganador_proveedor_id uuid references compras_proveedores(id) on delete set null,
  ganador_manual boolean not null default false
);

create table compras_cotizaciones_proveedores (
  id uuid primary key default gen_random_uuid(),
  cotizacion_id uuid not null references compras_cotizaciones(id) on delete cascade,
  proveedor_id uuid not null references compras_proveedores(id) on delete cascade,
  unique (cotizacion_id, proveedor_id)
);

create table compras_cotizaciones_precios (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references compras_cotizaciones_items(id) on delete cascade,
  proveedor_id uuid not null references compras_proveedores(id) on delete cascade,
  precio_unitario numeric,
  moneda text not null default 'ARS' check (moneda in ('ARS', 'USD')),
  unique (item_id, proveedor_id)
);

create index idx_compras_cot_items_cotizacion on compras_cotizaciones_items(cotizacion_id);
create index idx_compras_cot_prov_cotizacion on compras_cotizaciones_proveedores(cotizacion_id);
create index idx_compras_cot_precios_item on compras_cotizaciones_precios(item_id);
create index idx_compras_cot_precios_proveedor on compras_cotizaciones_precios(proveedor_id);
