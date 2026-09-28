-- ============================================================
-- Migración incremental — Módulos habilitados por perfil, para el
-- módulo Parametrización (alta de usuarios con acceso restringido a
-- módulos preseleccionados). Correr esto en el SQL Editor de Supabase.
-- Ver CLAUDE.md sección 12 y js/modules/parametrizacion.js.
-- ============================================================
-- `null` (el valor de los perfiles ya existentes, Cimolai/Angulo) sigue
-- significando "sin restricción — ve todos los módulos" (mismo criterio
-- de admin que tenían hasta ahora). Un array (aunque sea de un solo
-- elemento) restringe el nav a esos módulos únicamente. Es una
-- restricción a nivel interfaz (oculta los grupos de nav que no
-- correspondan), NO seguridad real — mismo criterio que el resto del
-- login por PIN (ver sección 11): no hay RLS, cualquiera con la anon
-- key sigue pudiendo leer/escribir todas las tablas compras_* sin pasar
-- por acá.
-- ============================================================

alter table compras_usuarios add column modulos_habilitados jsonb;
