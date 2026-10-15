-- ============================================================
-- Migración incremental — Marcar un precio cargado en Cotizaciones como
-- "alternativo" (el proveedor cotizó una medida/spec distinta a la
-- pedida, ej. otro espesor de chapa) sin excluirlo de la comparación.
-- Correr esto en el SQL Editor de Supabase. Ver CLAUDE.md sección 9.2 y
-- toggleAlternativoPrecio() en js/modules/cotizaciones.js.
-- ============================================================
-- Vive en compras_cotizaciones_precios (no en el ítem ni en el
-- proveedor) porque es una propiedad de ESE precio puntual — el mismo
-- proveedor puede cotizar en spec para un artículo y alternativo para
-- otro, y el mismo artículo puede tener un proveedor en spec y otro
-- alternativo. nota_alternativo es un texto libre opcional (ej. "cotizó
-- 3/16 en vez de 1/4") para recordar qué cambió.
-- ============================================================

alter table compras_cotizaciones_precios
  add column if not exists alternativo boolean not null default false,
  add column if not exists nota_alternativo text;
