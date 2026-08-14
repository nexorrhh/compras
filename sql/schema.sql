-- ============================================================
-- Tablero de Compras — CIMOMET / CO.MO.ING
-- Módulo: FLOTA
-- Esquema Supabase — ver CLAUDE.md sección 4.4
-- ============================================================
-- Este proyecto Supabase es compartido con el sistema de legajos (Nexo
-- RRHH). Todas las tablas de este tablero llevan el prefijo `compras_`
-- para no chocar con las tablas de RRHH (empleados, recibos, etc.).
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- VEHÍCULOS
-- ------------------------------------------------------------
create table compras_vehiculos (
  id uuid primary key default gen_random_uuid(),
  patente text unique not null,
  marca text,
  modelo text,
  anio int,
  tipo text,                          -- Auto, Camioneta, Furgón, Camión, Moto, Otro
  empresa text,                       -- Cimomet S.A. / Co.mo.ing S.R.L.
  area_uso text,
  responsable text,
  estado text not null default 'LIBRE', -- LIBRE, EN USO, MANTENIMIENTO, FUERA DE SERVICIO
  km_actual int default 0,
  activo boolean not null default true,
  observaciones text,
  created_at timestamptz not null default now()
);

comment on column compras_vehiculos.modelo is 'Nombre/modelo visible, ej: Ranger, Sprinter';

-- ------------------------------------------------------------
-- MANTENIMIENTOS (historial)
-- ------------------------------------------------------------
create table compras_mantenimientos (
  id uuid primary key default gen_random_uuid(),
  vehiculo_id uuid not null references compras_vehiculos(id) on delete cascade,
  tipo text,                          -- preventivo / correctivo (o categoría: Service, Frenos, etc.)
  fecha date not null,
  km int,
  taller text,
  costo numeric,
  proximo_fecha date,
  proximo_km int,
  detalle text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- VTV (historial de trámites)
-- ------------------------------------------------------------
create table compras_vtv (
  id uuid primary key default gen_random_uuid(),
  vehiculo_id uuid not null references compras_vehiculos(id) on delete cascade,
  fecha_tramite date,
  resultado text,                     -- apto / condicional / rechazado
  vencimiento date,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- DOCUMENTOS (historial de pólizas de seguro + permisos/habilitaciones)
-- Unificados en una sola tabla: comparten la misma forma (vehículo +
-- vencimiento + archivo adjunto). categoria distingue SEGURO de
-- PERMISO; tipo/organismo solo tienen sentido para PERMISO. En vez de
-- tipear compañía/póliza/cobertura a mano, se sube el frente del
-- documento (PDF o foto) y solo se indica el vencimiento — con eso
-- alcanza para saber si el vehículo puede circular.
-- ------------------------------------------------------------
create table compras_documentos (
  id uuid primary key default gen_random_uuid(),
  vehiculo_id uuid not null references compras_vehiculos(id) on delete cascade,
  categoria text not null check (categoria in ('SEGURO','PERMISO')),
  tipo text,          -- solo PERMISO (ej. "Certificado de Matriculación")
  organismo text,     -- solo PERMISO (ej. "Santa Fe Provincia")
  vencimiento date,
  archivo_url text,   -- URL pública del archivo subido (bucket compras-documentos)
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- SOLICITUDES — circuito de pedido/aprobación de vehículo
-- (no estaba en el borrador original del CLAUDE.md; viene del
-- prototipo solicitud.html + admin.html)
-- ------------------------------------------------------------
create table compras_solicitudes (
  id uuid primary key default gen_random_uuid(),
  solicitante text not null,
  email text,
  sector text not null,
  vehiculo_id uuid references compras_vehiculos(id),
  vehiculo_desc text,
  vehiculo_sugerido text,
  fecha_uso date not null,
  fecha_devolucion date,
  ot text,
  destino text,
  observacion text,
  estado text not null default 'PENDIENTE', -- PENDIENTE, APROBADO, RECHAZADO
  vehiculo_asignado_id uuid references compras_vehiculos(id),
  vehiculo_asignado_desc text,
  motivo_rechazo text,
  aprobado_por text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- MOVIMIENTOS — registro de portería (salidas / retornos)
-- (viene del prototipo porteria.html + admin.html)
-- ------------------------------------------------------------
create table compras_movimientos (
  id uuid primary key default gen_random_uuid(),
  vehiculo_id uuid references compras_vehiculos(id),
  vehiculo_desc text,
  tipo text not null,                 -- SALIDA / RETORNO
  fecha_hora timestamptz not null,
  conductor text,
  registrado_por text,
  km int,
  observacion text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- OC LÍNEAS — importadas del export de OC de Tango Gestión (ver
-- sql/004_ordenes_compra.sql para el detalle del criterio de carga).
-- No tiene relación con las tablas de Flota — es el módulo
-- "Órdenes de Compra" (indicador de compras), independiente.
-- ------------------------------------------------------------
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
  deposito text,
  cant_pedida numeric not null default 0,
  cant_recibida numeric not null default 0,
  cant_pendiente numeric not null default 0,
  precio_unitario numeric,
  importe numeric,
  archivo_origen text,
  actualizado_en timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- ÍNDICES
-- ------------------------------------------------------------
create index idx_compras_mantenimientos_vehiculo on compras_mantenimientos(vehiculo_id);
create index idx_compras_vtv_vehiculo on compras_vtv(vehiculo_id);
create index idx_compras_documentos_vehiculo on compras_documentos(vehiculo_id);
create index idx_compras_documentos_categoria on compras_documentos(categoria);
create index idx_compras_solicitudes_estado on compras_solicitudes(estado);
create index idx_compras_solicitudes_fecha_uso on compras_solicitudes(fecha_uso);
create index idx_compras_movimientos_vehiculo on compras_movimientos(vehiculo_id);
create index idx_compras_movimientos_fecha on compras_movimientos(fecha_hora);
create index idx_compras_oc_orden on compras_oc_lineas(orden_compra);
create index idx_compras_oc_fecha on compras_oc_lineas(fecha);
create index idx_compras_oc_proveedor on compras_oc_lineas(proveedor_cod);

-- ------------------------------------------------------------
-- VISTAS — "último vencimiento vigente" por vehículo
-- Los vencimientos viven en tablas de historial (compras_vtv,
-- compras_documentos), estas vistas resuelven el registro más
-- reciente de cada una para mostrar semáforos y alertas sin tener
-- que repetir la lógica en cada módulo JS.
-- ------------------------------------------------------------
create view compras_vw_vtv_actual as
select distinct on (vehiculo_id)
  vehiculo_id, fecha_tramite, resultado, vencimiento
from compras_vtv
order by vehiculo_id, fecha_tramite desc nulls last;

-- "Vigente" por vehículo + categoría (SEGURO / PERMISO por separado,
-- un vehículo puede tener uno de cada).
create view compras_vw_documento_actual as
select distinct on (vehiculo_id, categoria)
  vehiculo_id, categoria, tipo, organismo, vencimiento, archivo_url
from compras_documentos
order by vehiculo_id, categoria, vencimiento desc nulls last;

-- Vista combinada usada por el dashboard de Flota para el semáforo
-- de vencimientos (VTV / seguro) por vehículo.
create view compras_vw_vehiculos_vencimientos as
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

-- ------------------------------------------------------------
-- STORAGE — bucket para el frente de los documentos (pólizas de
-- seguro y permisos/habilitaciones comparten el mismo bucket). Ver
-- módulo Flota/Documentación: se sube el archivo y solo se tipea el
-- vencimiento (+ tipo/organismo si es PERMISO).
-- ------------------------------------------------------------
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

-- ============================================================
-- SEGURIDAD: como este proyecto es compartido con RRHH y hoy no hay
-- RLS en las tablas compras_*, cualquiera con la anon key (que va
-- hardcodeada en index.html / porteria.html / solicitud.html) puede
-- leer/escribir estas tablas. Evaluar RLS antes de repartir los
-- links de porteria.html / solicitud.html fuera del área de Compras.
--
-- NOTA: no tengo certeza de que este sea el mejor diseño para tu
-- caso puntual (ej. si conviene guardar solo el vencimiento vigente
-- en compras_vehiculos en vez de resolverlo por vista). Es un punto
-- de partida razonable — revisar antes de considerarlo definitivo.
-- ============================================================
