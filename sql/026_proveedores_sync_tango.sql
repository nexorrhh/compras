-- ============================================================
-- Migración incremental — sincronización unificada con Tango
-- Correr después de 025. Es segura tanto si la primera versión de 025
-- ya fue aplicada como si se aplica ahora con el esquema actualizado.
-- ============================================================

alter table compras_proveedores
  add column if not exists telefono_tango text,
  add column if not exists email_tango text;

-- tango_id es la identidad estable usada por el upsert masivo. PostgreSQL
-- permite múltiples NULL en un índice unique, por lo que las fichas que
-- todavía no provienen de Tango siguen siendo válidas.
drop index if exists idx_compras_proveedores_tango_id;
create unique index idx_compras_proveedores_tango_id
  on compras_proveedores(tango_id);

