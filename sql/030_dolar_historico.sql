-- Histórico diario del dólar oficial (Banco Nación) — sirve de referencia
-- para convertir precios en USD/ARS en el resto del tablero (hoy:
-- Materiales OT → Costo, sub-pestaña "💰 Costo" — ver CLAUDE.md sección
-- 13.11). Se carga desde la API pública de ArgentinaDatos
-- (api.argentinadatos.com/v1/cotizaciones/dolares/oficial), sin backend
-- propio — mismo criterio de "sin servidor intermedio" que el resto del
-- tablero. Pedido explícito del usuario, 2026-10-24.
--
-- `fecha` como PK: una fila por día, se hace upsert (nunca se borra nada
-- — el histórico no cambia retroactivamente). `compra`/`venta` tal cual
-- los trae la API, sin recalcular.
create table if not exists compras_dolar_historico (
  fecha date primary key,
  compra numeric,
  venta numeric,
  actualizado_en timestamptz not null default now()
);
