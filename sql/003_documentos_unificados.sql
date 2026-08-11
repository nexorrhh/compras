-- ============================================================
-- Migración incremental — Fusión Seguros + Permisos en "Documentos"
-- Correr esto en el SQL Editor de Supabase (después de schema.sql y
-- de 002_seguros_archivo.sql).
-- ============================================================
-- Motivo: Permisos casi no tenía uso (un solo registro cargado) y
-- comparte la misma forma que Seguros (vehículo + vencimiento +
-- archivo adjunto). Se unifican en una sola tabla `compras_documentos`
-- con un campo `categoria` ('SEGURO' | 'PERMISO'). Permisos pasa a
-- funcionar igual que Seguros: se sube el archivo (PDF/foto) y solo
-- se tipea el vencimiento (+ tipo/organismo, que solo aplican a
-- PERMISO). Un solo módulo/nav ("Documentación") reemplaza a los dos
-- anteriores.
-- ============================================================

-- 1) Tabla unificada.
create table if not exists compras_documentos (
  id uuid primary key default gen_random_uuid(),
  vehiculo_id uuid not null references compras_vehiculos(id) on delete cascade,
  categoria text not null check (categoria in ('SEGURO','PERMISO')),
  tipo text,          -- solo PERMISO (ej. "Certificado de Matriculación")
  organismo text,     -- solo PERMISO (ej. "Santa Fe Provincia")
  vencimiento date,
  archivo_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_compras_documentos_vehiculo on compras_documentos(vehiculo_id);
create index if not exists idx_compras_documentos_categoria on compras_documentos(categoria);

-- 2) Migrar los datos que ya existían.
insert into compras_documentos (vehiculo_id, categoria, vencimiento, archivo_url, created_at)
select vehiculo_id, 'SEGURO', vencimiento, archivo_url, created_at
from compras_seguros;

insert into compras_documentos (vehiculo_id, categoria, tipo, organismo, vencimiento, created_at)
select vehiculo_id, 'PERMISO', tipo, organismo, vencimiento, created_at
from compras_permisos;

-- 3) Vista "vigente" por vehículo + categoría (reemplaza a
--    compras_vw_seguro_actual y a la lógica que le faltaba a Permisos).
create or replace view compras_vw_documento_actual as
select distinct on (vehiculo_id, categoria)
  vehiculo_id, categoria, tipo, organismo, vencimiento, archivo_url
from compras_documentos
order by vehiculo_id, categoria, vencimiento desc nulls last;

-- 4) La vista combinada del dashboard ahora lee el seguro desde
--    compras_documentos en vez de compras_seguros (mismas columnas de
--    salida — vtv_vencimiento / seguro_vencimiento — así que el resto
--    del tablero no necesita cambios).
create or replace view compras_vw_vehiculos_vencimientos as
select
  v.id as vehiculo_id,
  v.patente,
  v.estado,
  vtv.vencimiento as vtv_vencimiento,
  seg.vencimiento as seguro_vencimiento
from compras_vehiculos v
left join compras_vw_vtv_actual vtv on vtv.vehiculo_id = v.id
left join compras_vw_documento_actual seg on seg.vehiculo_id = v.id and seg.categoria = 'SEGURO'
where v.activo = true;

-- 5) Retirar las vistas/tablas viejas. Se RENOMBRAN en vez de
--    borrarse (no se pierde nada, solo dejan de estar "en uso").
drop view if exists compras_vw_seguro_actual;
drop view if exists compras_vw_permisos_proximos;
alter table if exists compras_seguros rename to compras_seguros_old;
alter table if exists compras_permisos rename to compras_permisos_old;

-- 6) Bucket de Storage para los archivos de Documentos (Seguro y
--    Permiso comparten el mismo bucket). Los archivos ya subidos con
--    Seguros anteriormente quedan en el bucket viejo `compras-seguros`
--    y sus links siguen funcionando igual — no se tocan.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('compras-documentos', 'compras-documentos', true, 10485760, array['application/pdf','image/png','image/jpeg'])
on conflict (id) do nothing;

drop policy if exists "compras_documentos_select" on storage.objects;
create policy "compras_documentos_select" on storage.objects
  for select using (bucket_id = 'compras-documentos');

drop policy if exists "compras_documentos_insert" on storage.objects;
create policy "compras_documentos_insert" on storage.objects
  for insert with check (bucket_id = 'compras-documentos');

drop policy if exists "compras_documentos_update" on storage.objects;
create policy "compras_documentos_update" on storage.objects
  for update using (bucket_id = 'compras-documentos');

drop policy if exists "compras_documentos_delete" on storage.objects;
create policy "compras_documentos_delete" on storage.objects
  for delete using (bucket_id = 'compras-documentos');
