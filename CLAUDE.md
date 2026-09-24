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
| **Órdenes de compra** | `[DETALLADO]` (sección 5) | No es alta/gestión de pedidos — es un indicador de compras (pendientes/recibidas/total) alimentado importando el export de OC de Tango Gestión |
| **Stock / insumos críticos** | `[DETALLADO]` (sección 6) | Saldos por depósito importados de Capataz + lista de artículos en seguimiento con stock mínimo, para saber qué hay que reponer |
| **Proveedores** | `[DETALLADO]` (sección 7) | Agenda de compras por rubro (grupo) + ranking de compras — el proveedor se agrupa solo según qué artículos le compraste por OC |
| **Notas de Pedido** | `[DETALLADO]` (sección 8) | Lo que se le manda al proveedor para confirmar una cotización urgente o un servicio — numeración automática, PDF descargable, seguimiento por vínculo con la Orden de Compra que las cierra |
| **Cotizaciones** | `[DETALLADO]` (sección 9) | Solicitudes de cotización armadas desde el export de Capataz — marcar qué artículos no hace falta comprar (ya hay stock), invitar proveedores, cargar precios y comparar, con un resumen por proveedor en kg/lts/uni para repartir la compra respetando mínimos |
| **OT** | `[DETALLADO]` (sección 10) | Seguimiento de compras por orden de trabajo — tarjetas por OT + gráficos, distinguiendo lo comprado de lo asignado de stock; lee los datos de Cotizaciones, sin tablas propias |
| Presupuesto y gastos de compras | `[TBD]` | Presupuestado vs. real por categoría/área, alertas de desvío |
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

**Alta manual temporal (`PERSONAL_MANUAL`):** cuando Compras necesita asignarle un vehículo a alguien
que todavía no está cargado en Tango/legajos (`v_empleados_activos`), se agrega a mano a un array
`PERSONAL_MANUAL` (mismo objeto `{legajo, empresa, apellido_y_nombre, desc_puesto}`, `legajo: null`) que
se mezcla con la lista real en los tres lugares de arriba. `solicitante`/`conductor` se guardan como
**texto libre** en `compras_solicitudes`/`compras_movimientos` (no hay FK a la lista de personal), así
que no hay riesgo de duplicado en los datos ya cargados cuando la persona real aparezca en Tango — el
único lugar que hay que limpiar a mano es este array, sacando la entrada para que no quede
repetida en el desplegable. Caso real: `Leones, Juan Manuel` (Cimomet, puesto "Comercial"), agregado
2026-08-19 mientras se tramitaba su alta en Tango — sacar de los tres archivos una vez que aparezca en
`v_empleados_activos`.

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
4. Al confirmar, se **borran** las líneas existentes en ese rango de fechas (`delete().gte('fecha',
   fechaMin).lte('fecha', fechaMax)`) y se insertan todas las líneas del archivo nuevo. El resto del
   historial (fuera del rango de fechas de este archivo) no se toca. El borrado es por **rango de
   fechas**, no por lista de números de OC (`delete().in('orden_compra', [...])`) — con un archivo
   histórico grande (con un usuario real: +5000 filas) la lista de órdenes distintas puede ser enorme y
   ese filtro genera una URL demasiado larga, que Supabase rechaza con 400 Bad Request. Borrar por fecha
   da exactamente el mismo resultado (el set a borrar es "todo lo que había en ese rango") pero con una
   URL que no crece con la cantidad de datos.

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

- **Dashboard** (`oc-dash`) — panorama general con un único filtro de **año** (`ocd_f_anio` — se agregó
  cuando el historial pasó a cubrir varios años y mezclar todo dejaba de ser útil; por defecto trae el
  **año vigente** si hay datos de ese año, no "Todos los años" — `poblarFiltroAnio()` en `js/modules/oc.js`
  usa `new Date().getFullYear()` la primera vez que se puebla el select; si el usuario elige otro año a
  mano, `sel.dataset.tocado` marca esa elección para que no se pise sola al navegar a otra sección y
  volver — solo se resetea al año vigente con una recarga completa de la página): los 7 KPIs de siempre
  (total comprado, recibido, pendiente, % completado, cantidad de OC
  pendientes/parciales/completadas) + 4 gráficos (Chart.js, cargado por CDN en `index.html` junto a
  SheetJS) + 2 accesos rápidos ("Ver abiertas (N)", "Ver completadas (N)", con el conteo del año elegido)
  más un acceso a "Ver todas / cargar archivo". Al elegir un año, los 7 KPIs y los 4 gráficos se
  recalculan sobre las líneas de ese año únicamente — `renderDashboard()` filtra `LINEAS` por
  `fecha.slice(0,4)` antes de agrupar y se lo pasa tanto a `renderKPIs` como a `renderGraficosDashboard`.
  Los gráficos:
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
- **Estado de una línea, dentro del detalle desplegable** (`estadoLinea()`): no es un simple
  Pendiente/Recibido según `cant_pendiente`. Caso real del usuario (2026-09-16): a veces Tango cierra
  una línea sola con `cant_pendiente = 0` **sin que haya llegado nada** (o solo una parte) — típicamente
  porque ese artículo se terminó comprando a otro proveedor por fuera de esta OC, sin pasar por una OC
  formal para eso. Antes eso se mostraba igual que "Recibido" (verde), como si hubiera llegado. Ahora
  una línea con `cant_pendiente = 0` pero `cant_recibida < cant_pedida` se marca aparte como
  **"⚠️ Cerrada sin recibir"** (rojo, `.badge.vencido` — distinto del amarillo "Pendiente" porque ya no
  está abierta, y distinto del verde "Recibido" porque no llegó lo pedido), con un tooltip explicando el
  motivo probable. Es solo de presentación en el detalle de línea — no cambia el estado
  Pendiente/Parcial/Completada de la OC completa (`estadoOC()`), que sigue siendo por cantidades a nivel
  de toda la orden.
- `js/modules/oc.js` es un único módulo que expone `render(secId)`: internamente decide qué sub-vista
  pintar según el `secId` recibido (todas comparten las mismas funciones internas de parseo, agrupado
  y cálculo de estado — no hay lógica duplicada entre sub-vistas, solo IDs de DOM distintos por
  prefijo: `ocd_`, `oca_`, `occ_`, `oc_`).
- **Idea pendiente del usuario, no implementada todavía:** más adelante le gustaría poder clasificar
  proveedores por categoría (ej. materia prima, pintura, insumos) y adaptar el indicador del Dashboard
  según esa categoría — requeriría una tabla nueva (`compras_proveedores` o similar, con categoría) y
  cruzarla por `proveedor_cod`/`proveedor_nombre`. Ver también sección 7 (Proveedores), que termina
  implementando exactamente esta idea.

### 5.4 Modelo de datos

Tabla `compras_oc_lineas` (ver [`sql/004_ordenes_compra.sql`](sql/004_ordenes_compra.sql) para la
migración y `sql/schema.sql` para el estado final). Sin RLS, mismo criterio que el resto de `compras_*`.

**Unidad de medida en el detalle de línea** (pedido del usuario, 2026-09-15): el export de OC de Tango
**no trae ninguna columna de unidad** (ver 5.1 — CANT_PED/CANT_REC/CANT_PEN son números pelados, sin
decir si son kg, mts, uni...), así que Pedida/Recibida/Pendiente se mostraban sin ninguna referencia de
qué se estaba contando. `render()` en `js/modules/oc.js` ahora cruza cada línea por `articulo_cod`
contra `compras_stock_saldos.unidad_medida` (el export de Capataz sí trae `UNIDAD_MED`, ver sección 6.1)
para completar la unidad en pantalla — mismo criterio de "cruzar por código de artículo entre módulos"
que ya usa Proveedores (sección 7.1) para derivar grupos desde OC. Es solo para mostrar, no se guarda en
`compras_oc_lineas`; un artículo que nunca se cargó en Stock (o no tiene ninguna fila con
`unidad_medida`) queda sin unidad, no se inventa ninguna.

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

## 6. Módulo: Stock `[DETALLADO]`

Sin relación con Flota ni con Órdenes de Compra — es su propio módulo. Nació de la necesidad de saber
qué insumos hay que reponer, sin tener que revisar Capataz a mano artículo por artículo.

### 6.1 De dónde viene el dato

Se alimenta del **export de saldos de Capataz** (botón de exportar desde el propio Capataz). Columnas
del archivo (nombres tal cual los pone Capataz): `id_xpress_sql`, `cod_articu`, `descripcio`,
`desc_adic`, `estad_ela`, `estad_vta`, `n_partida`, `n_despacho`, `saldo`, `unidad_med`, `cod_deposi`,
`nombre_suc`, `fecha`, `fecha_vto`, `coef_rendi`. A diferencia de Órdenes de Compra, cada fila acá es
un **lote/partida**, no un artículo — el mismo `cod_articu` puede tener varias filas en el mismo
depósito si hay más de un lote con saldo (identificado con el archivo real `Stock.xlsx` que pasó el
usuario: 5983 filas, 3188 artículos únicos — o sea, en promedio casi el doble de filas que artículos).
Para el stock total de un artículo hay que **sumar `saldo`** entre todas sus filas.

- El archivo trae **16 depósitos** (`cod_deposi`): `01` PRINCIPAL, `90` PAÑOL, `11` MANTENIMIENTO, `22`/
  `24`/`25` CONTENEDOR 3/5/6, `26` CALIDAD, `30` MONTAJE, `03` PINTURAS, `YP` YPF FILTRO, `ZZ` Depósito
  Capataz, y varios con muy poco uso (COMEDOR, FABRICACION, CONTENEDOR 1/2). El usuario aclaró que solo
  **Principal + Pañol** importan para decidir qué comprar — el resto incluye cosas como un contenedor
  armado para una obra específica (insumos de obra, microondas, etc.) que "no mueven la aguja". Primera
  versión: se importaban los 16 igual (no perder información) y el cálculo usaba por defecto solo
  Principal+Pañol. El usuario pidió simplificar más: **"tengamos en cuenta solo estos, los otros
  retiralos"** — ahora el parseo (`parseWorkbookStock()` en `js/modules/stock.js`) descarta directamente
  cualquier fila que no sea de depósito `01` o `90`, **no llegan a guardarse** en `compras_stock_saldos`.
  El `confirm()` antes de cargar avisa cuántas filas de otros depósitos se ignoraron. Se hizo una limpieza
  única de lo que ya había cargado de otros depósitos (1850 filas de un total de 5983, quedaron 4133).
- `estad_ela` trae dos valores (`LIB` / `LIR`) sin que quede claro que uno invalide el saldo — no se
  filtra por este campo, se suma todo tal cual figura.

### 6.2 Cómo se carga

Igual que Órdenes de Compra: el `.xlsx` se parsea **en el navegador** con SheetJS y se sube directo a
Supabase desde el cliente (`js/modules/stock.js`). La diferencia clave es que acá **no hay reemplazo
parcial** — el archivo de Capataz ya es una **foto completa** del stock a esa fecha (no un incremental
como el de Tango), así que cada carga borra toda la tabla `compras_stock_saldos` y la vuelve a llenar
con el archivo nuevo entero. Antes de hacerlo se muestra un `confirm()` con el resumen (filas, artículos,
depósitos) para que no sea una carga a ciegas. La idea es repetir esta carga cada tanto para mantener el
indicador al día.

### 6.3 Qué muestra el tablero

Mismo patrón de nav colapsable que Flota y Órdenes de Compra ("📦 Stock ▾") con Dashboard + sub-vistas:

- **Dashboard** (`stock-dash`) — 4 KPIs (artículos con stock, depósitos cargados, artículos en
  seguimiento, artículos bajo el mínimo) calculados con el alcance por defecto (Principal + Pañol) +
  accesos rápidos a las otras 3 sub-vistas.
- **A comprar** (`stock-comprar`) — de los artículos en seguimiento, solo los que están **por debajo**
  del mínimo configurado. Es el indicador de compra que pidió el usuario. Tiene un botón **"📥 Exportar
  (.xlsx)"** (`exportarAComprar()` en `js/modules/stock.js`, usa SheetJS igual que la carga) que baja
  exactamente lo que se está viendo (mismo filtro de depósito elegido) a un Excel con código, descripción,
  stock actual, mínimo y una columna calculada "A comprar (aprox.)" = mínimo − stock actual — para llevar
  la lista a un proveedor o al circuito de compras sin transcribirla a mano.
- **Seguimiento** (`stock-segui`) — todos los artículos marcados, estén o no bajo el mínimo, con acciones
  para editar el mínimo (✏️) o sacarlos de la lista (🗑️, no borra el stock, solo el seguimiento).
- **Todo el stock** (`stock-todo`) — listado completo agrupado por artículo (sumando saldo entre lotes),
  con búsqueda por código/descripción y filtro de depósito. Expandible por fila (mismo patrón que
  Órdenes de Compra) para ver el desglose de saldo por depósito de ese artículo. Acá vive el botón
  **"⭐ Agregar/✏️ Editar"** que abre el modal de seguimiento, y el botón **"Cargar archivo (.xlsx)"**.
- **Filtro de depósito** (presente en las 3 sub-vistas con tabla, `sto_f_dep`/`stoc_f_dep`/`stos_f_dep`):
  solo 3 opciones fijas (no se poblán dinámicamente, ya no hace falta) — `""` = Principal + Pañol
  combinados, `"01"` = solo Principal, `"90"` = solo Pañol. Filtra de verdad la lista, no solo el total:
  si elegís Pañol, solo aparecen artículos que tienen algo en Pañol, con el saldo de Pañol únicamente
  (`agruparPorArticulo(depFiltro)` en `js/modules/stock.js` filtra las filas de `compras_stock_saldos`
  *antes* de agrupar, no después).
- Un mínimo es **por artículo**, no por artículo+depósito (decisión tomada con el usuario: más simple de
  cargar/leer, se compara contra la suma del saldo en el alcance de depósito elegido).

### 6.4 Modelo de datos

Dos tablas (ver [`sql/005_stock.sql`](sql/005_stock.sql) para la migración y `sql/schema.sql` para el
estado final), sin RLS (mismo criterio que el resto de `compras_*`):

- `compras_stock_saldos` — se reemplaza entera en cada carga (ver 6.2). Una fila por lote/partida.
- `compras_stock_minimos` — la lista curada a mano por el usuario. `cod_articulo` es `unique` (un mínimo
  por artículo); se hace `upsert` desde el modal de seguimiento. Si un artículo en seguimiento deja de
  aparecer en el último archivo cargado (¿discontinuado? ¿typo en el código?), la UI lo marca como
  "no está en el último archivo" y lo trata como saldo 0 (bajo mínimo) en vez de ocultarlo.

### 6.5 Archivos Excel de ejemplo — no van al repo

El archivo que pasó el usuario (`Excels/Stock.xlsx`) tiene datos reales de stock/depósitos y el repo de
este tablero es **público** en GitHub — por eso, igual que los de Órdenes de Compra, `Excels/` está en
`.gitignore` y no se sube. Queda solo en la máquina local para poder probar el parseo.

---

## 7. Módulo: Proveedores `[DETALLADO]`

Sin relación con Flota como tabla, pero **se alimenta de Órdenes de Compra**: nació de la idea de armar
una agenda de compras por rubro (Pintura, Granalla, Ferretería, etc.) sin tener que clasificar cada
proveedor a mano — el proveedor se agrupa solo según qué artículos le compraste, ya que si le hiciste
una OC por algo, sabés que lo vende (se cotizó, si no no habría OC).

### 7.1 La idea central: clasificar artículos, no proveedores

En vez de asignarle un rubro a cada proveedor uno por uno, se clasifica el **artículo** (ej. "PINTURA
EPOXI" → grupo Pintura) en `compras_articulos_grupo`. La pertenencia proveedor→grupo se **deriva** en el
cliente (`js/modules/proveedores.js`, `derivarGruposPorProveedor()`), cruzando `compras_oc_lineas` (por
`proveedor_cod` + `articulo_cod`) contra esa clasificación — no se guarda en ninguna tabla. Ventajas de
este diseño:
- Clasificar un puñado de artículos frecuentes alcanza para que la mayoría de los proveedores caigan
  solos en su grupo — no hace falta clasificar los ~3000 artículos del catálogo.
- Funciona para atrás (OC ya cargadas) y para adelante (cualquier OC nueva con ese artículo agrupa
  automáticamente al proveedor que la emitió, sin volver a tocar nada).
- Un proveedor puede caer en **varios grupos** si vendió artículos de rubros distintos — no es una
  categoría única forzada.
- Para proveedores sin ninguna OC todavía (solo cotizaron, nunca les compraste) no hay artículos de
  donde derivar nada — por eso `compras_proveedores.grupo_manual_id` es el respaldo manual.

**Clasificación masiva inicial (2026-08-21):** se clasificaron a mano de a poco pero también, a pedido
del usuario, en varias rondas automatizadas (script puntual contra la API de Supabase, no forma parte
del código del repo) que armaron reglas por palabra clave sobre `articulo_desc`/`articulo_cod` para
llegar de ~1750 artículos sin clasificar a **0** — los 2965 artículos conocidos (de OC + Stock, excluyendo
códigos O/T) quedaron los 2965 clasificados en 28 grupos. La mayoría son rubros específicos del rubro de
CIMOMET/CO.MO.ING (fabricación de estructuras metálicas y tanques lavadores de gases): Acero - Perfiles,
Acero - Chapas, Soldadura, Consumibles de Corte por Plasma, Granalla, Pintura, Equipo de Pintura,
Cañeria/Bridas/Valvulas, Rejillas y Pisos Industriales, Izaje y Elementos de Elevación, EPP, Ensayos No
Destructivos, Rodamientos y Transmisiones, Herramientas Eléctricas (Repuestos), Herramientas Manuales,
Mechas/Fresas y Herramientas de Corte, Material Eléctrico, Revestimientos y Plásticos Técnicos,
Lubricantes y Aceites, Andamios y Accesos, Maquinaria y Equipos de Planta, Insumos de Embalaje y
Señalética, Gases Industriales, Combustible y Lubricantes, Buloneria, Ropa. El último ~13% (394 artículos)
que no encajó en ningún patrón específico —sin volumen ni consistencia como para justificar un rubro
propio sin inventar categorías de un solo artículo— quedó en **"Varios / Ferretería General"**, creado
recién en esa última ronda y a pedido explícito del usuario ("clasificalos a todos juntos") — es la
única excepción al criterio de "nada genérico" del resto del módulo, y a propósito: sirve de bolsón para
ir reclasificando de a uno a mano cuando aparezca un patrón claro, en vez de dejarlos eternamente "sin
clasificar". **Cuidado si se repite este proceso:** varios de los nombres de grupo "canónicos" no
coinciden exactamente con lo que un script nuevo podría generar por default (ej. la base tiene `"EPP"`,
`"Equipo de Pintura"` singular, `"Aceros - Chapa"`, `"Cañeria, Bridas y Valvulas"` sin tildes) — comparar
por nombre exacto antes de crear un grupo, si no se duplica.

### 7.2 Qué muestra el tablero

Mismo patrón de nav colapsable que Flota/OC/Stock ("🏭 Proveedores ▾") con Dashboard + sub-vistas:

- **Dashboard** (`prov-dash`) — 4 KPIs (proveedores — con OC o agendados —, grupos creados, artículos
  clasificados, top proveedor por monto comprado) + accesos rápidos a las otras 4 sub-vistas.
- **Agenda** (`prov-agenda`) — elegís un grupo (select) y ves los proveedores que lo cubren, con total
  comprado/última compra (si tienen OC) y sus contactos/vendedores (nombre, teléfono, email) para saber
  a quién escribirle a pedir cotización. El botón "+ Nuevo grupo" (`crearGrupo()`, usa `prompt()` — es
  solo un nombre, no justifica un modal) está acá porque es el punto de entrada natural: normalmente se
  te ocurre un rubro nuevo mientras estás buscando a quién cotizarle algo. Cada fila es expandible
  (mismo patrón `.oc-row`/`.oc-detail` que OC/Stock) y en el detalle muestra **"Por qué está acá"**
  (`articulosQueJustifican()` en `js/modules/proveedores.js`): los artículos concretos de
  `compras_oc_lineas` comprados a ese proveedor que están clasificados en el grupo que estás mirando,
  con código, descripción, cantidad de líneas de OC e importe. Si el proveedor está en el grupo solo por
  `grupo_manual_id` (lo agendaste a mano) y todavía no le compraste nada de esa categoría por OC, en vez
  de la lista se muestra un aviso de que va a aparecer solo en cuanto haya una OC — nunca se inventa un
  motivo. El Catálogo (`prov-catalogo`) reusa la misma función: sin filtro de grupo activo, desglosa el
  motivo por cada grupo al que pertenece el proveedor (puede estar en varios).
- **Ranking** (`prov-ranking`) — todos los proveedores que aparecen en OC (agendados o no) ordenados por
  total comprado, con cantidad de OC y última compra — el ranking de compras que pidió el usuario, sale
  directo de `compras_oc_lineas` sin necesitar que el proveedor esté en el catálogo.
- **Clasificar artículos** (`prov-clasificar`) — buscador de artículos (por código o descripción, fuente:
  distinct de `compras_oc_lineas.articulo_cod` + `compras_stock_saldos.cod_articulo`, **excluyendo los
  códigos "O/T ..." / "OTT ..."** — trabajo tercerizado atado a una orden de trabajo puntual, con un solo
  subcontratista ya asignado en Tango, no un artículo de catálogo real para agrupar por rubro; filtro
  `esCodigoOT()` en `js/modules/proveedores.js`, pedido explícito del usuario para no ensuciar
  `compras_articulos_grupo`) con un `<select>`
  de grupo por fila que hace `upsert`/`delete` inmediato al cambiar — sin buscar ni tildar el checkbox de
  abajo, muestra solo los ya clasificados (para no renderizar miles de filas de una; con ~3000 artículos
  en el catálogo, siempre hay un tope de 300 filas por vista, avisado en el resumen si se corta). El
  checkbox **"Solo sin clasificar"** (`pvc_f_sinclasificar`) invierte la vista por defecto: muestra los
  que **no** tienen grupo todavía, para poder ir clasificando de a uno ("ir descontando", pedido del
  usuario) — al asignarle un grupo a una fila, la lista se vuelve a pintar y esa fila desaparece sola
  (ya no es "sin clasificar"), así el contador del resumen baja en tiempo real. **Asignación masiva:**
  cada fila tiene un checkbox (+ "seleccionar todos los visibles" en el header) y una barra arriba de la
  tabla con un `<select>` de grupo + botón "Aplicar a los seleccionados" (`aplicarGrupoMasivo()`) — para
  no tener que tocar el `<select>` de a uno cuando son muchos del mismo rubro (ej. buscar "BUL" y mandar
  los 200 resultados a Bulones de una). El upsert masivo va en el body (sin límite práctico de filas);
  el "— Quitar grupo —" del mismo `<select>` borra en tandas de 100 códigos por request, porque un
  `in.(...)` con todos los códigos juntos puede generar una URL demasiado larga (mismo problema que se
  corrigió en Órdenes de Compra, ver sección 5.2). Los checkboxes también se pueden **tocar y arrastrar**
  para ir tildando varias filas seguidas sin hacer click una por una (`initArrastreSeleccion()`,
  mousedown+mouseover sobre la columna de checkboxes, al estilo "pintar" de una planilla de cálculo) —
  pedido explícito del usuario, tildar de a uno no le convencía con listas de 100+ artículos.
- **Catálogo** (`prov-catalogo`) — CRUD de proveedores: nombre, código Tango (opcional, con `<datalist>`
  de sugerencias sacadas de los proveedores vistos en OC, para no tipear mal el código), grupo manual,
  notas, y sus contactos (expandible por fila, mismo patrón que OC/Stock, con "👤+ Agregar contacto" en
  el detalle). Filtro de grupo (`pvp_f_grupo`, mismo `<select>` poblado por `poblarSelectGrupos()` que
  usa Agenda) además del buscador de texto — para poder ver de un vistazo, por ejemplo, todos los
  proveedores de Pintura sin tener que ir a la Agenda. El modal de alta/edición (`mPROVEEDOR`) también
  tiene un bloque opcional de "agregar un contacto" (nombre/teléfono/email) al final, para cargar el
  proveedor y su primer vendedor en un solo paso en vez de tener que abrir el modal de contacto aparte
  después — siempre agrega un contacto nuevo, no edita uno existente (todavía no hay edición de
  contactos puntuales, solo alta y borrado).

**Proveedores "detectados" (sin ficha propia todavía):** el Catálogo y la Agenda no muestran solo lo
que hay en `compras_proveedores` — `obtenerTodosLosProveedores()` en `js/modules/proveedores.js` le suma
cualquier `proveedor_cod` de `compras_oc_lineas` que todavía no tenga fila propia, marcado con
`virtual: true` y un badge "detectado". Esto es a propósito: "no tiene sentido que el Ranking me
muestre proveedores y el Catálogo no" (feedback del usuario) — si ya le compraste algo por OC, tiene que
aparecer solo, no requiere que lo agregues a mano primero. Un proveedor virtual muestra un botón
"➕ Completar datos" en vez de ✏️/🗑️ (no hay nada que editar/borrar todavía, no existe la fila) que abre
el mismo modal de alta con nombre y código Tango precompletados — al guardar, pasa a ser una fila real
con ficha propia (contactos, notas, grupo manual) y deja de tener el badge.

### 7.3 Modelo de datos

Cuatro tablas (ver [`sql/006_proveedores.sql`](sql/006_proveedores.sql) para la migración y
`sql/schema.sql` para el estado final), sin RLS (mismo criterio que el resto de `compras_*`):

- `compras_grupos` — solo `id` + `nombre` (único). Los crea el usuario a medida que los necesita.
- `compras_articulos_grupo` — `cod_articulo` como PK (un grupo por artículo, no varios) + `grupo_id`.
- `compras_proveedores` — el catálogo/agenda. `cod_tango` es opcional y sin `unique` (no hay garantía de
  que Tango nunca reutilice/varíe un código, mejor no reventar un insert por eso); es lo que permite
  cruzar con `compras_oc_lineas.proveedor_cod` para derivar grupos y ranking. `grupo_manual_id` referencia
  `compras_grupos` con `on delete set null` (si se borra el grupo, el proveedor no se borra, solo pierde
  esa clasificación manual).
- `compras_proveedores_contactos` — vendedores/contactos por proveedor, `on delete cascade` desde
  `compras_proveedores` (si se borra el proveedor, se borran sus contactos, tiene sentido acá porque no
  son una entidad útil sin el proveedor).

### 7.4 Ideas pendientes, no implementadas todavía

- **Evaluación/calificación de proveedores** (mencionado en el mapa de módulos original, sección 3) — no
  hay ningún campo de rating/calificación hoy, solo `notas` libres.
- ~~**Circuito de cotizaciones**~~ — implementado como el módulo **Cotizaciones** propio, ver sección 9.
  No terminó siendo "enviar por mail a los proveedores de un grupo" como se planteó acá originalmente
  (eso quedó descartado, ver 9.4) sino invitar una lista fija a mano y cargar los precios directo en el
  sistema — el dato de email del contacto (ver 7.2) queda igual disponible para cuando se arme el envío
  real por mail, si hace falta más adelante.
- El cruce `cod_tango` es por texto exacto — si Tango tiene el mismo proveedor con dos códigos distintos
  (por una migración vieja, un alta duplicada, etc.) el ranking/derivación lo va a tratar como dos
  proveedores separados. No se detectó ningún caso real de esto todavía.

---

## 8. Módulo: Notas de Pedido `[DETALLADO]`

Sin relación con Flota/OC/Stock como tablas. Nació de una necesidad puntual: cuando hay urgencia (no da
tiempo el circuito normal de Orden de Compra) o se contrata un **servicio** (que internamente genera una
OTT y termina en su propia OC, con un código tipo `P240086T025` — ver el filtro `esCodigoOT()` en
sección 7.2), Compras le manda al proveedor una **Nota de Pedido** para confirmar la cotización. Antes
esto se armaba a mano en Word (numeración manual, sin seguimiento — si el proveedor se colgaba, nadie se
enteraba hasta que hacía falta el material). Este módulo numera las NP solas y arma el PDF para mandar,
y les da seguimiento por vínculo con la OC que las cierra.

### 8.1 Numeración

`compras_notas_pedido.numero` sale de una **secuencia real de Postgres** (`compras_np_numero_seq`, ver
[`sql/007_notas_pedido.sql`](sql/007_notas_pedido.sql)), arrancando en **8123** — el número siguiente al
de la última NP real que se había generado en Word (NP-8122, 2026-08-24). Se usa una secuencia de
Postgres y no un `max()+1` calculado en el cliente para que dos altas casi simultáneas nunca puedan
chocar en el mismo número.

### 8.2 Seguimiento — vínculo simple con Orden de Compra

Decisión tomada con el usuario: el cierre de una NP es un **vínculo simple**, no una réplica del cálculo
pendiente/parcial/completada que ya hace el módulo de Órdenes de Compra. Una NP nace en estado
`PENDIENTE`; cuando el proveedor cumple y esa compra queda cargada como Orden de Compra (importada de
Tango, ver sección 5), Compras la **vincula a mano** al N° de OC correspondiente. El flujo es un modal
propio (`mVINCULAROC`, `vincularOC()`/`renderListaVincularOC()`/`confirmarVincularOC()` en
`js/modules/notas-pedido.js`) — **no un `prompt()`** (versión anterior, cambiada a pedido explícito del
usuario): buscador con las OC agrupadas por N° (`agruparOCPorOrden()`, mismo criterio que
`agruparPorOrden()`/`estadoOC()` en `js/modules/oc.js`, duplicado a propósito) mostrando proveedor,
fecha, importe y el mismo badge Pendiente/Parcial/Completada que el módulo de OC — precargado con el
nombre del proveedor de la NP para que por defecto ya aparezcan sus OC, pero se puede buscar cualquier
otra. Cada fila es expandible (mismo patrón `.oc-row`/`.oc-detail` que OC/Stock/Proveedores) y muestra qué
artículos componen esa OC — para poder confirmar de un vistazo que es la orden correcta antes de
vincular, en vez de adivinar por el importe total. Un click en "Vincular" de la fila elegida cierra el
vínculo. Se puede desvincular si fue un error.
En la lista, cada
NP `PENDIENTE` muestra hace cuántos días se creó, con el mismo semáforo ámbar/rojo (5/10 días) que
`estadoVencimiento()` en `utils.js` — para que una NP "colgada" salte a la vista en vez de perderse, que
es justamente el problema que este módulo vino a resolver.

No se distingue "Material" vs "Servicio" como campo propio — decisión del usuario: son pocas NP (Compras
prefiere siempre que se pueda ir directo a Orden de Compra), no justifica un campo/filtro dedicado.

### 8.3 Ítems y PDF

Cada NP tiene un array `items` (jsonb: `[{cantidad, unidad, descripcion, precio}]`) cargado con filas
dinámicas en el modal de alta (sin patrón previo en el resto del código para esto — tabla con "+ Agregar
línea" y 🗑️ por fila). `cantidad` y `precio` son **numéricos** (no texto libre como en el diseño
original — se cambió para poder calcular subtotales/total reales, ver más abajo); las NP viejas en
Word mezclaban `$`/`U$s`/"c/u"/"el kg" sin formato fijo, pero eso quedó afuera a cambio de que el
sistema haga la cuenta solo.

El PDF se genera 100% en el cliente con **jsPDF + jspdf-autotable** (CDN, cargados en `index.html` junto
a SheetJS/Chart.js — mismo criterio sin bundler) — `generarPdfNP()` en `js/modules/notas-pedido.js`. Es
un **diseño nuevo, no una réplica del Word viejo**: el usuario pidió explícitamente actualizar el
formato ("anticuado y feo... con información muy vieja e incierta"). Datos de membrete confirmados
2026-08-24: **Cimomet S.A.**, dirección "Juan XXIII (ex Biedma) 7473, Rosario, Santa Fe, Argentina",
emails `compras@cimomet.com.ar` / `vangulo@cimomet.com.ar` — **sin teléfono**, a pedido explícito. El
logo (`Logo Cimomet HD.png`, 666×310px) va embebido como base64 directo en el módulo (constante
`EMPRESA.logoBase64`, ~155.000 caracteres) — mismo criterio "todo client-side, sin pipeline de assets"
que el resto del proyecto; si el logo cambia, hay que volver a generar el base64 y pegarlo ahí. Se
mantiene el contenido legal del Word (cláusula de aceptación tácita a los 2 días corridos) — el usuario
se quejó del diseño/datos viejos, no de esa parte. Nombre de archivo: `NP-{numero}.pdf`.

**Ajustes de diseño pedidos tras la primera prueba real (2026-08-24):** más espacio entre el logo y la
dirección/mail (quedaba muy pegado); el mail es clickeable (`doc.link()`) y abre un mail con las dos
casillas como destinatarias a la vez (`mailto:compras@...,vangulo@...`); Fecha de entrega/Condiciones de
pago/Lugar de entrega/Autorizado por (antes "Revisado por" — es el mismo campo, ver 8.2) se movieron a
un bloque de dos columnas justo debajo de "Sres."/O.T., en vez de quedar sueltos al final — **orden
exacto pedido por el usuario**: columna izquierda Entrega parcial → Fecha de entrega → Lugar de entrega,
columna derecha Condiciones de pago → Autorizado por (`filaInfo()` en `generarPdfNP()`, soporta que
cualquiera de los dos lados envuelva a varias líneas sin desalinear al otro); "Adjuntos" ya no se
imprime en el PDF (sí sigue en el detalle de la lista, es información interna); la tabla de ítems suma
una columna **Subtotal** (cantidad×precio, columnas Cantidad/Unidad/Precio/Subtotal centradas — pedido
explícito, "ORDENADO TODO") y abajo un resumen de **Subtotal / Bonificación (si hay) / Total** con la
leyenda "(+ IVA)" si corresponde — `calcularTotales()` en `js/modules/notas-pedido.js` hace esta cuenta
y la reusan el PDF, el detalle de la lista y el modal de alta (que muestra los mismos tres números en
vivo mientras se completan los ítems, para que el modal se vea como el resultado final, pedido explícito
del usuario). Esto implicó que **`precio` (y `cantidad`) dejaron de ser texto libre** — ahora son
inputs numéricos, porque no se puede calcular un subtotal real sobre "U$s 1,20 el kg".

Para no perder la información de moneda que traía el texto libre viejo, se sumó un campo **`moneda`**
(`ARS`/`USD`, select en el modal — ver
[`sql/010_moneda.sql`](sql/010_moneda.sql)) que define el símbolo (`$` o `U$S`) usado en **todos** los
importes de esa NP (ítems, subtotal, bonificación, total) vía `fmtPesos(monto, moneda)` — así queda
claro en qué moneda está cotizado todo el documento sin tener que repetirlo en cada línea.

El modal también muestra, al lado del título, el **número que va a tener la NP** (`np_numero_preview`,
`— N° {numero} (estimado)`) — calculado como `max(numero)` de las NP ya cargadas + 1. Es una estimación,
no una garantía: el número real lo asigna la secuencia de Postgres recién al guardar (ver 8.1), así que
si otra persona crea una NP en el medio, el número real puede terminar siendo distinto al que se
mostraba en el modal.

**N°/código de cotización** (`cotizacion_ref`, ver [`sql/011_cotizacion_ref.sql`](sql/011_cotizacion_ref.sql))
— campo opcional para la referencia que a veces pide el proveedor (la de ELLOS, distinta de nuestro N°
de NP y del O.T. interno). En el PDF va debajo del bloque de Fecha de entrega/Condiciones de
pago/Lugar de entrega/Autorizado por y arriba de la tabla de ítems — pedido explícito del usuario. Si
está vacío, no se imprime ninguna línea.

**Enter no manda la NP a medio completar:** el form tiene un listener de `keydown` que hace
`preventDefault()` en Enter salvo que el foco esté en un `<textarea>` o en el botón de submit — sin esto,
Enter en cualquier input (ej. tipeando el proveedor) dispara el envío implícito del navegador. Se agregó
después de que una NP se creara así por accidente (NP-8125, borrada a mano).

**Proveedor** — el input tiene un autocomplete propio (no `<datalist>` nativo: mezclaba con el
historial de autocompletado del navegador y no se podía estilar) que sugiere tanto los proveedores con
ficha propia (`compras_proveedores`) como los que solo aparecen en `compras_oc_lineas` — sigue siendo
texto libre, si no coincide con nada se guarda tal cual se escriba.

**Unidad** de cada ítem es un `<select>` fijo (`Unidad, KG, Mts, Lts, Mt2`, pedido del usuario) en vez de
texto libre.

**Bonificación** es un número (0-100, el `%` se agrega solo al mostrarlo/en el PDF, no se guarda en la
columna) y **Condiciones de pago** es un `<select>` fijo (`Contado F/Factura, 7 días F/F, 15 días,
30 días, 45 días, 60 días, 90 días` — los últimos dos agregados a pedido del usuario, 2026-09-10, mismo
`<select>` que reusa Cotizaciones, ver 9.2 punto 10).

**Fecha de entrega** es un date picker real (antes texto libre) — se guarda como fecha ISO en la
columna `fecha_entrega` y se muestra formateada con `fmt()` de `utils.js`. Para "entrega parcial" hay un
checkbox que revela un textarea libre (`entrega_parcial`, columna nueva — ver
[`sql/009_entrega_parcial.sql`](sql/009_entrega_parcial.sql)) para describirla en texto (ej. "50% en 10
días, resto en 20 días") — sin fechas múltiples ni nada más estructurado, a propósito, por pedido
explícito de mantenerlo simple.

**Foto adjunta** (`np_adjunto_foto`, input de archivo) — **nunca se guarda en Supabase**, decisión
explícita del usuario tras comparar con integrar Google Drive (mucho más trabajo, requiere OAuth) y
elegir la alternativa simple: la foto se lee con `FileReader` en el momento de guardar la NP, se mete
como página aparte en el PDF que se descarga ahí mismo (`generarPdfNP(n, fotoDataUrl)`), y se descarta —
no queda en ningún lado. La columna `adjuntos` (texto) sí guarda una nota tipo "foto adjunta:
nombre.jpg" para que quede constancia de que existió, aunque volver a descargar el PDF de esa NP más
adelante ya no va a incluir la imagen.

### 8.4 Modelo de datos

Dos migraciones (ver [`sql/007_notas_pedido.sql`](sql/007_notas_pedido.sql) y
[`sql/009_entrega_parcial.sql`](sql/009_entrega_parcial.sql) — `sql/008_usuarios.sql` es el login, ver
sección 11 — y `sql/schema.sql` para el estado final), sin RLS (mismo criterio que el resto de `compras_*`):

- `compras_notas_pedido` — `proveedor_nombre` es texto libre (copiado al crear, igual que
  `compras_oc_lineas.proveedor_nombre`) con `proveedor_id` opcional si coincide con una ficha real de
  `compras_proveedores`; no ata la carga a que el proveedor ya exista en el catálogo.

Es solo para **CIMOMET** (no Co.Mo.Ing) — membrete fijo, sin selector de empresa; decisión del usuario.

---

## 9. Módulo: Cotizaciones `[DETALLADO]`

Sin relación con Flota/OC/Stock/Notas de Pedido como tablas, pero resuelve una necesidad real del
circuito de compras que las Notas de Pedido no cubren: cuando Ingeniería pide materiales, Compras baja
de Capataz un Excel con todo lo solicitado y lo cotiza en paralelo en varios proveedores, comparando a
mano en el Excel (con las filas de lo que ya hay en stock pintadas de amarillo) para decidir a quién
comprarle cada cosa — un proceso que hasta ahora era 100% manual y sin registro.

### 9.1 De dónde viene el dato

Se alimenta del export de Capataz — **Venta y Compras → Movimientos → Gestión personalizada de ventas y
compras** — exportado a Excel. Columnas (nombres tal cual los pone Capataz): `nro_solic, cod_articu,
descripcio, desc_adic, cant_ums, UMS, cant_umc, UMC, t_comp, n_ot`. A diferencia de Órdenes de Compra o
Stock, el archivo real trae bloques separados por filas en blanco (uno por cada sector al que Compras le
pide que confirme stock — Pañol, Despacho); esas filas en blanco se saltean solas al parsear, no hace
falta que el usuario las saque a mano. `cant_umc`/`UMC` ya viene calculado por Capataz en la unidad real
de compra (kg para perfiles/chapas, litros para pintura, unidades para bulonería, etc. — no siempre
coincide con `cant_ums`/`UMS`, que es la cantidad tal como la pidió Ingeniería) — el módulo usa
`cant_umc`/`umc` como la cantidad de referencia en toda la comparativa y el resumen por proveedor,
_sin_ inventar ninguna conversión propia entre unidades. Ese `cant_umc` es un cálculo **teórico** de
Capataz (peso nominal según tabla, no lo que se termina comprando de verdad) — caso real del usuario
(2026-09-10): pidió 107,930549 KGS de una planchuela pero terminó comprando 112,62 KGS porque se vende
en barras de largo fijo, no al corte exacto. Por eso la celda "Cantidad" de la comparativa es
**editable** (`guardarCantidadEquivalente()` en `js/modules/cotizaciones.js`, mismo patrón que los
precios: acepta coma o punto, guarda al salir del campo) — corregir ahí el kg realmente comprado hace
que el Resumen por proveedor, los subtotales y el informe de reparto sumen ese número real de ahí en
más, en vez de quedarse con el estimado de Capataz. A diferencia del precio, la cantidad no se puede
dejar vacía (participa en todos los cálculos de la fila, no tiene un estado "sin cargar" válido).

**Equivalencia mts/m²↔kg editable en los dos sentidos** (pedido explícito del usuario, 2026-09-17):
`cant_ums`/`ums` (mts para perfiles, m² para chapas — la cantidad tal como la pidió Ingeniería) y
`cant_umc`/`umc` (kg, la unidad de compra) salen del mismo renglón del archivo de Capataz, así que su
cociente es un factor físico real — kg por metro lineal de ESE perfil, kg por m² de ESA chapa — no una
coincidencia de esa fila puntual. Cuando `ums` es distinto de `umc` y hay `cant_ums > 0` (con qué sacar
el factor), la celda "Cantidad" muestra **las dos cantidades editables apiladas** (mts arriba, kg abajo)
en vez de una sola: corregir cualquiera de las dos recalcula la otra sola con ese factor ("si al valor
que tiene le modifico los metros me haga el equivalente en KG y si modifico los KG me haga el
equivalente en metros", palabras del usuario). El factor se recalcula cada vez a partir de los dos
valores guardados ANTES de ese cambio — no se persiste en ninguna columna aparte, porque cada edición ya
actualiza los dos campos a la vez con ese mismo factor, así que se mantiene estable de una edición a la
siguiente sin necesitar guardarlo por separado. Si no hay `cant_ums` (o es 0) o `ums === umc` (ej.
bulonería, las dos en UNI — no hay una "equivalencia" real que mostrar), la celda vuelve a ser una sola
cantidad editable, igual que antes.

**Ajustar a barra entera** (pedido explícito del usuario, 2026-09-21): el mts que pide Ingeniería es el
neto que necesita, pero el proveedor no vende al corte exacto — vende barras de largo fijo, así que si
Ingeniería pide 68 mts y la barra es de 6 mts, hay que pedirle 72 mts (12 barras), no 68 ("no me puede
vender una barra y media, me tiene que vender dos"). Para los ítems en barra (`ums === 'MTS'` — no
aplica a chapas, `MT2`, que se compran por hoja, otra lógica que no se pidió acá), la celda Cantidad
suma un input chico **"barra mts"** + un botón **🔧** (`ajustarABarraEntera()` en
`js/modules/cotizaciones.js`): al tocarlo, redondea `cant_ums` hacia arriba al múltiplo más cercano del
largo cargado y recalcula `cant_umc` con la misma equivalencia física de siempre (reusa
`guardarCantidadEquivalente()`, no un cálculo aparte) — una regla de 3 sobre el factor kg/metro real de
ESE renglón, no una tabla de pesos externa.

**Por qué el largo de barra se carga a mano por artículo y no se autocompleta solo:** se investigó si
había un largo estándar por "tipo" de perfil (ej. "todos los ángulos vienen de 6m") pero los catálogos
reales de proveedores (Acindar, etc.) muestran que varía por la medida EXACTA, no por familia — un
ángulo chico puede venir en barras de 6m y uno más grande en 12m. No hay una tabla universal confiable
para inventar esto sin arriesgar una compra mal armada, así que Compras lo carga una vez por artículo (lo
que realmente le confirma su proveedor) y el sistema lo recuerda solo de ahí en más: se guarda en
`compras_articulos_largo_barra` (`cod_articulo` como PK, ver
[`sql/018_articulos_largo_barra.sql`](sql/018_articulos_largo_barra.sql)) — mismo criterio que
`compras_articulos_grupo` en Proveedores (sección 7.1) — así que la próxima vez que el mismo artículo
aparezca en cualquier otra solicitud, el largo ya sale precargado en el input.

### 9.2 Cómo se usa

1. **Crear una solicitud**: se le pone un nombre (para poder encontrarla después — ej. "Estructura
   agosto") y se carga el Excel de Capataz (mismo botón + instructivo de siempre, `data-instructivo=
   "cotizaciones"` en `js/main.js`). Cada fila del archivo se guarda como una fila en
   `compras_cotizaciones_items`, todas con `a_comprar = true` por defecto.
2. **Marcar lo que ya hay en stock** (reemplaza el amarillo del Excel): en la ficha de la solicitud, se
   tildan filas (tocar y arrastrar, mismo patrón que Clasificar Artículos en Proveedores) y se aplica en
   bloque "✅ Marcar A comprar" / "🚫 Marcar NO comprar" — o se toca el badge Sí/No de una sola fila para
   cambiarla individualmente. El checkbox "Ocultar los que no se compran" (tildado por defecto) enfoca
   la tabla en lo que realmente hay que cotizar.
3. **Dividir en Pañol / Despacho**: el usuario confirmó que la división de una solicitud es siempre esa
   (no hace falta texto libre) — tildando filas y tocando "🏷️ Marcar como Pañol" / "🏷️ Marcar como
   Despacho" (o "↩️ Quitar bloque" para volver a "General") se les asigna el bloque. Arriba de la tabla,
   en vez de un `<select>`, hay **tabs** (`#cot_f_bloque_tabs`, `poblarTabsBloque()`) — uno por bloque,
   con la cantidad de ítems entre paréntesis — que pasan a filtrar tanto las filas como los proveedores
   invitados/columnas de precio de ahí en más. Solo se muestra el tab de un bloque si tiene al menos un
   ítem: al abrir una solicitud nueva (todo en `bloque = ''`) solo aparece "General", y en cuanto se
   etiqueta el primer ítem como Pañol o Despacho ese tab aparece solo (los botones "Marcar como..."
   siempre están disponibles, aunque el tab correspondiente todavía no exista). Antes de etiquetar nada,
   todo vive en el bloque implícito "General (sin dividir)" (`bloque = ''`), así que este paso es
   opcional — solo hace falta cuando la solicitud realmente mezcla cosas que van a proveedores
   distintos, que es el caso más común (ver 9.4).
4. **Filtrar por rubro** (dentro del bloque elegido): una misma solicitud/bloque puede seguir mezclando
   rubros (perfiles, bulonería, pintura...). El selector "Todos los rubros" (`poblarFiltroGrupo()`)
   filtra las filas visibles por el grupo/rubro ya asignado a cada artículo en Proveedores → Clasificar
   artículos (`compras_articulos_grupo`, mismo dato, no se reclasifica nada acá) — solo lista los rubros
   que efectivamente aparecen en ESTA solicitud, más "Sin clasificar" si corresponde. A diferencia del
   bloque, este filtro **no** separa proveedores/columnas, solo enfoca las filas.
5. **Invitar proveedores** (al bloque que se esté viendo): buscador con autocomplete que sugiere tanto
   los proveedores con ficha propia (`compras_proveedores`) como los "detectados" que solo aparecen en
   Órdenes de Compra pero todavía no tienen ficha (mismo concepto que en Proveedores → Catálogo/Agenda,
   ver 7.2) — no admite texto libre, porque invitar necesita un `id` real para guardar el vínculo. Al
   elegir uno detectado, se le crea la ficha en el momento (mismo criterio que "➕ Completar datos" en
   Proveedores → Catálogo) y recién ahí se invita. Esto importa en la práctica: la mayoría de los
   proveedores reales de CIMOMET/CO.MO.ING todavía no tienen ficha propia (solo un puñado la tiene), así
   que sin esto la lista de "para invitar" hubiera quedado casi vacía. Cada proveedor agregado suma una
   columna a la tabla, pero solo mientras se esté viendo el bloque al que fue invitado. El nombre en el
   encabezado se trunca con "…" (algunos son largos, ej. "VAZQUEZ HNOS SRL (FERRETERA SAN LUIS)" —
   pasarle el mouse por encima muestra el nombre completo). La tabla comparativa tiene su propio scroll
   vertical (`#cot-tabla-wrap`, `max-height:65vh`) con el encabezado fijo arriba (`position:sticky`) —
   necesario porque un `position:sticky` contra el scroll de toda la página no sostiene de forma
   confiable cuando el mismo contenedor también scrollea horizontalmente (la tabla puede tener muchas
   columnas de proveedores); por eso se le dio altura acotada y scroll propio en vez de dejar crecer la
   tabla con el resto de la página. También hizo falta `border-collapse:separate` en esa tabla puntual —
   con `collapse` (el default heredado de la regla `table` general) el sticky de las celdas del header no
   funciona en Chrome.
6. **Cargar precios**: un input **de texto** (no `type="number"`, ver más abajo por qué) por celda
   (artículo × proveedor), se guarda solo al salir del campo (sin botón "Guardar"), aceptando coma o
   punto decimal (`guardarPrecio()`/`recalcularTotalModalProveedor()` reemplazan `,` por `.` antes de
   `Number()` — el resto de la app siempre MUESTRA los precios con coma, así que tiene sentido aceptarla
   también al tipear). Es texto y no número a propósito: un `type="number"` deja que las flechas de
   incremento (visibles o no) y las teclas ↑/↓ del teclado le resten/sumen el `step` (0.01) al valor con
   un solo click o toque de tecla sin que se note — bug real reportado por el usuario ("pongo 4500 y
   después queda 4.499,99"), típico de mover el foco entre celdas al estilo planilla de cálculo (con el
   mouse cerca de la flechita, o con la tecla ↓ por costumbre) — con texto libre esa clase entera de bug
   deja de poder pasar. El selector $/U$S del encabezado de cada proveedor es el **default para
   el próximo precio que se cargue** en esa columna, no una propiedad fija de la columna — si se cambia
   a mitad de carga, un mismo proveedor puede terminar con precios en más de una moneda (caso real
   detectado 2026-08-28). Por eso cada celda con precio muestra su propio símbolo ($ / U$S) a la
   izquierda del número, **el de la moneda realmente guardada en esa celda**, no el del selector — así se
   nota a simple vista si una celda quedó cargada en la moneda equivocada. Si una columna termina con
   monedas mezcladas, su encabezado muestra un ⚠️ de aviso; si es una fila la que terminó con precios en
   monedas distintas entre sí (por eso no tiene ganador sugerido ni resaltado, ver `cheapestForItem()`),
   la celda de Ganador de esa fila muestra su propio aviso "⚠️ monedas mezcladas" — sin esto no se notaba
   por qué esa fila puntual no sugería ganador solo. **Corregir una columna entera**
   (`cambiarMonedaColumna()`): cambiar el selector del encabezado nunca pisa en silencio lo ya cargado
   (a propósito, ver el caso real de monedas mezcladas de más arriba) — pero si el selector quedó sin
   cambiar antes de arrancar a tipear y toda la columna terminó en la moneda equivocada (caso real
   reportado por el usuario, 2026-08-31), corregir precio por precio es tedioso. Al cambiar el selector,
   si hay precios ya guardados del bloque actual en la moneda vieja, un `confirm()` explícito ofrece
   re-etiquetarlos todos de una — solo cambia la columna `moneda`, nunca el número cargado — y recalcula
   el ganador automático de esas filas. Como el `change` del `<select>` no dispara si ya estaba en la
   moneda elegida (típico si se lo cambió antes pero se rechazó el `confirm()`, o si quedó así de una
   sesión anterior), cada columna tiene además un botón fijo **"🔁 corregir"** que dispara la misma
   revisión a mano sin depender de tocar el selector — mismo botón ("🔁 corregir cargados") en el
   selector de moneda del modal `mCOTPROV` (una sola columna). `renderTablaComparativa()` reconstruye toda
   la tabla en cada guardado (para recalcular resaltados/ganador), lo que le hacía perder el foco a la
   celda siguiente si el usuario ya había clickeado ahí para seguir cargando — la función guarda qué
   celda estaba enfocada (y lo que llevaba tipeado) antes de reconstruir el HTML y se lo restaura al
   input nuevo después, así se puede tipear precio tras precio sin tener que clickear dos veces cada
   celda. **Enter/Tab bajan a la celda de abajo** (`enfocarPrecioAdyacente()`): en vez del comportamiento
   nativo (Enter no hace nada en un input suelto, Tab salta a la columna siguiente), ambas teclas mueven
   el foco a la misma columna de la fila de abajo (Shift+Enter/Shift+Tab suben) — pedido explícito del
   usuario para cargar una lista larga de precios sin tocar el mouse, al estilo de completar una columna
   en una planilla de cálculo. Mover el foco con `.focus()` ya dispara el `blur`/`change` de la celda
   anterior solo, así el guardado (`guardarPrecio()`) sigue pasando igual que al clickear afuera; si no
   hay celda siguiente (última fila), hace `blur()` para guardar igual. Mismo helper reusado en el modal
   `mCOTPROV` (carga enfocada por proveedor, ver más abajo), donde "abajo" es simplemente el siguiente
   ítem de la lista (una sola columna). **Carga enfocada por proveedor**: tocando el nombre de un proveedor en el encabezado (subrayado
   punteado, cursor de mano) se abre el modal `mCOTPROV` — la misma lista de ítems pero en una sola
   columna fija (sin el resto de los proveedores al lado, que "corren" la vista) con un **Total en vivo**
   abajo, para poder chequear que se está transcribiendo bien la cotización que mandó ese proveedor
   contra el total que figura en su presupuesto. El total se recalcula al tipear (evento `input`, sin
   esperar el guardado) usando la moneda elegida en el modal para todas las filas por igual — el guardado
   real en Supabase sigue pasando en el evento `change` (blur), igual que en la comparativa, y ambas
   vistas comparten el mismo `PRECIOS`/`guardarPrecio()` así que lo que se carga en el modal ya aparece
   en la comparativa al cerrarlo (botón "Listo, comparar").
7. **Comparar y elegir**: la celda más barata de cada fila se resalta en verde, y una columna "Ganador"
   sugiere automáticamente al proveedor más barato apenas hay precios cargados. **El resaltado y la
   sugerencia automática solo se calculan cuando todos los precios de esa fila están en la misma moneda**
   — si hay ARS y USD mezclados en una misma fila, no se resalta ni se sugiere nada (comparar eso a ojo,
   no se inventa una cotización de cambio). Arriba de la tabla hay un campo opcional **"Tipo de cambio"**
   (`tipoCambioActual()`) — puramente de referencia, no se guarda en ningún lado (se pierde al recargar
   la página) y **no** participa en el resaltado/sugerencia automática (esa regla se mantiene: no se
   inventa una cotización de cambio para decidir). Sirve solo para mostrar, en una línea chica abajo de
   cada celda en dólares, a cuánto equivale en pesos ("≈ $X"), y en el panel "Resumen por proveedor", si
   un proveedor terminó con monto en más de una moneda, una línea extra "≈ Total combinado" con la suma
   de todo convertido a pesos — para poder chequear de un vistazo si conviene sin tener que sacar la
   cuenta a mano.
8. **Repartir para cumplir mínimos de compra**: acá está el punto que motivó el módulo — muchas compras
   tienen mínimos por proveedor (no se puede comprar 100kg a uno, 10 a otro, 2000 a otro), así que la
   decisión final no siempre es "el más barato por artículo". Por eso el "Ganador" de cada fila se puede
   **elegir a mano** (no solo aceptar la sugerencia): en cuanto se cambia a mano, esa fila queda con
   `ganador_manual = true` y deja de recalcularse sola al cargar más precios (con un botón 🔄 para volver
   a automático si hace falta). El panel **"Resumen por proveedor"**, debajo de la tabla, se recalcula en
   vivo cada vez que cambia un ganador: por cada proveedor invitado muestra cuántos ítems ganó y la
   cantidad total en las unidades reales del archivo (ej. "1.245 KGS · 80 LTS · 26 UNI" — sin convertir a
   una unidad común) más el monto total agrupado por moneda. Es el número que hay que mirar para decidir
   "le saco este ítem a Fulano y se lo doy a Mengano para llegar al mínimo de kg que negocié con él". Solo
   suma ítems con `a_comprar = true` — cargar un precio en un ítem marcado "No" (ya hay stock) igual le
   puede quedar un ganador sugerido/elegido, pero no tiene sentido que ensucie el resumen ni el botón
   "Confirmar compra" de ese proveedor (bug real reportado por el usuario, 2026-09-02: antes tenía que
   borrar el ganador a mano en cada ítem "No" para que no sumara) — el ganador queda guardado igual, por
   si el ítem se vuelve a marcar "Sí" más adelante.
9. **Confirmar la compra**: el botón "✅ Confirmar compra (N)" en cada tarjeta del resumen cierra la
   decisión para ese proveedor — pasa los ítems que ganó (los que todavía no estaban confirmados) a
   `confirmado = true` y los oculta de la comparativa (ya están resueltos, no hace falta seguir
   mirándolos ahí; `itemsVisibles()` los filtra siempre, sin checkbox para mostrarlos de nuevo). No
   depende de que haya sido el más barato — sirve para el caso real "a este proveedor, a pesar de los
   precios, ya le compré": confirmás igual aunque el resaltado automático sugiriera a otro. Cantidad/
   Monto de la tarjeta siguen sumando TODOS los ítems ganados (confirmados o no) — el número entre
   paréntesis del botón es solo cuántos faltan confirmar. Cuando no queda ningún ítem "a comprar" sin
   confirmar en NINGÚN bloque de la solicitud, esta se cierra sola (`verificarCierreAutomatico()`,
   mismo `estado = 'CERRADA'` que el botón manual — se puede reabrir igual si hace falta corregir algo).
   Retaguear un ítem a otro bloque o desinvitar a su proveedor ganador resetea `confirmado` a `false`
   además de limpiar el ganador (ver 9.3/9.4), para que un ítem sin ganador nunca quede marcado como
   confirmado. **Deshacer una confirmación puntual** (`deshacerConfirmacion()`): caso real del usuario —
   el proveedor ganador de un ítem resultó no tener stock de eso después de todo, y hace falta volver a
   ver quién más lo había cotizado. El checkbox **"Mostrar confirmados"** (`cot_f_mostrar_confirmados`,
   desmarcado por defecto — mismo criterio que "Ocultar los que no se compran") trae de vuelta a la
   comparativa los ítems ya confirmados, marcados con fondo gris y un "✅ Confirmada ↩️"; el botón ↩️
   deshace la confirmación de ESE ítem puntual (no del proveedor entero) sin borrar el ganador ni los
   precios ya cargados — si el mismo proveedor sigue siendo la mejor opción, no hay que volver a
   elegirlo, solo queda "pendiente" de nuevo. Si la solicitud ya se había cerrado sola, se reabre
   automáticamente (mismo criterio inverso a `verificarCierreAutomatico()`) para no dejarla marcada
   CERRADA con un ítem sin confirmar adentro.
10. **Condición de pago** (pedido del director financiero, 2026-09-10): cada tarjeta del resumen tiene un
    `<select>` de condición de pago (mismas opciones fijas que ya usa Notas de Pedido — Contado
    F/Factura, 7/15/30/45/60/90 días, estas últimas dos sumadas el mismo día a pedido del usuario — ver
    8.3, para no inventar una lista nueva) que se guarda por proveedor
    invitado (`guardarCondicionPago()`, columna `condicion_pago` en `compras_cotizaciones_proveedores`,
    ver `sql/016_cotizaciones_condicion_pago.sql`) — no por ítem ni por precio, porque es una condición
    que se negocia con el proveedor para todo el bloque, no artículo por artículo.

**Exportar para cotizar** (`📥 Exportar para cotizar (.xlsx)`, `exportarParaCotizar()`): baja exactamente
lo que se está viendo en la tabla (mismos filtros de bloque/rubro/"ocultar los que no se compran" que la
pantalla — mismo criterio que el export de Stock → A comprar) a un Excel con columnas Código / **OT** /
Descripción / Detalle / **Cantidad** / **Unidad** (en la unidad original de la solicitud, `cant_ums`/
`ums` — ej. metros para perfiles, m2 para chapas) / **Equivalencia** / **Unidad** (en unidad de compra,
`cant_umc`/`umc` — ej. kg). La columna **OT** (`formatOTExport()`, misma lógica que el informe de
reparto — ver más abajo — sin los ceros a la izquierda que trae Capataz) se agregó a pedido del usuario
(2026-09-17) para saber de un vistazo a qué orden de trabajo corresponde cada línea de este Excel. Dos
columnas repiten el encabezado "Unidad" a propósito (pedido explícito del usuario, layout exacto) — como
un objeto JS no puede tener dos claves iguales, se arma con `XLSX.utils.aoa_to_sheet()` (array de filas)
en vez de `json_to_sheet()`. Las filas salen en el mismo orden que la tabla en pantalla — alfabético por
**Descripción** (`itemsVisibles()` ordena así siempre, no solo al exportar; pedido explícito del usuario,
es más fácil de recorrer tanto en pantalla como en el Excel que en el orden de carga original de
Capataz). Es la lista ya desglosada (sin lo que hay en stock, ya separada por bloque/rubro) que se le
manda al proveedor para que cotice — reemplaza el paso manual de armar ese Excel a mano desde el
original de Capataz.

**Emitir informe de reparto** (botón al final de la ficha, `emitirInformeReparto()`): el cierre del
bloque una vez decididos los ganadores — un Excel con **una hoja por proveedor** (solo los que ganaron
al menos un ítem) con lo que le corresponde comprarle (Código/**OT**/Descripción/Detalle/Cantidad/Unidad/
Precio unitario/Moneda/Subtotal/**Estado** — la lista lista para armarle la Nota de Pedido u OC a ese
proveedor) más una hoja **"Sin ganador"** con lo que quedó sin asignar (mismas columnas que "Exportar
para cotizar" más la columna OT, sin precio — es lo que todavía hay que resolver antes de cerrar el
bloque). A diferencia de "Exportar para cotizar", el alcance acá es **todo** el bloque con
`a_comprar = true` — no los filtros de rubro/"ocultar los que no se compran" de la pantalla en ese
momento, porque el informe tiene que cubrir el bloque completo. Los nombres de hoja se sanitizan (Excel
no permite `[ ] * / \ ?` y los trunca a 31 caracteres) y se desambiguan si dos quedan iguales tras el
recorte. La columna **OT** (`formatOTExport()`, misma lógica que `formatOT()` del módulo OT —
duplicada a propósito entre módulos, mismo criterio que `agruparOCPorOrden()` en Notas de Pedido, ver
8.2 — sin los ceros a la izquierda que trae Capataz) se agregó a pedido del usuario para saber de un
vistazo a qué orden de trabajo corresponde cada línea sin tener que cruzar con Cotizaciones o el módulo
OT. La columna **Estado** marca "✓ OC Generada" (texto renombrado a pedido del usuario, 2026-09-10 —
antes decía "Compra confirmada") en las filas de un ítem ya cerrado con "✅ Confirmar compra" (ver 9.2
punto 9) — pedido explícito del usuario, para que quede claro en el Excel
qué ya se compró de verdad y qué todavía es solo el ganador de la comparativa. **Precio unitario y
Subtotal se redondean a 2 decimales** al armar cada fila (antes salían con la precisión completa del
cálculo interno — `precio × cant_umc` — ilegible en el Excel real, ej. "532,745247"); el total por
moneda se sigue acumulando con el subtotal SIN redondear fila por fila, para no arrastrar el redondeo de
cada línea al total, y recién se redondea a 2 decimales la fila de TOTAL. Al final de cada hoja de
proveedor se agrega esa fila **TOTAL** (en la columna Descripción) con la suma de la columna Subtotal —
una fila por moneda si ese proveedor terminó con precios en más de una (`TOTAL (ARS)` / `TOTAL (USD)`,
mismo criterio de no mezclar monedas que el resto del módulo, ver 9.2 punto 7).

**Hoja "Consolidado"** (agregada a pedido del director financiero, 2026-09-10, que recibía este mismo
Excel de Compras para su circuito de pagos): a él no le interesa el detalle artículo por artículo (eso
es lo que necesita Compras para armar la OC) sino **a quién, cuánto, con qué condición de pago y para
qué OT** — así que es una hoja aparte, no un reemplazo de las hojas por proveedor. **Una sola fila por
proveedor**, con todas las OT que cubre ese proveedor juntas en una sola celda separadas por coma. La
primera versión agrupaba por proveedor+OT (una fila por combinación) pero el director la rechazó al
toque ("consolidame por proveedor, al pepe tener abierto por varios renglones", 2026-09-11) — factura
junto, no le sirve verlo desglosado por OT. Solo se abre en más de una fila por proveedor si terminó con
montos en **más de una moneda** (no se puede sumar ARS+USD en un mismo total, mismo criterio de siempre
— ver 9.2 punto 7), algo que no pasó todavía en ningún caso real. Orden de columnas y encabezados
(**Proveedor / $ / Monto / OT / Cond.**, ese orden y esos textos exactos) copiados tal cual de una
maqueta que devolvió el director el mismo día (2026-09-11) — "Monto" se escribe como texto con el signo
"$" genérico (no "U$S"/"$" según la moneda real, eso ya lo dice la columna "$" de al lado) porque así lo
pidió él, no como número plano. Se arma en el mismo recorrido que ya arma las hojas por proveedor,
sumando el subtotal exacto de cada ítem ganado bajo la clave proveedor+moneda. Se agrega **al final**
del workbook pero se mueve al frente (`wb.SheetNames.unshift(wb.SheetNames.pop())`) para que sea la
primera pestaña que se ve al abrir el archivo — es la que le importa a quien lo recibe desde afuera de
Compras, las hojas de detalle quedan atrás para quien arma la OC.

**Seguimiento por OT:** vive en su propio módulo (**OT**, ver sección 10) y no acá — nació como una
sub-vista de Cotizaciones (2026-09-02) pero el usuario pidió pasarlo a un módulo de nav propio con
tarjetas por OT y gráficos de detalle en vez de una tabla más. El dato de OT (`n_ot`, columna 9.1) sigue
viviendo en `compras_cotizaciones_items` — el módulo OT solo lo lee, no agrega tablas nuevas.

**Aviso de artículo duplicado entre solicitudes** (pedido del usuario, 2026-09-16): caso real — el mismo
artículo (`CAÑO3/8`, mismas cantidades) terminó cargado igual en dos solicitudes abiertas distintas
("URG" y "Varias OT"), normalmente porque la misma solicitud de Capataz se terminó importando dos veces
en la app, con nombre distinto cada vez — con riesgo de cotizar o comprar el mismo material dos veces
por separado sin que nadie se diera cuenta. `buscarDuplicadosEntreSolicitudes()` en
`js/modules/cotizaciones.js` busca, para un conjunto de ítems, si ya existen en OTRA solicitud con
`estado = 'ABIERTA'` como ítem `a_comprar = true` y `confirmado = false` (si ya se confirmó esa compra o
la solicitud se cerró, no es un duplicado activo, es historial — no avisa). Dos criterios ajustados tras
iterar sobre la primera versión:
- **El criterio es `nro_solicitud`** (`claveDuplicado()`) — el número de solicitud que ya trae Capataz
  en el export (columna `nro_solic`, ver 9.1), **no** el nombre de la solicitud en esta app. Se probó
  primero comparar por artículo+OT, pero el propio usuario señaló el problema: "a veces se vuelve a
  pedir el mismo perfil varias veces pero es para distintas OT o a veces es hasta para la misma OT" —
  pedir el mismo artículo dos veces (incluso para la misma OT) puede ser una necesidad real distinta, no
  un error de carga. Un `nro_solicitud` repetido en otra solicitud ABIERTA, en cambio, **siempre**
  significa que esa misma solicitud de Capataz ya está cargada en otro lado — Capataz nunca reutiliza ese
  número para un pedido distinto ("es lo más sencillo... si un número de solicitud se repite significa
  que esa cotización ya está cargada", palabras del usuario). Un ítem sin `nro_solicitud` no se compara,
  no hay con qué.
- **Siempre gana la solicitud más vieja** ("que se tome siempre la más vieja como la legal", pedido
  explícito): antes se avisaba por igual en las dos solicitudes, sin que ninguna quedara "limpia". Ahora
  se compara `compras_cotizaciones.created_at` — el apartado por duplicado solo aparece en la(s)
  solicitud(es) más NUEVA(s); la más vieja de todas las que tienen ese `nro_solicitud` nunca se marca a
  sí misma, sin importar desde cuál de las dos se la esté mirando. Al cargar un archivo nuevo no hace
  falta comparar fechas — por definición, cualquier coincidencia ya existente es más vieja que la
  solicitud que se está por crear.

Se usa en dos momentos, sin bloquear nunca la carga a propósito — bloquear de plano rechazaría un
archivo legítimo entero por una sola solicitud de Capataz repetida; mejor avisar y dejar decidir:
1. **Al cargar un archivo nuevo** (`onArchivoCotizacion()`): el `confirm()` de siempre suma un párrafo
   listando qué números de solicitud del archivo ya están cargados en qué otra solicitud, antes de crear
   la solicitud — mismo criterio que el aviso de "OC desaparecidas" en Órdenes de Compra (ver 5.2),
   avisar antes de un cambio en vez de un chequeo silencioso.
2. **Dentro de una solicitud ya abierta** (`abrirDetalle()`, guardado en `DUPLICADOS`): un ítem
   duplicado activo (`esDuplicadoActivo()`) **no cuenta en su bloque real** (General/Pañol/Despacho) ni
   en su comparativa/resumen/informe — pedido explícito del usuario tras la primera versión (que solo
   ponía un ⚠️ al lado del código, sin sacarlo del bloque): "necesitaría que no lo cuente". En vez de eso
   queda apartado en un **pseudo-bloque propio**, el tab **"⚠️ Duplicado (N)"** (`BLOQUE_DUPLICADOS`,
   constante que nunca se guarda en la columna `bloque` real — solo existe como modo de vista), que
   aparece junto a General/Pañol/Despacho solo si hay algo apartado. Ese tab reemplaza toda la vista
   normal por un listado simple (`renderTablaDuplicados()`: Código/Descripción/N° de solicitud/Cantidad/
   "También cargada en") — no tiene sentido invitar proveedores ni cargar precios para algo que todavía
   no se decidió comprar acá, así que esas secciones (`#cot_seccion_invitados_bulk`,
   `#cot_seccion_resumen`) se ocultan mientras el tab esté activo. Repetir el mismo código dos veces
   **dentro de la misma solicitud** (dos partidas distintas del mismo artículo) es normal y no cuenta
   como duplicado — el apartado es solo entre solicitudes distintas.

**Aceptar un duplicado igual (caso excepcional)** — pedido explícito: "SOLO EN CASO EXCEPCIONAL que me
deje aceptarlo". El botón "✅ Aceptar de todas formas" de cada fila del tab Duplicado
(`aceptarDuplicado()`) pide confirmación explícita y, si se acepta, marca
`duplicado_aceptado = true` en `compras_cotizaciones_items` (columna nueva, ver
`sql/017_cotizaciones_duplicado_aceptado.sql`) — desde ese momento el ítem vuelve a contar en su bloque
real como cualquier otro, para siempre (no se resetea solo si la otra solicitud se cierra después).

### 9.3 Modelo de datos — `sql/013_cotizaciones.sql` + `sql/014_cotizaciones_bloques.sql` + `sql/015_cotizaciones_confirmado.sql` + `sql/016_cotizaciones_condicion_pago.sql` + `sql/017_cotizaciones_duplicado_aceptado.sql` + `sql/018_articulos_largo_barra.sql`

Cinco tablas (ver `sql/schema.sql` para el estado final), sin RLS (mismo criterio que el resto de
`compras_*`):

- `compras_cotizaciones` — la solicitud en sí: nombre, fecha, estado (`ABIERTA`/`CERRADA` — un flag
  simple para filtrar, no bloquea edición al cerrarla; se pone en `CERRADA` con el botón manual o solo,
  cuando no queda ningún ítem a comprar sin confirmar, ver 9.2 punto 9).
- `compras_cotizaciones_items` — una fila por artículo del Excel importado, con `a_comprar`, `bloque`
  (columna de texto pero en la práctica solo tres valores: `''` = "General (sin dividir)" antes de
  clasificar, `'Pañol'` o `'Despacho'` — el usuario confirmó que la división es siempre esa, así que la
  UI ofrece un select fijo + dos botones en vez de texto libre, ver 9.2), el vínculo al ganador
  (`ganador_proveedor_id` + `ganador_manual`, ver 9.2) y `confirmado` (compra ya decidida a ese
  proveedor — se oculta de la comparativa, ver 9.2 punto 9). `duplicado_aceptado` (ver 9.2, aviso de
  duplicado entre solicitudes) es la excepción explícita a mano para un ítem que se decidió cotizar/
  comprar también acá a pesar de estar duplicado en otra solicitud abierta.
- `compras_cotizaciones_proveedores` — la lista de proveedores invitados, **por bloque**: un proveedor se
  invita a un bloque puntual de la solicitud, no a toda la solicitud entera (`unique(cotizacion_id,
  proveedor_id, bloque)` — permite invitar al mismo proveedor a más de un bloque si hiciera falta).
  Decisión tomada con el usuario: se invita una lista fija a mano por bloque, no se sugiere
  automáticamente por rubro/grupo de Proveedores (ver 9.4). `condicion_pago` (texto, ver 9.2 punto 10)
  también vive acá, no por ítem/precio — es una condición del bloque completo con ese proveedor.
- `compras_cotizaciones_precios` — el precio cargado por cada proveedor invitado para cada artículo
  (`unique(item_id, proveedor_id)`, sin columna de bloque propia — se resuelve solo, porque el `item_id`
  ya define a qué bloque pertenece), con su propia `moneda` (aunque la UI la fija por columna, ver 9.2).
- `compras_articulos_largo_barra` — `cod_articulo` como PK (un largo de barra por artículo, igual
  criterio que `compras_articulos_grupo`), independiente de cualquier solicitud puntual: cargado una vez
  para un artículo, queda disponible para cualquier otra cotización futura que tenga ese mismo artículo
  (ver 9.1, "Ajustar a barra entera").

### 9.4 Decisiones tomadas y alcance actual

- **La solicitud se divide en "bloques" — siempre Pañol o Despacho**: nació de un caso real — una misma
  solicitud casi siempre mezcla artículos que en la práctica cotizan proveedores completamente distintos
  (ej. lo que confirma Pañol lo cotiza un proveedor, lo que confirma Despacho otro; "eso va a pasar
  siempre o en la mayoría de los casos", palabras del usuario). El usuario confirmó explícitamente que la
  división **siempre** es esa (no un texto libre variable) — por eso, en vez de un input de texto, la UI
  tiene tres botones fijos ("🏷️ Marcar como Pañol" / "🏷️ Marcar como Despacho" / "↩️ Quitar bloque") sobre
  los ítems tildados (tocar y arrastrar). Los tres bloques posibles son siempre los mismos (General/
  Pañol/Despacho, hardcodeados en el JS, no se pueblan desde ninguna tabla), pero arriba de la tabla se
  muestran como **tabs** en vez de un `<select>`, y **el tab de un bloque aparece si tiene algún ítem O
  algún proveedor invitado** (`poblarTabsBloque()`) — pedido explícito del usuario, para no ver
  "Despacho" vacío en una solicitud que todavía no se dividió; en cuanto se etiqueta el primer ítem con
  ese bloque, su tab aparece solo. **Bug real corregido (2026-09-03):** al principio el tab solo se
  fijaba en si el bloque tenía ítems — si se reetiquetaban TODOS los ítems de "General" a "Despacho", el
  tab de General desaparecía junto con los proveedores que se le habían invitado ahí, sin ítems de por
  medio, dejándolos invisibles para siempre (el usuario lo reportó como "tengo proveedores pero no
  aparece ninguno" — la lista mostraba 5 invitados en total mientras Despacho, el único tab visible, no
  tenía ninguno). Por eso ahora también cuenta los proveedores invitados a la hora de decidir qué tabs
  mostrar, no solo los ítems. El bloque filtra tanto las filas visibles como la lista de proveedores
  invitados/columnas de precio, así cada bloque funciona como su propia mini-cotización dentro de la
  misma solicitud. Retaguear un ítem a otro bloque le resetea el ganador
  (`ganador_proveedor_id`/`ganador_manual`), porque el proveedor ganador del bloque viejo puede no estar
  invitado al bloque nuevo.
- **Invitar proveedores es manual, no por rubro**: se evaluó sugerir proveedores automáticamente según
  el grupo/rubro de los artículos de la solicitud (reusando la clasificación de Proveedores, sección 7)
  pero el usuario prefirió elegir a mano — es lo más parecido a cómo ya arma la lista hoy, y evita una
  UI más compleja donde cada ítem podría tener candidatos distintos. El filtro de **rubro** (`cot_f_grupo`,
  ver 9.2 punto 4) sigue existiendo aparte de bloque — es un segundo filtro, más fino, dentro del bloque
  que se esté mirando (ej. dentro de "Despacho" ver solo "Bulonería").
- **Sin envío de mail todavía**: el módulo no manda nada a los proveedores — invitar es solo un registro
  interno. El email del contacto (Proveedores, sección 7.2) sigue disponible por si más adelante se arma
  un envío real.
- **Confirmar compra por proveedor, no por ítem individual**: se evaluó un checkbox de confirmar por
  fila, pero el caso real del usuario es "ya le compré a este proveedor" como decisión de bloque
  completo — un botón por tarjeta en el resumen es más rápido que tildar ítem por ítem. Confirmar no
  exige que ese proveedor haya sido el más barato (el usuario puede tener mínimos de compra u otros
  motivos para comprarle igual, mismo espíritu que `ganador_manual`).
- **El cierre automático de la solicitud es reversible**: se decidió que se cierre sola (no solo avisar)
  cuando no queda nada sin confirmar, para no depender de que el usuario se acuerde de tocar "Cerrar
  solicitud" — pero sigue siendo un simple `estado`, no un lock: se puede reabrir con el mismo botón de
  siempre si hace falta corregir algo después.
- **Sin vínculo con Orden de Compra ni con Nota de Pedido todavía**: elegir un "ganador" por artículo no
  genera ninguna OC/NP automáticamente — es una decisión registrada, el paso de comprar de verdad sigue
  siendo manual (Tango o una Nota de Pedido aparte). Podría conectarse más adelante si hace falta.
- **`Cotizar.xlsx`** (el archivo de ejemplo real que se usó para diseñar el parseo) queda en la raíz del
  repo pero en `.gitignore` — tiene datos reales de compras/proveedores/precios, mismo criterio que
  `Excels/` (ver 5.5/6.5).

## 10. Módulo: OT `[DETALLADO]`

Módulo de nav propio (grupo colapsable "🏷️ OT", como Flota/OC/Stock/Proveedores), pedido explícito del
usuario (2026-09-02) para poder seguir el gasto de un trabajo puntual (orden de trabajo) con tarjetas
por OT y gráficos de detalle — no es una tabla nueva, **lee y reagrupa los mismos datos de Cotizaciones**
(`js/modules/ot.js`, sin tablas ni migraciones propias).

### 10.1 De dónde sale el dato

El número de OT **no sale de Tango** — `compras_oc_lineas` (el export de OC de Tango, sección 5) no trae
ningún campo de OT — sino de la columna `N_OT` que ya trae el export de Capataz con el que se arma cada
solicitud de **Cotizaciones** (sección 9.1), guardada en `compras_cotizaciones_items.n_ot`. Por eso el
seguimiento por OT solo puede cubrir lo que pasa por una solicitud de Cotizaciones — no las compras que
van directo por Tango sin pasar por acá. El usuario lo aceptó como punto de partida ("me gustaría que
todas las OC tengan una OT asignada pero tendría que ver...") en vez de esperar a tener OT en el 100% de
las compras; también aclaró que **"OT1" es un cajón para compras de planta en general**, no un trabajo
puntual. Al principio el módulo no le daba ningún tratamiento especial (era una OT más, que concentraba
más monto que el resto a propósito) pero el usuario pidió después excluirla del desglose por OT
(2026-09-03) — mezclada con las OT reales no sirve para comparar. `esOT1()` en `js/modules/ot.js`
descarta cualquier ítem cuyo `n_ot` normalice a "1" (con o sin ceros a la izquierda) antes de agruparlo
(`agruparPorOT()`), así que no aparece ni en "Por OT" ni en el Ranking ni cuenta para "OTs con datos" —
sus ítems siguen sumando igual en los KPIs/dona combinados del Dashboard, que no pasan por esa
agrupación por OT.

### 10.2 La idea central: distinguir comprado de asignado de stock

El pedido explícito del usuario fue diferenciar, dentro de cada OT, **qué se compró de verdad** de **qué
se cubrió con stock existente** (el "purgado" que se hace en cada solicitud de Cotizaciones marcando
ítems "No" porque ya hay — ver 9.2 punto 2), en vez de mezclar ambos en un solo total. `clasificarItemOT()`
en `js/modules/ot.js` clasifica cada ítem en tres orígenes:

- **`comprado`** — `a_comprar = true` y tiene un ganador elegido. Suma cantidad (en su unidad real,
  kg/lts/uni, sin convertir) y monto por moneda (mismo criterio de Cotizaciones de no mezclar ARS/USD en
  una misma suma, ver 9.2 punto 7).
- **`stock`** — `a_comprar = false` (ya había stock). Suma cantidad en su unidad real pero **nunca monto**
  — no se le compra a nadie.
- **`pendiente`** — `a_comprar = true` pero todavía sin ganador elegido. No cuenta en ninguno de los dos
  totales anteriores, para no inflar "comprado" ni "de stock" con algo que todavía no se definió — se
  muestra aparte para que no se pierda de vista que falta resolverlo.

Los ítems sin OT (la columna `N_OT` de Capataz no siempre viene completa) se agrupan aparte como
**"(Sin OT)"** en vez de perderse del total, para que se note que faltan etiquetar.

### 10.3 Vistas

- **Dashboard** (`ot-dash`) — 4 KPIs (OTs con datos, ítems comprados, ítems de stock, ítems sin OT,
  estos dos últimos sobre el total de ítems sin excluir OT1 — ver 10.1) + **un gráfico de dona Comprado
  vs. de stock por unidad** (todas las OT juntas, ver 10.3 más abajo) + un **Ranking de OTs por monto
  comprado** (barras horizontales, top 10, etiquetas ya pasadas por `formatOT()` — sin esto mostraban el
  N° crudo con ceros, ej. "000000000596" en vez de "596"; OT1 nunca aparece acá, ver 10.1). Acceso
  rápido a "Ver por OT".
- **Por OT** (`ot-cards`) — grilla de **tarjetas**, una por OT (`.ot-card`, clickeable), cada una con sus
  números de comprado (ítems + cantidad + monto) y de stock (ítems + cantidad) de un vistazo, más un
  buscador por OT. El N° de OT se muestra **sin los ceros a la izquierda** que trae el export de Capataz
  (`000000000596` → `596`, `formatOT()` en `js/modules/ot.js`) — solo se recorta si es puramente
  numérico, así que "OT1" (el cajón de compras de planta en general, ver 10.1) queda tal cual; el dato
  crudo (con ceros) se sigue usando para agrupar/filtrar, `formatOT()` es solo de presentación. Las
  cantidades por unidad (`chipsUnidades()`) siempre muestran **KGS primero, aunque sea "0 KGS"** — es la
  unidad de referencia del rubro (estructuras/tanques, la mayoría del material se compra por peso), así
  que conviene verla siempre para comparar entre OT en vez de que aparezca o no según si esa OT tuvo
  algo en kg — el resto de las unidades presentes (LTS, UNI, etc.) van después. La columna UMC de
  Capataz a veces trae basura en vez de una unidad real (`***`, o `?` cuando el módulo la completa por
  venir vacía) — `esUnidadValida()` descarta cualquier valor sin ninguna letra antes de mostrarlo (una
  unidad real siempre tiene alguna, KGS/LTS/UNI/MTS...), tanto acá como en los gráficos de dona de abajo.
- Click en una tarjeta abre su **detalle**, dividido en dos **sub-pestañas** (`.subtabs`/`.subtab`,
  patrón visual reusado de las tabs de bloque de Cotizaciones — ver 9.2 punto 3 — pero con clase propia
  porque no es específico de Cotizaciones): **Resumen** (KPIs + los 3 bloques de gráficos de abajo,
  pestaña por defecto al abrir una OT) y **Detalle** (la tabla artículo por artículo). Se separaron a
  pedido del usuario para no mezclar "panorama" con "línea por línea" en una sola pantalla larga. Los
  gráficos se dibujan siempre con el panel Resumen momentáneamente visible (`mostrarTabOT()` en
  `js/modules/ot.js`) aunque la sub-pestaña activa sea Detalle — Chart.js necesita que el contenedor
  tenga tamaño real en el momento de crear el canvas, si no queda con dimensiones 0.
  1. **Comprado vs. de stock** — **una dona por unidad** (KGS, LTS, UNI...), no una sola dona por
     cantidad de ítems: un ítem "1 tonelada" y un ítem "1 tornillo" cuentan igual como "1 ítem", así que
     ese número no dice mucho para decidir compras — pedido explícito del usuario tras ver el dashboard
     con datos reales. `renderDonutsPorUnidad()` en `js/modules/ot.js` arma un `.chart-card` por unidad
     presente entre comprado y stock (mismo criterio de "un chart-card por serie" que
     `renderBarrasPorMoneda()`/`renderEvolucionPorMoneda()`), con KGS siempre primero (aunque sea
     "0 KGS") — mismo criterio que `chipsUnidades()` en las tarjetas de la vista Por OT. Se usa tanto en
     el Dashboard general (todas las OT juntas) como en el Resumen de cada OT.
  2. **Gasto por proveedor** dentro de esa OT (barras horizontales).
  3. **Evolución en el tiempo** — monto comprado por mes, agrupado por la fecha de la solicitud de
     Cotizaciones a la que pertenece cada ítem (no hay una fecha propia por ítem).

  La tabla de Detalle muestra el artículo por artículo (código, descripción, cantidad, origen — 🛒/📦/⏳
  —, proveedor ganador, precio, subtotal, estado, de qué solicitud salió) para poder rastrear de dónde
  sale cada número del Resumen, no solo verlo.

**Gráficos multi-moneda:** ningún gráfico mezcla ARS y USD en el mismo eje (sería un dual-axis
encubierto) — `renderBarrasPorMoneda()`/`renderEvolucionPorMoneda()` arman **un `.chart-card` por
moneda** dentro del contenedor (`otd_ranking_wrap`, `otdet_prov_wrap`, `otdet_evol_wrap`), así que con
una sola moneda (el caso normal) queda un único gráfico y con dos aparecen dos, cada uno con su propio
título y escala — mismo criterio de "no mezclar monedas, mostrar aparte" que ya usa Cotizaciones (ver
9.2 punto 7). Los gráficos usan Chart.js (mismo CDN que el Dashboard de Órdenes de Compra, sección 5.3)
con los mismos colores de acento (`#22c55e` verde, `#6366f1` índigo, `#3b82f6` azul, `#64748b` gris) y
leen `--muted`/`--border`/`--bg2` del tema activo en cada render, igual que el resto del tablero (ver
sección 11).

### 10.4 Modelo de datos

Sin tablas propias — `js/modules/ot.js` trae en cada visita (no se cachea, mismo motivo que antes: lo
que alimenta los totales pasa en la vista detalle de una solicitud de Cotizaciones, no acá) **todos** los
`compras_cotizaciones_items` y `compras_cotizaciones_precios` de **todas** las solicitudes (no solo la
abierta), más `compras_proveedores` (nombres) y `compras_cotizaciones` (nombre/fecha de cada solicitud,
para la evolución en el tiempo y la columna "Solicitud" del detalle).

### 10.5 Decisiones tomadas

- **Módulo de nav propio, no una sub-vista de Cotizaciones**: se evaluó dejarlo anidado bajo Cotizaciones
  (más simple, deja claro de dónde sale el dato) pero el usuario prefirió un grupo de nav al mismo nivel
  que Flota/OC/Stock/Proveedores, para poder "trabajarlo de ahí" — el módulo sigue leyendo las mismas
  tablas de Cotizaciones, no hay tablas nuevas.
- **Comprado vs. stock, no un solo total**: ver 10.2 — nació de que el usuario "purga" cada solicitud
  marcando qué ya hay en stock antes de cotizar, y quería que ese trabajo se reflejara en el seguimiento
  por OT en vez de perderse (o peor, contarse como si se hubiera comprado).

## 11. Stack técnico

- **Frontend:** HTML/JS vanilla, mismo criterio que Nexo RRHH y CIMOMET v3.
- **Diferencia respecto a Nexo RRHH:** en vez de un único archivo HTML, para este proyecto conviene
  **arquitectura modular con ES Modules** (varios archivos, uno por módulo/entidad) — el mismo enfoque
  que ya está planificado para el Tablero de Control Ejecutivo. Motivo: pediste que esto sea "súper
  personalizable" y fácil de modificar a futuro; un solo archivo gigante se vuelve difícil de mantener
  a medida que sumes los módulos de la sección 3.
- **Tema claro/oscuro:** toggle 🌙/☀️ en el header (`index.html`, `js/main.js`), persistido en
  `localStorage` (`compras_tema`) y aplicado vía `data-theme` en `<html>`. Oscuro es el default (look
  original, sin cambios). Un `<script>` inline al principio de `<head>` aplica el tema guardado antes de
  pintar la página, para que no haya un flash del tema equivocado al cargar. Los colores estructurales
  (`--bg`, `--bg2`, `--bg3`, `--border`, `--text`, `--muted`, `--row-hover`) están en `css/styles.css`
  como variables, redefinidas bajo `html[data-theme="light"]`; los colores de acento/estado (verde, rojo,
  amarillo, etc.) quedan iguales en los dos temas. Los gráficos de Chart.js (Dashboard de OC) leen esas
  variables en cada `render()` (`getComputedStyle`) para adaptar el color de texto/grilla al tema activo
  — si se agregan gráficos a otro módulo, hay que hacer lo mismo en vez de hardcodear colores.
- **Instructivo de carga:** en OC y Stock, el botón "Cargar archivo" no abre el selector de archivo
  directo — primero abre un modal genérico (`mINSTRUCTIVO` en `index.html`, `INSTRUCTIVOS` en
  `js/main.js`) con el paso a paso exacto para bajar el informe del sistema de origen (Tango Gestión
  para OC, Capataz para Stock), para no depender de la memoria cada vez. El botón "Ya lo tengo, elegir
  archivo" cierra el modal y dispara el click del `<input type="file">` real (que sigue oculto). Se
  activa con `data-instructivo="oc"` / `data-instructivo="stock"` en el botón — agregar un módulo nuevo
  con carga de archivo implica sumar una entrada a `INSTRUCTIVOS` y el atributo en el botón, nada más.
- **Límite de 1000 filas por consulta (Supabase/PostgREST):** el servidor devuelve como máximo 1000
  filas por request **sin importar** qué `.limit()` se le pida del lado del cliente — un
  `.select('*').limit(20000)` sobre una tabla con más de 1000 filas se trunca en silencio a las primeras
  1000, sin orden garantizado. Esto pasó desapercibido mientras las tablas eran chicas, pero explotó en
  producción cuando el usuario subió un archivo histórico de OC (5588 líneas): el Dashboard y "Abiertas"
  de golpe mostraban datos parciales/incoherentes (0 pendientes, 100% completado) porque solo veían un
  subconjunto arbitrario de la tabla. La solución es `fetchAll()` en `js/utils.js` — pagina con `.range()`
  hasta que una página vuelve incompleta — usada en vez de `.select().limit(N)` en cualquier fetch que
  necesite **la tabla completa** (`compras_oc_lineas`, `compras_stock_saldos`, `compras_articulos_grupo`
  en `oc.js`/`stock.js`/`proveedores.js`). Los `.limit(100)`/`.limit(200)` de Flota (vistas acotadas a
  propósito, ej. "últimos 100 movimientos") no necesitan esto — el límite ahí es intencional y menor a
  1000. Si una tabla nueva puede crecer sin techo, hay que usar `fetchAll()` desde el principio.
- **Escapar comillas en HTML generado dinámicamente:** los códigos de artículo de bulonería traen
  comillas literales de verdad — ej. `BUL5/8"X134A257`, la marca de pulgada — no son un caso raro, están
  por todo el catálogo. Un `data-cod="${cod}"` o un `onclick="fn('${cod}')"` sin escapar esa comilla
  corta el atributo/string a la mitad y desalinea el HTML de ahí en adelante; en Clasificar Artículos
  esto llegó a producir dos checkboxes con el mismo `data-cod`, y la asignación masiva mandaba ese código
  duplicado en el mismo `upsert`, que Postgres rechaza con "ON CONFLICT DO UPDATE command cannot affect
  row a second time" (500). `escAttr()`/`escJsArg()` en `js/utils.js` son los helpers para esto —
  `escAttr()` para atributos comunes (`data-*`), `escJsArg()` para cuando el valor va dentro de un
  string JS de un solo entrecomillado adentro de un atributo doble-entrecomillado (`onclick="fn('...')"`,
  necesita escapar backslash, comilla simple *y* comilla doble). Cualquier `cod_articulo`/`articulo_cod`
  insertado en un atributo HTML tiene que pasar por uno de los dos.
- **Backend/datos:** Supabase — proyecto compartido con el sistema de legajos (ver 4.4), no uno dedicado.
- **Conexión:** las credenciales de Supabase (URL + anon key) están **hardcodeadas** en
  `js/supabase-client.js`, `porteria.html` y `solicitud.html` — no hay credenciales que configurar, las
  3 páginas conectan solas al cargar. La anon key es pública por diseño (va en el front) y las tablas
  `compras_*` **no tienen RLS** — están protegidas solo por no difundir el link/anon key, no por
  autenticación real (ver aviso de seguridad al final de `sql/schema.sql`). Si falla la conexión (ej.
  falta correr `sql/schema.sql`), se muestra un cartel de error en vez de la app.
- **Login por PIN (`js/login.js`, `sql/008_usuarios.sql`):** después de conectar a Supabase, `index.html`
  muestra una grilla de perfiles (`compras_usuarios`, hoy Cimolai/Angulo, diseño en tarjetas con avatar
  de iniciales — pedido explícito del usuario, mirando una pantalla parecida del Tablero de RRHH) antes
  de mostrar `#app` — **no es autenticación real**, mismo criterio de seguridad que el resto del
  proyecto (el PIN se guarda en texto plano en la tabla, cualquiera con la anon key podría leerlo). Sirve
  para saber **quién** está usando la sesión, principalmente para que `compras_notas_pedido.revisado_por`
  (sección 8.2) quede con el nombre de quien autorizó cada Nota de Pedido en vez de tipearlo a mano.
  `compras_usuarios.pin` arranca en `null` a propósito: un perfil sin PIN todavía muestra la etiqueta
  "Crear PIN" y la propia persona lo define la primera vez que entra (se le pide dos veces para evitar
  errores de tipeo) — no hace falta que un admin precargue PINs a mano por SQL, solo el nombre. Se pide
  en **cada carga de página** a propósito (pedido explícito del usuario, no persiste en localStorage) —
  por eso alcanza con guardar el usuario logueado en una variable de módulo (`getUsuarioActual()` en
  `js/login.js`), dura toda la sesión de la SPA hasta el próximo reload. `porteria.html` y
  `solicitud.html` no tienen este login (quedan fuera del SPA modular, ver 4.4).
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
├── Logo Cimomet HD.png    (fuente del logo embebido en base64 en notas-pedido.js, ver 8.3)
├── css/
│   └── styles.css         (sistema de diseño compartido por index.html)
├── js/
│   ├── main.js             (nav / routing / ciclo de vida de módulos)
│   ├── supabase-client.js  (credenciales hardcodeadas, conexión automática + login por PIN)
│   ├── login.js            (login por PIN — atribución, no seguridad real, ver sección 11)
│   ├── utils.js            (toast, formateo de fechas/montos, estado de vencimiento, parseo de Excel compartido por OC y Stock)
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
│       ├── oc.js  (Órdenes de Compra — módulo aparte, sin relación con Flota, ver sección 5)
│       ├── stock.js  (Stock — módulo aparte, sin relación con Flota ni OC, ver sección 6)
│       ├── proveedores.js  (Proveedores — se alimenta de OC, ver sección 7)
│       ├── notas-pedido.js  (Notas de Pedido — numeración + PDF + vínculo con OC, ver sección 8)
│       ├── cotizaciones.js  (Cotizaciones — se alimenta de Capataz y de Proveedores, ver sección 9)
│       └── ot.js  (OT — lee y reagrupa los datos de Cotizaciones, sin tablas propias, ver sección 10)
├── Excels/                (archivos de ejemplo de OC, Stock y NP — en .gitignore, no se suben al repo)
├── Cotizar.xlsx           (archivo de ejemplo de Cotizaciones — también en .gitignore, datos reales)
└── sql/
    ├── schema.sql
    ├── 002_seguros_archivo.sql
    ├── 003_documentos_unificados.sql
    ├── 004_ordenes_compra.sql
    ├── 005_stock.sql
    ├── 006_proveedores.sql
    ├── 007_notas_pedido.sql
    ├── 008_usuarios.sql
    ├── 009_entrega_parcial.sql
    ├── 010_moneda.sql
    ├── 011_cotizacion_ref.sql
    ├── 012_reset_notas_pedido.sql
    ├── 013_cotizaciones.sql
    ├── 014_cotizaciones_bloques.sql
    ├── 015_cotizaciones_confirmado.sql
    ├── 016_cotizaciones_condicion_pago.sql
    ├── 017_cotizaciones_duplicado_aceptado.sql
    └── 018_articulos_largo_barra.sql
```

> `porteria.html` y `solicitud.html` son entry points separados (audiencias distintas: portero de
> planta y personal general) — no están integrados al SPA modular de `index.html`, que es exclusivo
> del área de Compras. Comparten la misma base de Supabase y el mismo esquema (`compras_vehiculos`,
> `compras_movimientos`, `compras_solicitudes`). El viejo `admin.html` (el tercer HTML que se usó de
> base) quedó sin tocar en la raíz como referencia — su funcionalidad ya está migrada a `index.html` +
> los módulos `flota-*.js`; se puede borrar cuando lo confirmes.

## 12. Notas específicas de entorno

- Dijiste que vas a trabajar este proyecto en **Antigravity** (cuenta de la empresa). Ojo con un detalle
  que ya tenemos registrado de tu workflow: **Antigravity no carga `CLAUDE.md` automáticamente** — usa
  `GEMINI.md` o `AGENTS.md`. Este archivo está nombrado `CLAUDE.md` porque así lo pediste, pero para que
  se cargue solo en Antigravity vas a necesitar guardarlo también (o renombrarlo) como `AGENTS.md` o
  `GEMINI.md`. Si en algún momento retomás este proyecto en Claude Code, ahí sí lo vas a querer como
  `CLAUDE.md`. Lo más simple: mantener el contenido en `CLAUDE.md` y tener una copia (o symlink) como
  `AGENTS.md`.

## 13. Decisiones abiertas (TBD)

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

Ya decidido al construir el módulo Notas de Pedido (2026-08-24):
- [x] Numeración: secuencia real de Postgres arrancando en 8123 (siguiendo la numeración real que
  traían del Word) — ver sección 8.1.
- [x] Seguimiento: vínculo simple con el N° de Orden de Compra que la cierra, sin replicar el cálculo
  pendiente/parcial/completada de OC — ver sección 8.2.
- [x] Sin campo "Material" vs "Servicio" — son pocas NP, no lo justifica.
- [x] PDF con diseño nuevo (no réplica del Word viejo), membrete y logo actuales de Cimomet — ver 8.3.
- [x] Solo para CIMOMET, sin selector de empresa.

Ya decidido al construir el login por PIN (2026-08-24):
- [x] Es solo atribución (saber quién hizo qué), no seguridad real — mismo criterio que el resto del
  tablero (protegido por no compartir el link/anon key). Confirmado con el usuario.
- [x] El PIN se pide al entrar a `index.html` (todo el tablero), no solo al crear una Nota de Pedido.
- [x] Se pide en cada carga de página — no se persiste en localStorage.
- [x] El "Revisado por" de la Nota de Pedido es el mismo campo que "quién autorizó" (el usuario
  logueado), no dos campos separados.
- [x] Diseño en grilla de tarjetas con avatar de iniciales (pedido explícito, mostrando de referencia
  una pantalla parecida del Tablero de Control de RRHH) y creación de PIN self-service la primera vez
  ("Crear PIN") en vez de que un admin precargue PINs por SQL.

Ya decidido al construir el módulo Cotizaciones (2026-08-27):
- [x] Se invita una lista fija de proveedores a mano por solicitud, no se sugiere automáticamente por
  rubro/grupo de Proveedores — ver sección 9.4.
- [x] Marcar "no comprar" (ya hay stock) se hace tildando filas en bloque (tocar y arrastrar, mismo
  patrón que Clasificar Artículos), no un toggle individual por fila únicamente.
- [x] Sí se registra un "ganador" por artículo, con la posibilidad de fijarlo a mano
  (`ganador_manual = true`) para poder repartir la compra entre proveedores y cumplir mínimos de compra
  sin que el sistema lo pise recalculando solo al más barato — ver 9.2.
- [x] Sin envío de mail a proveedores ni vínculo con OC/Nota de Pedido en esta primera versión — ver 9.4.

Todavía sin decidir:
- [ ] ¿Se integra el combustible/YPF Ruta al módulo Flota o queda como módulo aparte?
- [ ] ¿Las alertas de vencimiento se envían por mail (reutilizando Resend, ya integrado en Nexo RRHH) o solo se muestran en el tablero?
- [ ] ¿Este tablero va a alimentar de datos a la sección "Flota" del Tablero de Control Ejecutivo, o van a ser fuentes de datos separadas?
- [ ] Definir el siguiente módulo a desarrollar en detalle después de Flota (¿Proveedores? ¿Presupuesto?).
- [ ] Dominio propio para hosting o alcanza con GitHub Pages por ahora.
- [ ] Login/roles real (RLS/autenticación) — `index.html` desde 2026-08-24 pide un PIN de 4 dígitos por
  perfil (ver 9, `js/login.js`) pero es solo **atribución**, no seguridad: cualquiera con la anon key
  sigue pudiendo leer/escribir todas las tablas `compras_*` sin pasar por ahí. `porteria.html` y
  `solicitud.html` siguen sin ningún control de acceso.
- [ ] ¿Se borra el `admin.html` original de la raíz ahora que su funcionalidad está migrada a `index.html`?
- [ ] Documentación: hoy el archivo viejo de un documento reemplazado queda en el Storage (no se borra,
  ver 4.4). ¿Conviene borrarlo automáticamente al cargar el nuevo, o dejarlo como está por si sirve de
  respaldo?
- [ ] ¿Se borran del todo `compras_seguros_old` / `compras_permisos_old` (ver 4.4) una vez confirmado
  que no hace falta consultarlas?
- [ ] Categorización de proveedores (ver 5.3): clasificarlos por tipo (materia prima, pintura, insumos,
  etc.) para poder adaptar/filtrar el Dashboard de OC según categoría — todavía no tiene tabla ni UI.

## 14. Próximos pasos sugeridos

1. Correr `sql/schema.sql` contra el proyecto Supabase real (ya hecho — tablas `compras_*` creadas).
2. Correr [`sql/002_seguros_archivo.sql`](sql/002_seguros_archivo.sql) (ya hecho) y
   [`sql/003_documentos_unificados.sql`](sql/003_documentos_unificados.sql) (ya hecho — fusiona Seguros
   + Permisos en `compras_documentos`).
3. Correr [`sql/004_ordenes_compra.sql`](sql/004_ordenes_compra.sql) (ya hecho — crea `compras_oc_lineas`).
4. Correr [`sql/005_stock.sql`](sql/005_stock.sql) (ya hecho — crea `compras_stock_saldos` y
   `compras_stock_minimos`; ya hay artículos reales cargados en seguimiento).
5. Correr [`sql/006_proveedores.sql`](sql/006_proveedores.sql) (ya hecho — crea `compras_grupos`,
   `compras_articulos_grupo`, `compras_proveedores` y `compras_proveedores_contactos`; ya hay ~2965
   artículos clasificados en 28 grupos, ver 7.1).
6. Correr [`sql/007_notas_pedido.sql`](sql/007_notas_pedido.sql) (ya hecho — crea `compras_notas_pedido`
   y la secuencia `compras_np_numero_seq`).
7. Correr [`sql/008_usuarios.sql`](sql/008_usuarios.sql) (ya hecho — crea `compras_usuarios` y carga
   Cimolai, Pablo Luis / Angulo, Valentín Eduardo sin PIN; cada uno lo crea solo al entrar).
8. Correr [`sql/009_entrega_parcial.sql`](sql/009_entrega_parcial.sql) (ya hecho — agrega
   `entrega_parcial` a `compras_notas_pedido`).
9. Correr [`sql/010_moneda.sql`](sql/010_moneda.sql) (ya hecho — agrega `moneda` a
   `compras_notas_pedido`).
10. Correr [`sql/011_cotizacion_ref.sql`](sql/011_cotizacion_ref.sql) para agregar la columna
    `cotizacion_ref` (**todavía falta**).
11. Correr [`sql/012_reset_notas_pedido.sql`](sql/012_reset_notas_pedido.sql) — borra las Notas de Pedido
    de prueba cargadas mientras se armaba el módulo y reinicia la numeración en 8122 (**todavía falta**).
12. Correr [`sql/013_cotizaciones.sql`](sql/013_cotizaciones.sql) — crea las 4 tablas del módulo
    Cotizaciones (ya hecho — el usuario ya creó una solicitud real de prueba).
13. Correr [`sql/014_cotizaciones_bloques.sql`](sql/014_cotizaciones_bloques.sql) — agrega la división
    en bloques (Pañol/Despacho, ver sección 9.2/9.4) (ya hecho — el usuario ya lo está usando con
    proveedores reales invitados por bloque).
14. Correr [`sql/015_cotizaciones_confirmado.sql`](sql/015_cotizaciones_confirmado.sql) — agrega
    `confirmado` para poder cerrar la compra por proveedor (ver sección 9.2 punto 9) (ya hecho — el
    usuario ya está confirmando compras reales con esto).
15. Correr [`sql/016_cotizaciones_condicion_pago.sql`](sql/016_cotizaciones_condicion_pago.sql) — agrega
    `condicion_pago` a `compras_cotizaciones_proveedores` para el pedido del director financiero (ver
    sección 9.2 punto 10) (**todavía falta**).
16. Correr [`sql/017_cotizaciones_duplicado_aceptado.sql`](sql/017_cotizaciones_duplicado_aceptado.sql) —
    agrega `duplicado_aceptado` a `compras_cotizaciones_items` para el tab "⚠️ Duplicado" (ver sección
    9.2) (**todavía falta**).
17. Correr [`sql/018_articulos_largo_barra.sql`](sql/018_articulos_largo_barra.sql) — crea
    `compras_articulos_largo_barra` para "Ajustar a barra entera" (ver sección 9.1/9.3) (**todavía
    falta**).
18. Probar el circuito completo: pedir vehículo (solicitud.html) → aprobar y asignar (index.html) →
   registrar salida/retorno (porteria.html) → ver el movimiento reflejado en el dashboard.
19. Evaluar RLS (Row Level Security) en las tablas `compras_*` — hoy cualquiera con el link de
   `solicitud.html`/`porteria.html` puede leer/escribir todas las tablas, sin ningún login de por medio.
20. Ir completando los módulos `[TBD]` de la sección 3 a medida que los necesites, usando el módulo
   Flota (carpeta `js/modules/`) como plantilla.
