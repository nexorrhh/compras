-- ============================================================
-- Migración incremental — datos maestros importados desde Tango API
-- Correr después de 024. Todos los campos son opcionales para conservar
-- compatibilidad con proveedores históricos/manuales.
-- ============================================================

alter table compras_proveedores
  add column if not exists tango_id bigint,
  add column if not exists cuit text,
  add column if not exists nombre_fantasia text,
  add column if not exists domicilio text,
  add column if not exists localidad text,
  add column if not exists codigo_postal text,
  add column if not exists telefono_tango text,
  add column if not exists email_tango text,
  add column if not exists condicion_pago_tango text,
  add column if not exists tango_habilitado boolean,
  add column if not exists sincronizado_tango_en timestamptz;

create unique index if not exists idx_compras_proveedores_tango_id
  on compras_proveedores(tango_id);
