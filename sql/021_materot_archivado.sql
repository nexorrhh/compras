-- Archivado de OT viejas/cerradas en Materiales OT — pedido del usuario
-- (2026-10-02) para que el Dashboard y la grilla "Por OT" se enfoquen en
-- lo activo, sin mezclar OT ya terminadas con las que siguen en curso.
--
-- Se archiva por OT EFECTIVA (la madre, si tiene adicionales agrupadas —
-- ver compras_materot_ot_grupos): madre + hijas se archivan juntas como
-- una sola unidad, que es como ya se muestran/cuentan en todo el resto
-- del módulo. Al entrar al detalle de una OT archivada, sus propios
-- indicadores se siguen viendo igual que cualquier otra — el archivado
-- solo la saca del Dashboard y, por defecto, de la grilla "Por OT".
--
-- Ver CLAUDE.md sección 13 para el resto del módulo.
create table if not exists compras_materot_ot_archivadas (
  n_ot text primary key,
  archivado_en timestamptz not null default now()
);

-- Sin RLS, mismo criterio que el resto de compras_* (ver CLAUDE.md sección 11).
