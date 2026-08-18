-- ============================================================
-- Migración incremental — Módulo Stock
-- Correr esto en el SQL Editor de Supabase.
-- ============================================================
-- Alimentado por el export de saldos de Capataz (columnas cod_articu,
-- descripcio, desc_adic, n_partida, n_despacho, saldo, unidad_med,
-- cod_deposi, nombre_suc, fecha, fecha_vto). Es una FOTO del stock a
-- la fecha de la exportación, con una fila por lote/partida (el mismo
-- artículo puede tener varias filas en el mismo depósito si hay más
-- de un lote con saldo) — para el stock total de un artículo hay que
-- sumar `saldo` entre todas sus filas.
--
-- A diferencia de Órdenes de Compra (que reemplaza solo lo que trae
-- cada archivo), acá cada carga es un reemplazo TOTAL: se borra toda
-- la tabla y se inserta el archivo nuevo entero, porque el archivo ya
-- es "la foto completa" del stock a esa fecha — no hace falta razonar
-- sobre qué partes tocar.
-- ============================================================

create table compras_stock_saldos (
  id uuid primary key default gen_random_uuid(),
  cod_articulo text not null,
  descripcion text,
  desc_adicional text,
  n_partida text,
  n_despacho text,
  saldo numeric not null default 0,
  unidad_medida text,
  cod_deposito text,
  nombre_deposito text,
  fecha date,
  fecha_vto date,
  archivo_origen text,
  actualizado_en timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index idx_compras_stock_articulo on compras_stock_saldos(cod_articulo);
create index idx_compras_stock_deposito on compras_stock_saldos(cod_deposito);

-- Lista curada a mano: artículos que el usuario decidió trackear con
-- un piso de stock, para saber cuáles hay que reponer. Un mínimo por
-- artículo (no por artículo+depósito) — se compara contra la suma del
-- saldo en los depósitos que se consideren relevantes en cada momento
-- (hoy, por defecto: Principal + Pañol; elegible en la UI).
create table compras_stock_minimos (
  id uuid primary key default gen_random_uuid(),
  cod_articulo text not null unique,
  descripcion text,
  unidad_medida text,
  stock_minimo numeric not null default 0,
  notas text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- Sin RLS (mismo criterio que el resto de las tablas compras_*: sin
-- login hoy, protegido solo por no difundir la anon key/URL).
