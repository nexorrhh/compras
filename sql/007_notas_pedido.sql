-- ============================================================
-- Migración incremental — Módulo Notas de Pedido
-- Correr esto en el SQL Editor de Supabase.
-- ============================================================
-- Nota de Pedido: lo que Compras le manda al proveedor para confirmar
-- una cotización cuando hay urgencia (no da tiempo el circuito normal
-- de Orden de Compra) o cuando se contrata un servicio (que después
-- genera una OTT y su OC). Antes se armaba a mano en Word, numerado a
-- mano, sin seguimiento — este módulo numera solo (secuencia real de
-- Postgres, arranca en 8123 siguiendo la numeración real que traían
-- del Word) y arma el PDF para descargar.
--
-- El seguimiento es un vínculo simple con una Orden de Compra: la NP
-- queda PENDIENTE hasta que se la vincula a un N° de OC ya cargado
-- (compras_oc_lineas.orden_compra), momento en el que pasa a
-- VINCULADA. No replica el cálculo pendiente/parcial/completada de
-- OC — eso lo sigue mostrando el módulo de Órdenes de Compra.
-- ============================================================

create sequence compras_np_numero_seq start 8123;

create table compras_notas_pedido (
  id uuid primary key default gen_random_uuid(),
  numero integer not null unique default nextval('compras_np_numero_seq'),
  fecha date not null default current_date,
  proveedor_id uuid references compras_proveedores(id) on delete set null,
  proveedor_nombre text not null,        -- copiado al crear (igual que compras_oc_lineas.proveedor_nombre),
                                          -- así el PDF y el listado no dependen de que el proveedor no se borre
  ot text,                               -- Orden de Trabajo interna, opcional, texto libre
  items jsonb not null default '[]',     -- [{cantidad, unidad, descripcion, precio}] — todo texto libre,
                                          -- el precio en las NP reales mezcla $/U$s/"c/u"/"el kg" sin
                                          -- formato fijo, no tiene sentido forzarlo a numeric
  mas_iva boolean not null default true,
  bonificacion text,
  fecha_entrega text,                    -- libre: "4 dias" / "20/08/26" / "4-20 dias" (así se usa hoy)
  condiciones_pago text,
  lugar_entrega text,
  adjuntos text,
  revisado_por text,
  estado text not null default 'PENDIENTE' check (estado in ('PENDIENTE', 'VINCULADA')),
  orden_compra_vinculada text,           -- número de compras_oc_lineas.orden_compra
  vinculada_en timestamptz,
  created_at timestamptz not null default now()
);

create index idx_compras_np_estado on compras_notas_pedido(estado);
create index idx_compras_np_proveedor on compras_notas_pedido(proveedor_id);

-- Sin RLS (mismo criterio que el resto de las tablas compras_*: sin
-- login hoy, protegido solo por no difundir la anon key/URL).
