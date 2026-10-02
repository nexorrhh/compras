-- Módulo Materiales OT — seguimiento por OT del export de Capataz
-- "Gestión personalizada de Ventas y Compras" (archivo real de ejemplo:
-- MatxPro.xlsx, NO se sube al repo, mismo criterio que Excels/ y
-- Cotizar.xlsx). Ver CLAUDE.md sección 13 para el detalle completo.
--
-- A diferencia del módulo OT (sección 10, que lee compras_cotizaciones_*),
-- esta es una fuente de datos propia y nueva: el archivo trae, por OT y
-- por artículo, todo el ciclo de vida (cotizado → planificado →
-- solicitado → comprado → asignado de stock → recibido → entregado) más
-- un flag OK/DIF que ya viene calculado por Capataz.
--
-- Es una FOTO COMPLETA del estado (no un incremental) — igual criterio
-- que compras_stock_saldos: cada carga reemplaza toda la tabla
-- compras_materot_items.

create table if not exists compras_materot_items (
  id bigint generated always as identity primary key,
  capataz_id bigint,              -- columna "id" del archivo, solo de referencia
  id_vproy bigint,
  numero text,
  version int,
  estado_proy text,
  t_ot text,
  n_ot text,                      -- tal cual trae Capataz (con ceros a la izquierda)
  cod_articulo text,
  agrupacion text,
  descripcion text,
  desc_adicional text,
  ume text,                       -- unidad nativa de las cantidades de esta fila (MTS, MT2, LTS, UNI, KGS...)
  cant_cotiz numeric,
  cant_plan numeric,
  cant_solic numeric,
  comprado numeric,
  kgs_comprados numeric,          -- kg equivalente de "comprado", ya calculado por Capataz
  cant_asig numeric,
  recibido numeric,
  entregado numeric,
  estado text,                    -- OK / DIF, tal cual lo calcula Capataz — no se recalcula acá
  archivo_origen text,
  created_at timestamptz not null default now()
);

create index if not exists idx_materot_items_n_ot on compras_materot_items (n_ot);
create index if not exists idx_materot_items_cod_articulo on compras_materot_items (cod_articulo);

-- Agrupación manual de "OT adicionales" bajo su OT madre — el usuario
-- confirmó que no hay ningún patrón en el número que permita inferir esto
-- solo (OT correlativas simples, sin sufijo/letra) — es una relación que
-- solo él conoce y carga a mano.
create table if not exists compras_materot_ot_grupos (
  n_ot_hija text primary key,
  n_ot_madre text not null,
  created_at timestamptz not null default now()
);

-- Factor kg-por-unidad por artículo, para poder ver en KGS las cantidades
-- que el archivo trae en metros/m²/litros/unidades (el archivo solo trae
-- el kg equivalente de "comprado" — KgsComprados). Mismo criterio que
-- compras_articulos_largo_barra (sección 9.1): no hay una tabla universal
-- confiable para esto, se carga una vez por artículo (aprendida de datos
-- reales o corregida a mano) y el sistema la recuerda de ahí en más.
create table if not exists compras_articulos_kg_equivalencia (
  cod_articulo text primary key,
  ume text,                       -- unidad a la que aplica este factor (MTS, MT2, LTS, UNI)
  kg_por_unidad numeric not null,
  fuente text not null default 'manual', -- 'manual' | 'aprendido'
  updated_at timestamptz not null default now()
);

-- Sin RLS, mismo criterio que el resto de compras_* (ver CLAUDE.md sección 11).
