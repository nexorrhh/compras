-- ============================================================
-- Migración incremental — Módulo Flota / Seguros
-- Correr esto en el SQL Editor de Supabase (schema.sql ya se corrió
-- antes; esto solo agrega lo nuevo, no vuelve a crear las tablas).
-- ============================================================
-- Motivo: en vez de tipear compañía/póliza/cobertura a mano, se sube
-- el frente de la póliza (PDF o foto) y solo se indica el vencimiento.
-- Con eso alcanza para saber si el vehículo puede circular — el resto
-- de los datos quedan en el archivo. Cada carga nueva para el mismo
-- vehículo pasa a ser "la vigente" (ver compras_vw_seguro_actual, que
-- ya resuelve el registro más reciente); la anterior no se borra del
-- storage, pero deja de mostrarse en cualquier pantalla.
-- ============================================================

-- 1) Columna para la URL pública del archivo subido.
alter table compras_seguros add column if not exists archivo_url text;

-- 2) Bucket de Storage para los archivos de pólizas.
--    Público de lectura (para poder abrir el link directo desde el
--    tablero) — mismo criterio de seguridad que el resto del proyecto:
--    sin login, protegido solo por no difundir la URL del proyecto.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('compras-seguros', 'compras-seguros', true, 10485760, array['application/pdf','image/png','image/jpeg'])
on conflict (id) do nothing;

-- 3) Policies de storage.objects — sin esto, el anon key no puede
--    subir/leer archivos aunque el bucket sea "público" (el flag
--    public solo evita necesitar URL firmada para leer).
--    drop if exists antes de cada create para poder re-correr este
--    archivo sin que falle por "la policy ya existe".
drop policy if exists "compras_seguros_select" on storage.objects;
create policy "compras_seguros_select" on storage.objects
  for select using (bucket_id = 'compras-seguros');

drop policy if exists "compras_seguros_insert" on storage.objects;
create policy "compras_seguros_insert" on storage.objects
  for insert with check (bucket_id = 'compras-seguros');

drop policy if exists "compras_seguros_update" on storage.objects;
create policy "compras_seguros_update" on storage.objects
  for update using (bucket_id = 'compras-seguros');

drop policy if exists "compras_seguros_delete" on storage.objects;
create policy "compras_seguros_delete" on storage.objects
  for delete using (bucket_id = 'compras-seguros');
