# CLAUDE.md — Tablero de Compras (CIMOMET / CO.MO.ING)

> Documento de contexto para trabajar este proyecto con un asistente de IA (Claude Code, Antigravity, etc.).
> Es un documento **paraguas**: define la estructura general de todo el tablero, pero por ahora solo el
> módulo de **Flota** está desarrollado en detalle. El resto queda como esqueleto para ir completando.

## 0. Cómo usar y personalizar este documento

- Cada módulo de la sección 3 tiene un estado: `[DETALLADO]`, `[ESQUELETO]` o `[TBD]`.
- Cuando definas un módulo nuevo, copiá la estructura del módulo Flota (sección 4) como plantilla:
  entidades → campos → alertas/reglas → vistas → notas.
- No borres las secciones vacías: dejalas como recordatorio de lo que falta decidir.
- Este archivo no reemplaza al `HANDOFF.md` que ya usás en otros proyectos — la idea es mantener la
  misma convención: `CLAUDE.md` para contexto estable del proyecto, `HANDOFF.md` para el estado de la
  sesión actual (qué se hizo, qué falta, próximos pasos inmediatos).

## 1. Contexto del proyecto

- **Organización:** CIMOMET S.A. y CO.MO.ING S.R.L. (empresa metalúrgica industrial, Rosario, Argentina).
- **Responsable del proyecto:** Valentín Angulo, área de Compras y Tecnología.
- **Por qué existe este tablero:** necesidad de un panel de control propio del área de Compras, separado
  del [Tablero de Control Ejecutivo](#) (que muestra un resumen de Flota entre otras cosas, pero a nivel
  directorio). Este tablero es el operativo: donde se carga y gestiona el detalle día a día.
- **Relación con otros proyectos existentes:**
  - *Nexo RRHH* — mismo patrón de stack (HTML/JS + Supabase + GitHub Pages), útil como referencia de
    convenciones si hace falta.
  - *CIMOMET v3 (Producción y Calidad)* — mismo criterio de "construir de cero, no tocar sistemas legados".
  - *Tablero de Control Ejecutivo* — ya tiene planificada una sección "Flota" con datos resumidos. Cuando
    definamos el modelo de datos de Flota acá (sección 4.4), conviene diseñarlo pensando en que ese
    tablero ejecutivo pueda consumir los mismos datos (misma fuente Supabase) en vez de duplicar carga.

## 2. Objetivo general del tablero

Centralizar la visualización y gestión de la información del área de Compras que hoy vive dispersa en
Excel, mails y carpetas sueltas. Punto de partida: **gestión de flota completa** (mantenimiento, VTV,
seguros, permisos). El resto de los módulos se va a ir sumando a medida que se definan.

## 3. Mapa de módulos (alcance general)

| Módulo | Estado | Descripción breve |
|---|---|---|
| **Flota** | `[DETALLADO]` (sección 4) | Vehículos, mantenimiento, VTV, seguros, permisos, combustible |
| Proveedores | `[TBD]` | Catálogo de proveedores, historial de compras, evaluación/calificación |
| **Órdenes de compra** | `[DETALLADO]` (sección 5) | No es alta/gestión de pedidos — es un indicador de compras (pendientes/recibidas/total) alimentado importando el export de OC de Tango Gestión |
| Presupuesto y gastos de compras | `[TBD]` | Presupuestado vs. real por categoría/área, alertas de desvío |
| Stock / insumos críticos | `[TBD]` | Niveles de stock, punto de reposición, insumos que no deben faltar |
| Contratos y vencimientos | `[TBD]` | Contratos de servicios, alquileres, licencias — no solo de vehículos |
| Circuito de aprobaciones | `[TBD]` | Reglas de autorización de pagos/compras según monto |
| Indicadores de compras (KPIs) | `[TBD]` | Tiempo de respuesta a proveedores, ahorro negociado, % compras por proveedor, etc. |

> Nota: esta tabla es un punto de partida razonable dado lo que ya manejás hoy en Compras/Administración
> (circuito de pagos, ARCA, stock, flota con beneficio YPF Ruta). No es una decisión cerrada — sumá,
> sacá o reordená filas libremente.

---

## 4. Módulo: Flota `[DETALLADO]`

### 4.1 Entidades y campos propuestos

**Vehículos**
| Campo | Tipo | Notas |
|---|---|---|
| patente | texto | identificador único |
| marca / modelo | texto | |
| año | número | |
| tipo | enum | auto, camioneta, camión, utilitario, etc. — a definir según tu flota real |
| área / uso asignado | texto | qué sector o persona lo usa |
| responsable | texto | quién lo tiene a cargo |
| estado | enum | activo, en taller, baja, etc. |
| km actual | número | si lo querés trackear |

**Mantenimientos**
| Campo | Tipo | Notas |
|---|---|---|
| vehículo | FK | |
| tipo | enum | preventivo / correctivo |
| fecha | fecha | |
| km al momento | número | |
| taller | texto | |
| costo | número | |
| próximo mantenimiento (fecha o km) | fecha/número | dispara alertas |
| detalle | texto libre | qué se hizo |

**VTV**
| Campo | Tipo | Notas |
|---|---|---|
| vehículo | FK | |
| fecha de trámite | fecha | |
| resultado | enum | apto / condicional / rechazado |
| vencimiento | fecha | dispara alerta |

**Documentos** *(fusión de Seguros + Permisos — ver 4.4)*
| Campo | Tipo | Notas |
|---|---|---|
| vehículo | FK | |
| categoria | enum | SEGURO / PERMISO — un vehículo puede tener uno vigente de cada |
| vencimiento | fecha | dispara alerta; junto con el archivo, es lo único que se tipea a mano |
| archivo_url | texto | URL pública del frente del documento subido (bucket `compras-documentos`) |
| tipo | texto | solo PERMISO — ej. "Certificado de Matriculación", habilitación de carga, etc. |
| organismo emisor | texto | solo PERMISO — ej. "Santa Fe Provincia" |

> Seguros y Permisos empezaron como dos módulos separados; se fusionaron en uno solo
> ("Documentación") porque Permisos casi no tenía uso (un solo registro cargado) y comparte
> exactamente la misma forma que Seguros (vehículo + vencimiento + archivo). Al fusionarlos,
> Permisos ganó el mismo tratamiento que ya tenía Seguros: se sube el archivo y solo se tipea
> el vencimiento, con la misma edición in-place (ver 4.4).

**Combustible** *(a confirmar si se incluye en esta primera etapa)*
| Campo | Tipo | Notas |
|---|---|---|
| vehículo | FK | |
| fecha | fecha | |
| litros / monto | número | |
| km | número | para calcular rendimiento |
| relacionado a: beneficio YPF Ruta | — | ya es un beneficio que administrás; ver si conviene integrarlo o dejarlo aparte |

**Solicitudes** *(no estaba en el borrador original — se sumó al construir el módulo, ver 4.4)*
| Campo | Tipo | Notas |
|---|---|---|
| solicitante / sector / email | texto | quién pide el vehículo |
| vehículo sugerido / asignado | FK | el que pide el personal vs. el que termina asignando Compras |
| fecha de uso / devolución | fecha | |
| ot / destino / observación | texto | |
| estado | enum | PENDIENTE / APROBADO / RECHAZADO |
| motivo_rechazo / aprobado_por | texto | feedback de Compras al solicitante |

> Además de crearse desde `solicitud.html` (personal, queda PENDIENTE), Compras puede crear una
> solicitud directo desde `index.html` → Solicitudes → **+ Nueva solicitud**, a nombre de otra persona
> o de uno mismo. Esa vía asigna vehículo en el mismo paso y queda APROBADA de una (no pasa por
> pendiente, porque quien la crea es quien la aprobaría de todos modos). El campo `solicitante` en
> ambos casos sale del mismo listado de personal habilitado (ver "Personal habilitado" más abajo), no
> es texto libre.

**Movimientos** *(circuito de portería — no estaba en el borrador original, ver 4.4)*
| Campo | Tipo | Notas |
|---|---|---|
| vehículo | FK | |
| tipo | enum | SALIDA / RETORNO |
| fecha_hora | timestamp | |
| conductor / registrado_por | texto | |
| km | número | actualiza `vehiculos.km_actual` |
| observación | texto | las salidas excepcionales (sin autorización previa) se marcan con prefijo `[EXCEPCIÓN]` |

### 4.2 Reglas de alertas y vencimientos

- Alertas por proximidad: sugerido 30 / 15 / 7 días antes de cada vencimiento (VTV, seguro, permisos).
- A definir: ¿las alertas se muestran solo en el tablero o también se envían por mail? (Nexo RRHH ya
  tiene integrado Resend para envío de mails — se podría reutilizar ese mismo servicio acá).
- A definir: ¿quién recibe las alertas? ¿vos únicamente o también el responsable de cada vehículo?

### 4.3 Vistas / pantallas propuestas

1. **Vista general de flota** — tabla o cards con todos los vehículos y semáforo de estado
   (verde = todo al día, amarillo = por vencer, rojo = vencido).
2. **Vista por vehículo** — ficha con historial completo (mantenimientos, VTV, seguro, permisos).
3. **Calendario de vencimientos** — todos los vencimientos próximos en una sola vista.
4. **Dashboard de costos** — gasto total de flota por vehículo, por período, por tipo de gasto.

### 4.4 Modelo de datos — Supabase

**El proyecto Supabase es el mismo que usa el sistema de legajos (Nexo RRHH)** — no uno dedicado a
Compras. Para no chocar con las tablas de RRHH (`empleados`, `recibos`, etc.), **todas las tablas y
vistas de este tablero llevan el prefijo `compras_`**. El esquema completo (con vistas para resolver
"último vencimiento vigente" por vehículo) vive en [`sql/schema.sql`](sql/schema.sql), que refleja el
**estado final** (para una instalación nueva desde cero). Las migraciones incrementales que se fueron
aplicando sobre la base real (en orden) quedan en archivos numerados aparte:
[`sql/002_seguros_archivo.sql`](sql/002_seguros_archivo.sql) →
[`sql/003_documentos_unificados.sql`](sql/003_documentos_unificados.sql). Resumen del esquema actual:

- `compras_vehiculos`, `compras_mantenimientos`, `compras_vtv` — tal como se bosquejaron en esta sección.
- `compras_solicitudes` y `compras_movimientos` — se sumaron al construir el módulo (ver 4.1); vienen
  del circuito pedido → aprobación → portería que ya existía prototipado en `solicitud.html` /
  `porteria.html` / el viejo `admin.html`.
- `compras_documentos` — fusión de lo que originalmente eran dos tablas separadas, `compras_seguros` y
  `compras_permisos` (ver 4.1: Permisos casi no tenía uso y comparte exactamente la misma forma que
  Seguros). Un campo `categoria` (`SEGURO` / `PERMISO`) distingue ambos tipos dentro de la misma tabla;
  `tipo`/`organismo` solo aplican a `PERMISO`. Las tablas viejas se **renombraron** a
  `compras_seguros_old` / `compras_permisos_old` en vez de borrarse (no se pierde nada, solo dejan de
  usarse) — se pueden eliminar del todo más adelante si se confirma que no hacen falta.
- `compras_vtv` y `compras_documentos` quedan como **historial** (una fila por trámite/póliza/permiso)
  en vez de un solo campo de vencimiento en `compras_vehiculos`. Las vistas `compras_vw_vtv_actual`,
  `compras_vw_documento_actual` (por vehículo + categoría) y `compras_vw_vehiculos_vencimientos`
  resuelven el vencimiento vigente de cada vehículo para el dashboard y el semáforo, sin repetir esa
  lógica en cada módulo JS.
- Este esquema **reemplaza** al prototipo original (tablas `fm_vehiculos`, `fm_movimientos`,
  `fm_solicitudes`, `fm_mantenimientos`, todo en un solo campo `descripcion` por vehículo). Como el
  prototipo no tenía datos reales cargados, se migró directo al esquema nuevo.
- El proyecto usado (`bmueojeeexheprteavay.supabase.co`) es el que el usuario indicó como "el de legajos
  Cimomet/Comoing" — **no** es el mismo proyecto multi-tenant de Nexo RRHH (ese tiene un proyecto
  Supabase separado por empresa; ver su propio `CLAUDE.md`). Las tablas `compras_*` de este tablero
  gestionan vehículos de **ambas empresas juntos**, distinguidos por el campo `empresa`, todo en este
  único proyecto.
- **Seguros y Permisos ya no se tipean a mano** (compañía/póliza/cobertura/costo/tipo/organismo, salvo
  tipo/organismo que siguen aplicando a Permiso) — se sube el frente del documento (PDF o foto) y solo
  se indica el vencimiento; `archivo_url` guarda el link público. Los archivos nuevos van al bucket
  `compras-documentos`; los que ya se habían subido con el viejo módulo Seguros quedaron en el bucket
  `compras-seguros` y sus links siguen funcionando igual (no se migraron, no hacía falta). Al cargar un
  documento nuevo para el mismo vehículo + categoría, esa fila pasa a ser la vigente según
  `compras_vw_documento_actual` — el archivo anterior **no se borra del Storage**, simplemente deja de
  mostrarse en el tablero (decisión a propósito, para no borrar archivos automáticamente sin
  confirmación). También se puede **editar** un registro existente para corregir el vencimiento y/o
  reemplazar el archivo sin crear una fila nueva — útil cuando está por vencer y ya se tiene la
  renovación a mano.
- **La tabla del módulo Documentación muestra una fila por vehículo** (no una fila por documento):
  Seguro y Permiso vigentes van uno al lado del otro en la misma fila, con un botón "✏️ Seguro" y
  "✏️ Permiso" cada uno — si el vehículo ya tiene un documento de esa categoría lo edita, si no,
  lo crea (categoría y vehículo quedan fijos en el modal, no se elige a mano). `js/modules/flota-documentos.js`
  arma esto agrupando todas las filas de `compras_documentos` por `vehiculo_id` + `categoria` en el
  cliente (no usa la vista `compras_vw_documento_actual` para esto porque esa vista no expone el `id`
  de la fila, necesario para poder editarla).

> No tengo certeza de que este sea el mejor diseño para tu caso puntual (ej. si conviene guardar el
> vencimiento vigente directo en `compras_vehiculos` en vez de resolverlo por vista) — es un punto de
> partida razonable, revisado antes de crear las tablas reales en Supabase.

**Personal habilitado (quién puede figurar como conductor/solicitante):** se lee de las tablas de
legajos que ya viven en este mismo proyecto — `rrhh_puestos_config` (desc_puesto → tipo mensual/
quincenal) y `v_empleados_activos` (legajo, empresa, apellido_y_nombre, desc_puesto). No hay FK entre
ambas (se relacionan por el texto de `desc_puesto`), así que se cruzan en el cliente. Lista = todo el
personal **mensual** activo + los **quincenales con puesto "Camion"** (choferes). Esta lógica está
duplicada en tres lugares porque cada uno es una página distinta: `js/modules/flota-personal.js`
(usado por `index.html`), y el bloque `cargarPersonal()` dentro de `porteria.html` y `solicitud.html`.
Si el criterio de quién puede manejar cambia, hay que tocar los tres lugares.

---

## 5. Módulo: Órdenes de Compra `[DETALLADO]`

Sin relación con Flota — es su propio módulo, independiente (nav propio, tabla propia). Nació de una
necesidad puntual: tener un indicador de compras (total comprado / recibido / pendiente) sin tener que
cargar nada a mano, aprovechando que el dato ya existe en Tango Gestión.

### 5.1 De dónde viene el dato

Se alimenta del **export de OC de Tango Gestión** (botón de exportar a Excel desde el propio Tango).
Columnas del archivo (nombres tal cual los pone Tango): `FECHA`, `N_ORDEN_C`, `COMPRADOR`, `N_COMPRAD`,
`COD_PROV`, `NOM_PROV`, `COD_ARTICU`, `DESC_ART`, `DEPÓSITO`, `CANT_PED`, `CANT_REC`, `CANT_PEN`,
`PRECIO_UNI`, `IMPORTE`. Cada fila es una **línea** de una orden de compra — una OC puede tener varias
líneas/artículos (se identificó esto con los 3 archivos de ejemplo que pasó el usuario: `Julio OC.xlsx`,
`Agosto OC.xlsx` y `Julio Agosto OC.xlsx`, este último la unión exacta de los otros dos).

- No hay una columna de "línea" estable — el mismo artículo puede aparecer más de una vez dentro de la
  misma orden (ej. dos entregas distintas). Por eso NO se usa `(orden, artículo)` como clave única.
- `IMPORTE` y `CANT_PEN` vienen ya calculados por Tango (con algún redondeo interno) — no se recalculan,
  se guardan tal cual figuran en el archivo.
- El campo `DEPÓSITO` (valores vistos: `90`, `01`) es la referencia a **pañol / despacho** que el
  usuario quiere parametrizar más adelante — hoy se guarda tal cual pero no se usa todavía en la UI.

### 5.2 Cómo se carga (clave del diseño)

No hay backend: el `.xlsx` se parsea **en el navegador** con [SheetJS](https://sheetjs.com/) (CDN, ver
`index.html`) y se sube directo a Supabase desde el cliente (`js/modules/oc.js`).

Al subir un archivo:
1. Se parsea y se detectan las órdenes de compra (`N_ORDEN_C`) presentes en ese archivo.
2. Se calcula el **rango de fechas** que cubre el archivo (mínima y máxima `FECHA` entre sus líneas) y
   se consulta qué OC ya cargadas tienen fecha dentro de ese rango pero **no** están entre las órdenes
   del archivo nuevo — son "desaparecidas": probablemente anuladas/reemplazadas en Tango (ver más abajo).
3. El `confirm()` antes de cargar muestra el resumen de siempre ("se leyeron X líneas de Y órdenes...")
   y, si hay desaparecidas, una lista explícita de cuáles son (orden, proveedor, importe) avisando que
   se van a **eliminar** — para que el usuario las revise antes de aceptar, no es un borrado silencioso.
4. Al confirmar, se **borran** las líneas de las órdenes del archivo *más* las desaparecidas
   (`delete().in('orden_compra', [...])`) y se insertan todas las líneas del archivo nuevo. El resto del
   historial (fuera del rango de fechas de este archivo) no se toca.

Esto permite las dos formas de trabajar que describió el usuario sin ningún caso especial:
- Un archivo por mes (`Julio OC.xlsx`, `Agosto OC.xlsx`) — subir el de agosto nunca toca julio, porque
  sus fechas no se superponen.
- Un archivo acumulado de varios meses re-subido periódicamente (`OC.xlsx`, el que efectivamente usa el
  usuario — cubre 01/07 al 14/08 en 221 filas) para refrescar cantidades recibidas/pendientes: cada vez
  que se sube, las órdenes que ya se recibieron quedan con `pendiente = 0` y se van "cerrando" solas, y
  las que se anularon en Tango (dejaron de aparecer en el export) se detectan y eliminan solas también.

**Por qué hace falta el paso 2 (detección de "desaparecidas"):** el reemplazo es por orden *presente en
el archivo*, así que antes de esto una orden anulada en Tango (se emitió mal, se anuló, se generó una
OC nueva) que dejaba de aparecer en los archivos siguientes nunca se borraba sola — no había nada en el
archivo nuevo que la reemplazara, quedaba pisada para siempre con sus cantidades viejas (caso real:
la OC `0000100008734` de ALAMO INDUSTRIAL SRL, $306,6M, mal cargada y anulada en Tango — comparando
`Julio Agosto OC.xlsx` contra `OC.xlsx` se confirmó que es la única orden que desapareció entre ambos
archivos). Comparar por **rango de fechas** (no asumir "todo lo que no está en el archivo se borra") es
lo que hace seguro este chequeo incluso subiendo archivos parciales: una orden de julio no figura en el
archivo de agosto porque no le corresponde estar, no porque se haya anulado — al estar fuera del rango
de fechas de ese archivo, no se toca.

Además del chequeo automático, cada fila de OC tiene un botón 🗑️ **"Eliminar esta OC del tablero"** (en
Abiertas/Completadas/Todas, `eliminarOrden()` en `js/modules/oc.js`) para borrar una orden a mano en
cualquier otro caso (cargada por error, duplicada, etc.) — no toca Tango, solo el indicador.

### 5.3 Qué muestra el tablero

Igual que Flota, el módulo es un **grupo de nav colapsable** ("🧾 Órdenes de Compra ▾") con un
Dashboard inicial (con gráficos) y sub-vistas de solo lectura, en vez de una sola pantalla:

- **Dashboard** (`oc-dash`) — panorama general sin filtros: los 7 KPIs de siempre (total comprado,
  recibido, pendiente, % completado, cantidad de OC pendientes/parciales/completadas) + 4 gráficos
  (Chart.js, cargado por CDN en `index.html` junto a SheetJS) + 2 accesos rápidos ("Ver abiertas (N)",
  "Ver completadas (N)") más un acceso a "Ver todas / cargar archivo". Los gráficos:
  1. **Evolución mensual comprado vs. recibido** (barras por mes) — para ver tendencia y si el área se
     está atrasando en recibir lo comprado.
  2. **Distribución de OC por estado** (dona) — pendientes/parciales/completadas de un vistazo.
  3. **Top proveedores por importe pendiente** (barras horizontales) — a quién hay que reclamarle/
     hacerle seguimiento primero.
  4. **Top compradores por volumen comprado** (barras horizontales) — quién del equipo genera más
     monto en OC.
  Se recalculan en cada `render()` (se destruye la instancia anterior de Chart.js antes de crear la
  nueva, si no los canvas quedan pisados). Los datos de "top proveedores/compradores" salen de sumar,
  por cada orden ya agrupada, `pendiente`/`importe` según corresponda — no hacen falta queries nuevas.
- **Abiertas** (`oc-abiertas`) — Pendientes y Parciales **juntas** en una sola vista (se probó
  separarlas en dos sub-vistas y no convenció al usuario: "no me convence... eso debe estar junto" —
  una orden con algo por recibir es "abierta", no importa si ya llegó una parte o nada). Filtros de
  proveedor/comprador/mes + resumen chico (cantidad de pendientes, cantidad de parciales, importe
  total) + la tabla agrupada de siempre. La distinción entre pendiente y parcial se sigue viendo en el
  badge de estado de cada fila.
- **Completadas** (`oc-comp`) — misma tabla agrupada, pre-filtrada a estado COMPLETADA (no hay
  selector de estado acá, es implícito por la sección); filtros propios de proveedor/comprador/mes y
  un resumen chico (cantidad de OC + importe total).
- **Todas** (`oc-todas`) — la vista completa sin recortar por estado: los 4 filtros (proveedor,
  comprador, mes, estado) + el checkbox "Ocultar completadas" + los 7 KPIs + la tabla. Acá vive el
  botón **"Cargar archivo (.xlsx)"** — es el único lugar de todo el módulo donde se sube el Excel de
  Tango, justamente porque es la vista de "administrar todo", no una de las sub-vistas de solo lectura.
- La tabla es la misma en las 3 sub-vistas con tabla (Dashboard no tiene tabla): agrupada por **orden
  de compra** (no por línea), con la fila resumen desplegable mostrando el detalle de artículos
  (cantidad pedida/recibida/pendiente, precio unitario e importe por línea).
- Estado de una OC — **PENDIENTE** (nada recibido todavía), **PARCIAL** (llegó parte), **COMPLETADA**
  (llegó todo) — se calcula por cantidades, no por dinero (ver `estadoOC()` en `js/modules/oc.js`).
- `js/modules/oc.js` es un único módulo que expone `render(secId)`: internamente decide qué sub-vista
  pintar según el `secId` recibido (todas comparten las mismas funciones internas de parseo, agrupado
  y cálculo de estado — no hay lógica duplicada entre sub-vistas, solo IDs de DOM distintos por
  prefijo: `ocd_`, `oca_`, `occ_`, `oc_`).
- **Idea pendiente del usuario, no implementada todavía:** más adelante le gustaría poder clasificar
  proveedores por categoría (ej. materia prima, pintura, insumos) y adaptar el indicador del Dashboard
  según esa categoría — requeriría una tabla nueva (`compras_proveedores` o similar, con categoría) y
  cruzarla por `proveedor_cod`/`proveedor_nombre`. Ver también sección 8.

### 5.4 Modelo de datos

Tabla `compras_oc_lineas` (ver [`sql/004_ordenes_compra.sql`](sql/004_ordenes_compra.sql) para la
migración y `sql/schema.sql` para el estado final). Sin RLS, mismo criterio que el resto de `compras_*`.

> Pendiente de decidir con el usuario: si conviene sumar la columna `deposito` (pañol/despacho) como
> filtro real en la UI, y si en algún momento se quiere que el % de "recibido" pese por importe en vez
> de por unidades×precio (hoy son equivalentes matemáticamente, pero si el precio cambiara entre líneas
> de una misma orden dejarían de serlo).

### 5.5 Archivos Excel de ejemplo — no van al repo

Los 3 archivos que pasó el usuario (`Excels/Julio OC.xlsx`, `Excels/Agosto OC.xlsx`,
`Excels/Julio Agosto OC.xlsx`) tienen datos reales de compras (proveedores, precios, montos) y el repo
de este tablero es **público** en GitHub — por eso `Excels/` está en `.gitignore`, no se sube. Quedan
solo en la máquina local para poder probar el parseo.

---

## 6. Stack técnico

- **Frontend:** HTML/JS vanilla, mismo criterio que Nexo RRHH y CIMOMET v3.
- **Diferencia respecto a Nexo RRHH:** en vez de un único archivo HTML, para este proyecto conviene
  **arquitectura modular con ES Modules** (varios archivos, uno por módulo/entidad) — el mismo enfoque
  que ya está planificado para el Tablero de Control Ejecutivo. Motivo: pediste que esto sea "súper
  personalizable" y fácil de modificar a futuro; un solo archivo gigante se vuelve difícil de mantener
  a medida que sumes los módulos de la sección 3.
- **Backend/datos:** Supabase — proyecto compartido con el sistema de legajos (ver 4.4), no uno dedicado.
- **Conexión:** las credenciales de Supabase (URL + anon key) están **hardcodeadas** en
  `js/supabase-client.js`, `porteria.html` y `solicitud.html` — no hay pantalla de login ni credenciales
  para configurar, las 3 páginas conectan solas al cargar. La anon key es pública por diseño (va en el
  front, se protege con RLS del lado de Supabase), por eso no hay problema en tenerla en el código. Si
  falla la conexión (ej. falta correr `sql/schema.sql`), se muestra un cartel de error en vez de la app.
- **Hosting:** GitHub Pages, igual que Nexo RRHH (evaluar si necesita dominio propio o si alcanza con el
  subdominio de GitHub).

### Estructura de carpetas (actual)

```
tablero-compras/
├── CLAUDE.md              (este archivo)
├── HANDOFF.md             (estado de sesión — igual que en tus otros proyectos)
├── index.html             (tablero modular de Compras — nav con Flota + módulos TBD deshabilitados)
├── porteria.html          (página standalone para el portero — salidas/retornos, excepciones)
├── solicitud.html         (página standalone para cualquier empleado — pedir vehículo + historial)
├── css/
│   └── styles.css         (sistema de diseño compartido por index.html)
├── js/
│   ├── main.js             (nav / routing / ciclo de vida de módulos)
│   ├── supabase-client.js  (credenciales hardcodeadas, conexión automática sin login)
│   ├── utils.js            (toast, formateo de fechas/montos, estado de vencimiento)
│   └── modules/
│       ├── flota-dashboard.js
│       ├── flota-vehiculos.js
│       ├── flota-solicitudes.js
│       ├── flota-movimientos.js
│       ├── flota-gantt.js
│       ├── flota-mantenimiento.js
│       ├── flota-vtv.js
│       ├── flota-documentos.js  (Seguros + Permisos unificados, ver 4.4)
│       ├── flota-personal.js  (lista de personal habilitado a manejar/solicitar, ver 4.4)
│       └── oc.js  (Órdenes de Compra — módulo aparte, sin relación con Flota, ver sección 5)
├── Excels/                (archivos de ejemplo de OC — en .gitignore, no se suben al repo)
└── sql/
    ├── schema.sql
    ├── 002_seguros_archivo.sql
    ├── 003_documentos_unificados.sql
    └── 004_ordenes_compra.sql
```

> `porteria.html` y `solicitud.html` son entry points separados (audiencias distintas: portero de
> planta y personal general) — no están integrados al SPA modular de `index.html`, que es exclusivo
> del área de Compras. Comparten la misma base de Supabase y el mismo esquema (`compras_vehiculos`,
> `compras_movimientos`, `compras_solicitudes`). El viejo `admin.html` (el tercer HTML que se usó de
> base) quedó sin tocar en la raíz como referencia — su funcionalidad ya está migrada a `index.html` +
> los módulos `flota-*.js`; se puede borrar cuando lo confirmes.

## 7. Notas específicas de entorno

- Dijiste que vas a trabajar este proyecto en **Antigravity** (cuenta de la empresa). Ojo con un detalle
  que ya tenemos registrado de tu workflow: **Antigravity no carga `CLAUDE.md` automáticamente** — usa
  `GEMINI.md` o `AGENTS.md`. Este archivo está nombrado `CLAUDE.md` porque así lo pediste, pero para que
  se cargue solo en Antigravity vas a necesitar guardarlo también (o renombrarlo) como `AGENTS.md` o
  `GEMINI.md`. Si en algún momento retomás este proyecto en Claude Code, ahí sí lo vas a querer como
  `CLAUDE.md`. Lo más simple: mantener el contenido en `CLAUDE.md` y tener una copia (o symlink) como
  `AGENTS.md`.

## 8. Decisiones abiertas (TBD)

Ya decidido al construir el módulo Flota (2026-08-04):
- [x] Esquema de datos: se migró al diseño de la sección 4.4 (`compras_vehiculos` separado de
  `compras_vtv`/`compras_seguros` como historial), no al esquema `fm_*` del prototipo — el prototipo no
  tenía datos reales cargados.
- [x] `porteria.html` y `solicitud.html` quedan como páginas standalone (audiencias distintas), fuera
  del SPA modular; solo la parte de gestión (ex `admin.html`) se integró a `index.html`.
- [x] Proyecto Supabase: se usa el mismo proyecto del sistema de legajos indicado por el usuario
  (`bmueojeeexheprteavay.supabase.co`), con prefijo `compras_` en todas las tablas/vistas para no
  chocar con las tablas de RRHH.
- [x] Conexión: credenciales hardcodeadas (no hay pantalla de login/config) — ver sección 5.

Todavía sin decidir:
- [ ] ¿Se integra el combustible/YPF Ruta al módulo Flota o queda como módulo aparte?
- [ ] ¿Las alertas de vencimiento se envían por mail (reutilizando Resend, ya integrado en Nexo RRHH) o solo se muestran en el tablero?
- [ ] ¿Este tablero va a alimentar de datos a la sección "Flota" del Tablero de Control Ejecutivo, o van a ser fuentes de datos separadas?
- [ ] Definir el siguiente módulo a desarrollar en detalle después de Flota (¿Proveedores? ¿Presupuesto?).
- [ ] Dominio propio para hosting o alcanza con GitHub Pages por ahora.
- [ ] Login/roles: ¿acceso solo para vos o para más personas del área de Compras? (hoy index.html, porteria.html y solicitud.html no tienen ningún control de acceso — cualquiera con el link y sin login puede leer/escribir todas las tablas `compras_*`, ya que la anon key va hardcodeada y sin RLS)
- [ ] ¿Se borra el `admin.html` original de la raíz ahora que su funcionalidad está migrada a `index.html`?
- [ ] Documentación: hoy el archivo viejo de un documento reemplazado queda en el Storage (no se borra,
  ver 4.4). ¿Conviene borrarlo automáticamente al cargar el nuevo, o dejarlo como está por si sirve de
  respaldo?
- [ ] ¿Se borran del todo `compras_seguros_old` / `compras_permisos_old` (ver 4.4) una vez confirmado
  que no hace falta consultarlas?
- [ ] Categorización de proveedores (ver 5.3): clasificarlos por tipo (materia prima, pintura, insumos,
  etc.) para poder adaptar/filtrar el Dashboard de OC según categoría — todavía no tiene tabla ni UI.

## 9. Próximos pasos sugeridos

1. Correr `sql/schema.sql` contra el proyecto Supabase real (ya hecho — tablas `compras_*` creadas).
2. Correr [`sql/002_seguros_archivo.sql`](sql/002_seguros_archivo.sql) (ya hecho) y
   [`sql/003_documentos_unificados.sql`](sql/003_documentos_unificados.sql) (ya hecho — fusiona Seguros
   + Permisos en `compras_documentos`).
3. Correr [`sql/004_ordenes_compra.sql`](sql/004_ordenes_compra.sql) para crear `compras_oc_lineas`
   (todavía falta — sin esto el módulo Órdenes de Compra muestra error de "tabla no encontrada").
4. Probar el circuito completo: pedir vehículo (solicitud.html) → aprobar y asignar (index.html) →
   registrar salida/retorno (porteria.html) → ver el movimiento reflejado en el dashboard.
5. Evaluar RLS (Row Level Security) en las tablas `compras_*` — hoy cualquiera con el link de
   `solicitud.html`/`porteria.html` puede leer/escribir todas las tablas, sin ningún login de por medio.
6. Ir completando los módulos `[TBD]` de la sección 3 a medida que los necesites, usando el módulo
   Flota (carpeta `js/modules/`) como plantilla.
