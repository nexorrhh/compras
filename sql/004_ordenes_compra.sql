-- ============================================================
-- Migración incremental — Módulo Órdenes de Compra
-- Correr esto en el SQL Editor de Supabase.
-- ============================================================
-- Alimentado por el export de OC de Tango Gestión (columnas FECHA,
-- N_ORDEN_C, COMPRADOR, N_COMPRAD, COD_PROV, NOM_PROV, COD_ARTICU,
-- DESC_ART, DEPÓSITO, CANT_PED, CANT_REC, CANT_PEN, PRECIO_UNI,
-- IMPORTE). Una fila por línea de OC (una orden puede tener varias
-- líneas/artículos). Se sube el .xlsx tal cual se exporta de Tango,
-- se parsea en el navegador (SheetJS) y se inserta acá.
--
-- Al volver a subir un archivo, se reemplazan solo las líneas de las
-- órdenes que aparecen en ese archivo (no se toca el resto) — así
-- podés subir "Agosto OC.xlsx" de nuevo con las cantidades recibidas
-- actualizadas sin afectar julio, o subir un archivo con varios
-- meses juntos para refrescar todo de una.
-- ============================================================

create table compras_oc_lineas (
  id uuid primary key default gen_random_uuid(),
  orden_compra text not null,
  fecha date not null,
  comprador_cod text,
  comprador_nombre text,
  proveedor_cod text,
  proveedor_nombre text,
  articulo_cod text not null,
  articulo_desc text,
  deposito text,                          -- pañol / despacho, etc. — a futuro para parametrizar
  cant_pedida numeric not null default 0,
  cant_recibida numeric not null default 0,
  cant_pendiente numeric not null default 0,
  precio_unitario numeric,
  importe numeric,
  archivo_origen text,                    -- nombre del archivo desde el que se cargó esta línea
  actualizado_en timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index idx_compras_oc_orden on compras_oc_lineas(orden_compra);
create index idx_compras_oc_fecha on compras_oc_lineas(fecha);
create index idx_compras_oc_proveedor on compras_oc_lineas(proveedor_cod);

-- Sin RLS (mismo criterio que el resto de las tablas compras_*: sin
-- login hoy, protegido solo por no difundir la anon key/URL).
