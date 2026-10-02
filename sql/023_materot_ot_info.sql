-- Nombre de proyecto y cliente por OT, para mostrar en Materiales OT
-- (pedido del usuario, 2026-10-02: "podes agregarle el nombre del
-- proyecto y el cliente"). Es una tabla de REFERENCIA aparte de
-- compras_materot_items — no viene en el export de Capataz que arma
-- los ítems, sino de un export distinto de Tango (archivo de ejemplo
-- real: "Significado OT.xlsx", NO va al repo, mismo criterio que
-- MatxPro.xlsx/MatxPronew.xlsx). Foto completa: cada carga reemplaza
-- toda la tabla, igual criterio que compras_materot_items.
--
-- El archivo puede traer más de una fila para el mismo n_ot (distintas
-- versiones/presupuestos a lo largo del tiempo para la misma OT) — el
-- parseo en js/modules/materot.js se queda con la de fecha más reciente
-- antes de insertar, así que acá n_ot es siempre único.
--
-- Ver CLAUDE.md sección 13 para el resto del módulo.
create table if not exists compras_materot_ot_info (
  n_ot text primary key,
  nombre_proyecto text,
  cliente text,
  archivo_origen text,
  created_at timestamptz not null default now()
);

-- Sin RLS, mismo criterio que el resto de compras_* (ver CLAUDE.md sección 11).
