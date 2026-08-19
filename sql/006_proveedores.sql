-- ============================================================
-- Migración incremental — Módulo Proveedores
-- Correr esto en el SQL Editor de Supabase.
-- ============================================================
-- Agenda de compras por rubro (grupo). La idea: clasificás ARTÍCULOS
-- por grupo (ej. "PINTURA EPOXI" → grupo Pintura) y el proveedor
-- queda asociado a ese grupo SOLO. La pertenencia proveedor→grupo no
-- se guarda en una tabla — se deriva en el cliente (js/modules/
-- proveedores.js) cruzando compras_oc_lineas.proveedor_cod (vía
-- compras_proveedores.cod_tango) con compras_articulos_grupo, así que
-- clasificar un puñado de artículos alcanza para que la mayoría de
-- los proveedores se agrupen solos, para atrás y para adelante.
-- Para proveedores sin ninguna OC todavía (solo cotizaron), queda
-- grupo_manual_id como respaldo manual.
-- ============================================================

create table compras_grupos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  created_at timestamptz not null default now()
);

-- Clasificación de artículos por grupo — se completa de a poco, no
-- hace falta clasificar todo el catálogo de una. cod_articulo cruza
-- con compras_oc_lineas.articulo_cod y compras_stock_saldos.cod_articulo.
create table compras_articulos_grupo (
  cod_articulo text primary key,
  descripcion text,
  grupo_id uuid not null references compras_grupos(id) on delete cascade,
  actualizado_en timestamptz not null default now()
);

create index idx_compras_articulos_grupo_grupo on compras_articulos_grupo(grupo_id);

-- Catálogo de proveedores (agenda de compras). cod_tango es opcional
-- — es lo que permite cruzar con compras_oc_lineas.proveedor_cod para
-- derivar grupos y ranking de compras automáticamente; sin él, el
-- proveedor solo tiene el grupo_manual_id como clasificación.
create table compras_proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  cod_tango text,
  grupo_manual_id uuid references compras_grupos(id) on delete set null,
  notas text,
  created_at timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index idx_compras_proveedores_cod_tango on compras_proveedores(cod_tango);

-- Vendedores/contactos de cada proveedor — a quién le escribís para pedir cotización.
create table compras_proveedores_contactos (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references compras_proveedores(id) on delete cascade,
  nombre text,
  telefono text,
  email text,
  notas text,
  created_at timestamptz not null default now()
);

create index idx_compras_proveedores_contactos_proveedor on compras_proveedores_contactos(proveedor_id);

-- Sin RLS (mismo criterio que el resto de las tablas compras_*: sin
-- login hoy, protegido solo por no difundir la anon key/URL).
