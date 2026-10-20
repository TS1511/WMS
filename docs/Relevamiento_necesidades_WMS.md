---
title: "Relevamiento de necesidades del sector"
subtitle: "Base funcional para el futuro proyecto WMS"
date: "20 de octubre de 2026 · Versión 1.0"
lang: es-AR
---

# 1. Propósito del documento

Este documento consolida las necesidades operativas relevadas durante la construcción de GPS —Goods Position System— para que puedan utilizarse como base de un futuro proyecto WMS. Describe qué necesita el sector, qué información debe manejar y qué reglas debe respetar cada proceso.

El alcance reúne lo conversado en el proyecto y las necesidades que quedaron reflejadas en los módulos, formularios y reglas de la aplicación. No es un manual de programación ni una propuesta de nuevas funcionalidades. Las decisiones que todavía no quedaron definidas se identifican expresamente al final.

**Uso previsto:** entregar a Operaciones, Supervisión, Sistemas o un proveedor de WMS una referencia común para evaluar soluciones, definir el alcance funcional y comprobar que la operación relevada quede contemplada.

**Distinción de alcance:** una necesidad documentada no significa que ya esté resuelta y validada en producción. El repositorio revisado mantiene una versión de prueba basada en Google Sheets y Apps Script; el entorno futuro solicitado es IIS y SQL en la red interna, sin Internet. Este documento registra la necesidad de destino y los comportamientos operativos, sin certificar un despliegue.

# 2. Necesidad general del sector

El sector necesita saber **qué mercadería tiene, en qué almacén y posición está, a qué pallet pertenece, cómo se movió y quién realizó cada operación**. Esa información debe ser compartida por quienes trabajan con celulares y computadoras, de modo que cada dispositivo consulte el mismo registro central.

Las necesidades que organizan el proyecto son:

- Disponer de un inventario operativo confiable por almacén, ubicación, SKU y pallet.
- Registrar ingresos, reubicaciones, egresos, bloqueos y ajustes con trazabilidad.
- Orientar el guardado y la preparación respetando la disposición física del depósito.
- Realizar conteos físicos y tratar las diferencias mediante responsables autorizados.
- Administrar los maestros sin modificar la aplicación cada vez que cambia el depósito.
- Diferenciar las funciones y los almacenes permitidos para cada persona.
- Comparar las existencias operativas con la información de SAP.
- Contar con documentos impresos para acompañar la operación y registrar contingencias.
- Trabajar en la red interna con IIS y SQL, sin depender de Internet ni de un Excel como base de funcionamiento.

# 3. Alcance físico y organizativo relevado

## 3.1 Almacenes y espacios operativos

La operación contempla **CD Escobar**, **Back Salón Escobar** y la posibilidad de incorporar otros almacenes. Cada almacén debe conservar su propia identificación, posiciones, movimientos y conteos. El maestro SKU es compartido; la existencia se consulta dentro del almacén seleccionado.

Se identificaron los grupos operativos **Depósito**, **Salón**, **CD** y **Depósito NON FOOD**. Estos grupos clasifican el tipo de espacio; no deben confundirse con el permiso individual para ingresar a un almacén.

**N-01 · Separación por almacén.** El usuario debe poder reconocer en todo momento dónde está trabajando. Cambiar de almacén debe cambiar las posiciones, existencias, movimientos, zonas y conteos mostrados, sin mezclar registros de otros espacios.

**N-02 · Incorporación de almacenes.** Administración necesita crear y mantener nuevos almacenes sin desarrollar una aplicación independiente para cada uno.

## 3.2 Tipos de almacenamiento

Se relevaron racks selectivos, almacenamiento penetrable o **Drive-In**, racks de pared de las zonas **Este, Oeste y Norte**, y posiciones de **Back Salón**. Los tipos de ubicación deben conservar sus diferencias físicas y sus reglas de acceso.

Como referencia del plano disponible al elaborar este documento, hay **17.150 posiciones base**: 13.410 correspondientes al CD y 3.740 a Back Salón. Su composición es 11.000 selectivas, 950 Drive-In, 1.460 de pared y 3.740 de Back Salón. El modelo base utiliza niveles 0 a 4. Estas cifras describen el archivo de referencia del proyecto; no equivalen a una certificación de capacidad física ni a existencias reales.

**N-03 · Representación del depósito.** La estructura del WMS debe reflejar almacén, sector, pasillo, lado, rack, módulo o posición, nivel y profundidad cuando corresponda. Una ubicación física no debe perder su identidad por cambiar su descripción o estado.

# 4. Personas, responsabilidades y acceso

## 4.1 Perfiles operativos

Se relevaron cinco perfiles. La siguiente matriz expresa la distribución funcional visible en la aplicación; debe conservarse como base de la definición de permisos del futuro WMS.

| Actividad | Operación | Preparación | Inventario | Supervisión | Administración |
|---|---|---|---|---|---|
| Consultar panel, posiciones y mapas | Sí | Sí | Restringido al conteo | Sí | Sí |
| Registrar ingresos, reubicaciones y egresos | Sí | No desde el módulo de registro actual | No | Sí | Sí |
| Armar pedidos y recorridos de preparación | No | Sí | No | Sí | Sí |
| Registrar conteos | No | No | Sí, con conteo ciego | Sí | Sí |
| Revisar y aplicar ajustes de inventario | No | No | No | Sí | Sí |
| Corregir o anular movimientos | No | No | No | Sí | Sí |
| Mantener SKU y zonificación | No | No | No | Sí | Sí |
| Importar stock SAP y analizar diferencias | No | No | No | Sí | Sí |
| Bloquear o desbloquear posiciones | No | No | No | No | Sí |
| Administrar almacenes, posiciones y accesos | No | No | No | No | Sí |

La preparación de una ruta no equivale, por sí sola, a registrar un egreso. El cierre operativo de esa preparación se trata en la sección de pedidos, sin dar por definida una automatización que no quedó relevada.

## 4.2 Necesidades de identificación y permisos

**N-04 · Identificación por legajo.** Cada persona debe identificarse con su legajo y nombre. Los registros deben quedar vinculados al operador y no únicamente al equipo utilizado.

**N-05 · Acceso por almacén y función.** El permiso debe considerar tanto el rol como el ámbito o almacén habilitado. Estar habilitado para un grupo operativo no debe confundirse con autorización automática sobre todos los almacenes de ese grupo.

**N-06 · Administración de legajos.** Se necesita dar de alta, consultar, modificar y desactivar legajos, asignando nombre, rol, ámbito y estado activo. La desactivación debe impedir nuevos accesos sin borrar el historial asociado.

**N-07 · Accesos administrativos.** Debe existir una función administrativa para gestionar los accesos y las claves de los ámbitos. El mecanismo relevado en el prototipo utiliza claves compartidas por ámbito y una duración de sesión de ocho horas. Su traslado al entorno definitivo requiere una definición de seguridad, sin perder la identificación individual por legajo.

**N-08 · Visibilidad de usuarios activos.** Administración necesita ver las sesiones activas, el operador, el puesto informado, el rol, el ámbito y la última actividad. Esta visibilidad sirve para conocer quién está usando la herramienta; no se definió como medición de productividad individual.

# 5. Maestro de almacenes

**N-09 · Alta y mantenimiento.** Cada almacén debe tener identificador, código único, nombre, grupo operativo y estado activo o inactivo. Se necesita consultar sus posiciones y ocupación, y reconocer si dispone de representación 3D.

**N-10 · Activación y desactivación.** Debe ser posible suspender un almacén para nuevas operaciones sin perder los movimientos, conteos y referencias históricas. La operación debe reconocer claramente el estado del almacén.

**N-11 · Eliminación controlada.** La eliminación no debe romper referencias. Un almacén con posiciones, movimientos, conteos, zonas o legajos asociados debe conservarse o desactivarse. Los almacenes base de Escobar quedaron protegidos frente a la eliminación en el prototipo.

**N-12 · Auditoría de cambios.** El alta, la modificación, el cambio de estado y la eliminación permitida deben registrar la persona responsable y los datos anteriores y nuevos.

# 6. Maestro y administración de posiciones

## 6.1 Identidad y datos de una posición

**N-13 · Maestro de posiciones por almacén.** Se necesita crear y consultar posiciones con código, almacén, pasillo, módulo, nivel, lado, rack, tipo de ubicación, sector y estado. La clave de identificación debe considerar el almacén junto con el código de posición, para no mezclar ubicaciones de depósitos diferentes.

**N-14 · Codificación compatible con la operación.** Deben conservarse los formatos utilizados en CD, racks de pared, Drive-In y Back Salón. La normalización de la lectura no debe transformar un código válido de otro almacén en una posición incorrecta. Un cambio de codificación debe mantener identificable el historial.

**N-15 · Estados diferenciados.** Se debe distinguir una posición activa o inactiva, una posición libre u ocupada y una posición bloqueada. No son conceptos intercambiables: estar libre no la hace disponible si está bloqueada o fuera de servicio.

## 6.2 Altas, cambios y cargas masivas

**N-16 · Alta individual y edición.** Administración necesita crear una ubicación por vez y editar sus datos desde una pantalla específica, sin modificar archivos del sistema ni recurrir al desarrollador para cambios de rutina.

**N-17 · Importación masiva con revisión.** Se necesita importar posiciones mediante una plantilla, ver una vista previa y distinguir filas válidas, vacías, repetidas en el archivo o ya existentes en el almacén. La importación no debe sobrescribir posiciones existentes de forma silenciosa.

**N-18 · Tratamiento de resultados parciales.** Debe quedar claro qué posiciones se incorporaron y cuáles no. Un reintento debe reconocer lo previamente confirmado. El prototipo importa por lotes; esa limitación no debe traducirse en incertidumbre para el operador del futuro WMS.

**N-19 · Administración en lote.** Se necesita buscar, filtrar, seleccionar varias posiciones y activarlas, desactivarlas o eliminarlas cuando esté permitido, con un resultado individual para las que no puedan procesarse.

**N-20 · Protección de posiciones utilizadas.** No debe permitirse desactivar una ubicación ocupada ni eliminar una que tenga movimientos históricos. Las posiciones base del plano pueden quedar fuera de servicio sin borrar la referencia física original.

**N-21 · Consulta y exportación del maestro.** Administración necesita filtrar por código, pasillo, nivel, estado y ocupación, y exportar la información para revisión. Debe quedar identificado el almacén al que corresponde el archivo.

# 7. Maestro de productos y unidades de trabajo

## 7.1 Información del SKU

**N-22 · Catálogo común de productos.** El SKU o material debe existir en el maestro antes de utilizarse en las operaciones que requieren validarlo. Se necesita diferenciar productos activos e inactivos, y buscar por SKU, EAN o descripción.

Los datos relevados para cada producto son:

| Dato | Necesidad operativa |
|---|---|
| SKU / material | Identificar inequívocamente el producto. |
| Descripción | Reconocerlo durante registro, consulta y preparación. |
| EAN / código de barras | Vincular la lectura con la identificación del producto. |
| Categoría | Clasificarlo y facilitar consultas. |
| Grupo de producto | Diferenciar FOOD, NON FOOD, PERFUMERÍA y LIMPIEZA. |
| Clase de rotación | Distinguir Súper A, A, B, C y Estacional. |
| Bultos por pallet | Convertir pallets completos a bultos y comparar magnitudes. |
| Peso unitario en kg | Mantener el atributo relevado del producto. No hay una regla de capacidad máxima acordada. |
| Posiciones requeridas | Representar productos que ocupan más de una posición contigua. |
| Días mínimos y máximos | Establecer límites de cobertura para las alertas. |
| Consumo diario estimado en bultos | Calcular mínimos, máximos y cobertura. |
| Estado activo | Habilitar o restringir su uso operativo. |

**N-23 · Mantenimiento e importación.** Supervisión y Administración necesitan altas y modificaciones, importación CSV/TSV con plantilla y exportación del maestro. Las operaciones sobre el catálogo deben ser trazables; una limpieza administrativa no debe interpretarse como eliminación de existencias físicas.

## 7.2 Pallets, bultos y existencia

**N-24 · Diferenciar unidades.** El sector trabaja con pallets completos y con bultos. El sistema debe mostrar qué unidad se está registrando y evitar sumar o comparar cantidades de distinta naturaleza como si fueran equivalentes.

**N-25 · Conversión conocida.** Cuando la existencia está informada como pallets monoproducto, los bultos se obtienen mediante la cantidad de pallets por los bultos por pallet del maestro. Si falta esa conversión, debe mostrarse la condición pendiente; no se debe presentar un cero como si fuera stock confirmado.

**N-26 · Cargas con varios SKU.** Un pallet multiproducto debe conservar el detalle de cada SKU y sus bultos, además de la identificación del pallet. La etiqueta “multiproducto” no reemplaza el contenido detallado.

# 8. Identificación y trazabilidad del pallet

**N-27 · Identificador único de pallet.** En el ingreso se necesita escanear o ingresar el identificador de pallet utilizado en SAP. No debe admitirse otro ingreso del mismo pallet mientras ya está activo. El identificador debe conservarse en las consultas y en el historial.

**N-28 · Continuidad del identificador.** Al reubicar o retirar mercadería, el sistema debe recuperar el pallet desde su ubicación de origen y mantener la relación entre pallet, contenido y movimiento. El operador no debería reconstruir manualmente esa identificación en cada paso.

**N-29 · Rastreo completo.** Se necesita poder responder, a partir del pallet, del SKU o de una posición: dónde está, dónde estuvo, qué operaciones se realizaron y quién las registró. El alcance definitivo de la unicidad del pallet entre todos los almacenes debe quedar formalizado.

# 9. Registro de ingresos, reubicaciones y egresos

## 9.1 Datos comunes

**N-30 · Registro de movimientos.** Cada movimiento debe conservar identificador, fecha y hora, tipo de operación, almacén, operador, pallet, SKU o detalle de contenido, origen, destino y cantidades con su unidad. Cuando corresponda, debe registrar la variación de posiciones ocupadas, la permanencia y la referencia a un conteo o corrección.

La fecha operativa debe poder interpretarse en horario local; la referencia temporal central debe evitar ambigüedades entre equipos. El historial debe permitir distinguir el dato original de sus modificaciones o anulaciones.

## 9.2 Ingreso

**N-31 · Ingreso monoproducto.** El operador debe poder informar pallet, SKU, cantidad de pallets y destino. Debe comprobarse que el SKU esté habilitado y que la ubicación sea válida, activa, disponible y del almacén correspondiente.

**N-32 · Ingreso multiproducto.** Debe poder registrarse un pallet con varias líneas de SKU y bultos. Cada línea necesita un producto válido y una cantidad positiva. La carga debe quedar identificada como un conjunto, sin perder el detalle de sus componentes.

**N-33 · Validaciones antes de ocupar.** No se debe admitir un destino ocupado o bloqueado, un pallet ya activo ni una asignación incompatible con las posiciones requeridas o las reglas de Drive-In. Una confirmación fallida no debe dejar una ocupación parcial sin explicar.

## 9.3 Reubicación

**N-34 · Traslado del contenido existente.** La reubicación debe partir de una posición con stock y dirigirse a otra disponible. Debe transportar el pallet, su contenido y las posiciones físicas requeridas, liberando el origen solamente cuando el traslado quede confirmado.

No se relevó que escribir una ubicación de otro almacén equivalga a una transferencia entre almacenes. Ese proceso necesita una definición propia si se incluye en el proyecto futuro.

## 9.4 Egreso

**N-35 · Salida de pallet completo.** Se debe poder retirar toda la carga identificada en origen y liberar las posiciones que ocupaba, manteniendo la trazabilidad del pallet y sus SKU.

**N-36 · Salida de bultos.** Se necesita identificar qué SKU se retira y cuántos bultos salen, especialmente cuando el pallet es multiproducto. No debe admitirse una cantidad superior a la disponible. El remanente debe conservar su contenido y su ubicación.

**Regla específica relevada:** para una carga monoproducto registrada únicamente como pallets completos, el prototipo exige conversión conocida y limita ese egreso al equivalente completo. Permitir fraccionamientos adicionales de ese caso requiere una decisión operativa; no se da por acordada aquí.

## 9.5 Carga inicial y registros masivos

**N-37 · Carga inicial asistida.** Se necesita previsualizar la ocupación de posiciones libres de un pasillo, lado, nivel o rango de racks para un SKU. Deben respetarse bloqueos, almacén y posiciones contiguas requeridas. La confirmación debe mostrar qué se cargará antes de aplicarlo.

La herramienta contempla identificadores temporales para el relevamiento inicial, a reemplazar cuando se registren los códigos reales de SAP. No deben confundirse con un segundo pallet físico.

**N-38 · Importación de movimientos.** Se necesita una plantilla para incorporar registros obtenidos por fuera del formulario individual. Las columnas relevadas incluyen referencia, ID de pallet, tipo, origen, destino, tipo de carga, SKU y bultos. Las líneas de un ingreso multiproducto deben agruparse por su referencia y pallet.

# 10. Reglas físicas de almacenamiento

## 10.1 Productos que ocupan varias posiciones

**N-39 · Ocupación contigua.** Un SKU monoproducto puede requerir más de una posición. El sistema debe determinar la posición principal y las posiciones vinculadas dentro del mismo tramo físico, nivel y rack, sin sobrepasar los límites disponibles.

**N-40 · Operación como una sola carga.** Las ubicaciones secundarias no deben contarse como pallets adicionales ni como stock duplicado. Un egreso o traslado debe actuar sobre la carga completa y liberar o mover toda su huella física.

No se permite utilizar esta regla de varias posiciones para Drive-In. En el comportamiento relevado, la ocupación adicional se calcula para el SKU monoproducto; no se definió una extensión general de esa lógica a pallets multiproducto.

## 10.2 Drive-In

**N-41 · Ingreso por profundidad.** Dentro de una misma calle y nivel, el ingreso debe utilizar la posición libre más profunda disponible. No debe dejar una ubicación inaccesible por un orden de carga incorrecto.

**N-42 · Salida LIFO.** La extracción debe comenzar por la carga accesible desde el frente, respetando la secuencia física de último en entrar, primero en salir. La preparación también debe considerar esa restricción.

**N-43 · Compatibilidad de la calle.** Una calle/nivel no debe mezclar SKU y no debe utilizarse para pallets multiproducto. Una posición libre visualmente no es necesariamente utilizable si incumple la secuencia o el contenido de la calle.

## 10.3 Bloqueos operativos

**N-44 · Bloquear y desbloquear.** Administración necesita sacar temporalmente una posición de disponibilidad, informar el motivo y restituirla cuando corresponda. El bloqueo no debe confundirse con una baja del maestro ni borrar el historial. No se debe bloquear una posición ocupada como sustituto de resolver su stock.

# 11. Zonificación y sugerencia de guardado

**N-45 · Zonas por clase de rotación.** Se necesita delimitar, por almacén, las posiciones asociadas a una clase Súper A, A, B, C o Estacional. Los criterios de zona incluyen pasillos, lado, rangos de rack y módulo, y nivel; los rangos se interpretan de forma inclusiva.

**N-46 · Sugerencia de ubicación.** En el ingreso, el operador necesita una sugerencia que considere posiciones libres, bloqueos, almacén, compatibilidad Drive-In, huella física y zona de la clase. Para productos de alta rotación, la lógica relevada favorece la accesibilidad del nivel 0, combinada con el orden espacial.

**N-47 · Advertencias de desvío.** Se necesita detectar productos fuera de su zona y clases sin zona definida. La zonificación relevada funciona como orientación y alerta; no quedó acordado que toda ubicación fuera de zona deba ser rechazada automáticamente.

Si no hay una posición válida, debe explicarse por qué no se puede sugerir un destino. La existencia de un grupo FOOD o NON FOOD en el maestro no significa que ya estén definidas todas las incompatibilidades de almacenamiento entre productos.

# 12. Preparación de pedidos

## 12.1 Carga del pedido

**N-48 · Pedido por viaje y destino.** El preparador debe poder informar el número de viaje, destino, prioridad y líneas de SKU con cantidades en bultos. Los SKU repetidos deben poder consolidarse para evitar un recorrido fragmentado por duplicación de líneas.

**N-49 · Importación de viajes.** Se necesita importar pedidos con viaje, entrega, sucursal o destino, SKU y bultos. La operación debe agrupar las líneas por viaje y conservar la información de destinos y cantidad de entregas para preparar e imprimir.

## 12.2 Disponibilidad y recorrido

**N-50 · Asignación según stock utilizable.** El sistema debe buscar stock del almacén seleccionado, excluir posiciones bloqueadas y cargas secundarias, convertir pallets a bultos cuando haya datos suficientes e informar faltantes. No debe ofrecer cantidades ficticias cuando falte una conversión.

**N-51 · Antigüedad y acceso físico.** Entre cargas elegibles se considera su antigüedad, sin violar el acceso LIFO del Drive-In. La búsqueda debe detenerse donde otra carga o un bloqueo impidan alcanzar el producto.

**N-52 · Recorrido de preparación.** Se necesita presentar un orden de visita, posición, SKU, cantidad y distancias de referencia, junto con los faltantes. La lógica existente aproxima un recorrido por cercanía entre posiciones; no equivale a una certificación de distancia real, navegación de autoelevadores ni ruta físicamente óptima.

**N-53 · Hoja de preparación.** El recorrido debe poder imprimirse con el viaje, prioridad, destino y detalle operativo. La operación necesita usarlo como guía aun cuando el preparador no tenga un celular disponible.

**Límite del relevamiento:** calcular o imprimir el pedido no quedó definido como reserva transaccional, confirmación de picking ni descuento automático del stock. La relación final entre preparación, registro de egreso y confirmación de SAP debe especificarse antes de cerrar ese alcance.

# 13. Conteos físicos e inventarios

## 13.1 Organización del trabajo

**N-54 · Identificación del inventario.** Cada campaña o recorrido debe tener un identificador de inventario, responsable, fecha de inicio y alcance: almacén, zona, pasillo y lado cuando corresponda. Los conteos de una misma campaña deben poder agruparse y consultarse juntos.

**N-55 · Asignación de recorrido.** Se necesita ordenar posiciones para el conteo, reconocer las completadas y las pendientes, y evitar registrar una ubicación ajena al recorrido o al almacén. Si una carga ocupa varias posiciones, debe contarse desde su posición principal sin duplicarla.

**N-56 · Conteo ciego.** El perfil Inventario necesita registrar lo que encuentra sin ver la cantidad esperada ni las diferencias del sistema. Supervisión y Administración deben conservar la capacidad de revisar los resultados y resolverlos.

## 13.2 Registro de lo encontrado

**N-57 · Tipos de resultado físico.** Debe poder registrarse posición vacía, bultos de un SKU, pallet monoproducto o pallet multiproducto con su detalle. Deben validarse cantidades, SKU y pertenencia a la campaña.

**N-58 · Comparación y estados.** Cada conteo debe conservar lo esperado, lo encontrado, observación, operador, responsable e inventario. Un resultado coincidente queda cerrado; una diferencia queda pendiente de revisión.

La lógica relevada compara SKU y cantidad de pallets en una carga monoproducto; en bultos o multiproducto compara el detalle de SKU y bultos. Esta diferencia de criterio debe ser conocida por quienes homologuen el futuro WMS.

## 13.3 Resolución y cierre

**N-59 · Ajuste autorizado.** Supervisión o Administración necesita revisar una diferencia y aplicar un ajuste explícito, vinculado con el conteo y con una referencia del estado anterior. El ajuste debe dejar identificados motivo, usuario y momento de aplicación.

**N-60 · Protección frente a cambios posteriores.** Si el stock se movió después del conteo, el sistema debe advertirlo y evitar aplicar una diferencia sobre una situación que ya no es la contada. Debe pedirse un nuevo relevamiento cuando la referencia dejó de ser válida.

**N-61 · Seguimiento y cierre.** Se necesita ver posiciones objetivo, relevadas y pendientes, porcentaje de avance, diferencias y ajustes. El cierre con posiciones sin contar debe advertir esa condición. El cierre y la revisión no corresponden al perfil de conteo ciego.

**N-62 · Exportación del inventario.** Se requiere exportar posiciones, ubicación principal, stock registrado, contenido, pallet, bloqueo, última actividad y resultados de conteo, con inventario, responsable y observaciones para su revisión.

# 14. Consulta, panel y visualización del depósito

**N-63 · Panel operativo.** El sector necesita ver posiciones totales, ocupadas, disponibles y porcentaje de ocupación, discriminados por el almacén seleccionado. También necesita información de ocupación por sector, últimos movimientos, productos con mayor presencia y posiciones bloqueadas.

**N-64 · Búsqueda de existencias.** Se debe poder filtrar por posición, pasillo, lado, rack, nivel, SKU, pallet y estado. La consulta debe mostrar contenido y detalle de una carga sin obligar a reconstruirlo desde movimientos sueltos.

**N-65 · Mapa y detalle de racks.** Se necesita una representación que ayude a ubicar físicamente la mercadería y diferencie libre, ocupada y bloqueada. El detalle debe permitir consultar una posición o rack y relacionarlo con la información operativa.

**N-66 · Representación 3D.** Se relevó un mapa 3D del CD, con filtros por sector, nivel, SKU, posición y zona, y controles de rotación, inclinación, desplazamiento y escala. Se debe conservar la relación entre la figura y el código real de la ubicación. No se da por relevado que todo nuevo almacén genere automáticamente un modelo 3D.

# 15. Historial, correcciones y auditoría

**N-67 · Historial consultable.** El sector necesita consultar movimientos por período, tipo, SKU, posición y pallet, y exportarlos. Deben reconocerse ingresos, reubicaciones, egresos, bloqueos, desbloqueos y ajustes según su función operativa.

**N-68 · Corrección y anulación controladas.** Supervisión y Administración requieren corregir registros erróneos o anularlos, sin perder la referencia del original. La consecuencia sobre las existencias debe quedar reflejada y no generar stock incoherente con movimientos posteriores.

**N-69 · Auditoría de maestros.** Las altas, importaciones, modificaciones y cambios de estado de almacenes y posiciones deben conservar usuario, fecha, operación, entidad afectada y valores antes/después. La auditoría es distinta del historial de movimientos de mercadería.

**N-70 · Distinguir limpieza local de operación central.** Reiniciar la información de un navegador no debe presentarse como un ajuste o una eliminación de la base central. Cualquier acción de restauración debe explicar su alcance para evitar pérdida o duplicación de registros pendientes.

# 16. Análisis, alertas y comparación con SAP

## 16.1 Indicadores de operación

**N-71 · Evolución de ocupación y actividad.** Se necesita consultar ocupación actual y su evolución en el período, promedio, pico, variación y cascada de cambios, con filtros temporales. También se requieren ingresos, egresos, reubicaciones, ajustes y movimientos por día.

**N-72 · Permanencia y utilización.** El sector necesita revisar permanencia de las cargas, utilización por sector o lado, materiales de mayor stock y posiciones sin movimiento prolongado. La referencia de inmovilidad incorporada es de treinta días; cualquier uso como objetivo o alarma formal debe confirmarse.

## 16.2 Reglas de cálculo relevadas

| Indicador | Regla o significado relevado |
|---|---|
| Ocupación | Posiciones ocupadas / posiciones consideradas × 100. Una carga de varias posiciones consume varias posiciones físicas. |
| Stock en bultos | Suma del detalle en bultos, o pallets monoproducto × bultos por pallet cuando la conversión está disponible. Se evita duplicar las posiciones secundarias. |
| Stock mínimo | Consumo diario estimado × días mínimos. |
| Stock máximo | Consumo diario estimado × días máximos. |
| Cobertura | Stock en bultos / consumo diario. Sin consumo o conversión suficiente no debe informarse una cobertura como dato cierto. |
| Diferencia SAP | Stock WMS − stock SAP, después de comparar en una unidad compatible. |
| Avance del inventario | Posiciones relevadas / posiciones objetivo × 100, reconociendo la huella de una misma carga. |
| Permanencia | Tiempo transcurrido desde el ingreso o la referencia de ocupación utilizada hasta el movimiento o consulta considerados. |

El prototipo también muestra una razón entre bultos de salida del período y stock actual. Esa medida no debe confundirse, sin definición adicional, con una rotación contable basada en stock promedio. El denominador de ocupación frente a posiciones inactivas o bloqueadas debe quedar formalizado al homologar los indicadores.

## 16.3 Alarmas de gestión

**N-73 · Alertas de stock y configuración.** Se necesita identificar stock por debajo del mínimo, por encima del máximo, conversiones faltantes, clases sin zona y productos fuera de su zona. Las alertas deben poder relacionarse con el SKU y su ubicación para que el responsable pueda actuar.

## 16.4 Conciliación con SAP

**N-74 · Comparar existencias.** Se necesita cargar la información de stock SAP, comparar por SKU contra las existencias del WMS y mostrar cantidad SAP, cantidad WMS, diferencia, posiciones involucradas y estado de revisión.

**N-75 · Visibilizar las diferencias.** Debe poder reconocerse cuántos SKU fueron comparados, cuántos presentan desvíos y cuál es la diferencia neta, priorizando para revisión los desvíos de mayor magnitud. Una conversión desconocida debe señalarse como un problema de datos, no como una diferencia física confirmada.

La necesidad relevada es la conciliación. No quedó definida una interfaz automática que contabilice movimientos en SAP, ni una frecuencia de intercambio, documento SAP o sentido de actualización. Una carga CSV de intercambio puede servir de entrada; eso no implica utilizar Excel como base del WMS.

# 17. Uso en el puesto, captura e impresos

## 17.1 Celular y computadora

**N-76 · Operación en distintos dispositivos.** Se necesita usar celulares para capturar operaciones y computadoras para consultar, administrar y supervisar, accediendo a la misma información central. La operación registrada en un dispositivo debe hacerse visible en el otro una vez confirmada.

**N-77 · Lectura de códigos.** El operador debe poder escanear posiciones, SKU y pallets, con alternativa de ingreso manual. Se relevaron lectura de Code 39 y Code 128, uso de cámara y alternativa de captura por foto, sujeto a la compatibilidad del dispositivo y del navegador.

**N-78 · Agilidad de registro.** El formulario debe acompañar la secuencia de trabajo, llevar el foco al siguiente dato y facilitar la carga con escáner o teclado. Los errores deben explicar qué dato o condición impide completar la operación.

## 17.2 Rotulado y documentación operativa

**N-79 · Etiquetas de posiciones.** Se necesita imprimir etiquetas con código de posición legible, código de barras Code 128 y referencia de pasillo, rack o posición y nivel. Deben poder seleccionarse por almacén, zona, lado, nivel y rack, con un orden útil para colocar el rotulado.

**N-80 · Mapa de orientación.** El sector necesita imprimir un mapa con las referencias y códigos del depósito para orientar personas y acompañar el rotulado. Debe conservarse la diferenciación de CD, Drive-In y Back Salón según el plano disponible.

**N-81 · Planilla manual de movimientos.** Debe existir un soporte imprimible para registrar operaciones cuando no haya celular disponible. Las operaciones anotadas deben poder incorporarse después conservando su referencia y sin confundirse con movimientos nuevos duplicados.

**N-82 · Exportaciones y plantillas.** Se necesitan archivos de revisión y plantillas para los maestros y procesos relevados: SKU, posiciones, movimientos, pedidos, inventarios y conciliación. Un archivo de intercambio no debe convertirse en la única copia de información central.

# 18. Información compartida y continuidad operativa

**N-83 · Registro central único.** La información de celulares y computadoras debe quedar en un mismo origen de datos. No debe depender de que un operador utilice siempre el mismo navegador o de que copie archivos manualmente de un equipo a otro.

**N-84 · Confirmación de guardado.** El sistema debe distinguir registro capturado, pendiente de enviar, confirmado centralmente y rechazado. Mostrar una URL configurada o abrir una pantalla no demuestra que el movimiento llegó a la base. Esta necesidad surgió expresamente al no visualizar en la computadora un movimiento registrado en el celular.

**N-85 · Pendientes y reintentos.** Frente a una interrupción, el operador debe conocer qué registros siguen pendientes y poder reenviarlos sin duplicarlos. Un rechazo por regla operativa debe mostrar su causa; no debe quedar oculto bajo un mensaje genérico de guardado correcto.

**N-86 · Operación simultánea.** Dos dispositivos no deben confirmar ocupaciones incompatibles sobre la misma posición ni descontar la misma existencia como si estuviera disponible para ambos. El resultado confirmado centralmente debe ser coherente para todos los usuarios.

**N-87 · Continuidad sin Internet.** La falta de acceso a Internet no debe impedir trabajar si los dispositivos pueden alcanzar el servidor en la red interna. La caída de Internet, la pérdida de Wi-Fi/LAN y una falla de SQL son situaciones diferentes y deben distinguirse al informar el estado del servicio.

No se definió un compromiso de funcionamiento completo sin conexión a la red interna. El soporte en papel y la conservación de pendientes son necesidades relevadas; no equivalen a autorizar cualquier operación desconectada sin comprobación central.

# 19. Condiciones del entorno futuro ya definidas

Estas son necesidades expresamente indicadas para el proyecto; no constituyen instrucciones de instalación.

| Tema | Definición relevada |
|---|---|
| Alojamiento | Toda la aplicación debe funcionar en IIS. |
| Sistema operativo | Windows Server 2022 disponible. |
| Base central | SQL Server disponible; toda la información de funcionamiento debe consultarse y guardarse allí. |
| Versión SQL | Informada como “SQL 2026”; debe identificarse la edición y versión efectiva antes de cerrar compatibilidad. |
| Acceso de usuarios | Red interna, desde computadoras y celulares autorizados. |
| Internet | El servidor no estará conectado a Internet durante el funcionamiento. |
| Dependencias externas | No depender de Google Sheets, Apps Script, servicios de Internet ni descargas externas en operación. |
| Excel | No utilizarlo como base de datos ni como fuente permanente del funcionamiento. Los archivos de importación/exportación son intercambios puntuales. |
| Arranque de la base | Comenzar con una base nueva, sin migrar el historial de Google Sheets. |
| Plano y maestros iniciales | Disponer de la estructura física necesaria para operar; la carga inicial de maestros debe distinguirse de importar historial o existencias anteriores. |

**N-88 · Persistencia central completa.** Ubicaciones y representación física, productos, pallets, existencias, movimientos, conteos, almacenes, usuarios, permisos, zonificación y datos operativos que deban conservarse deben tener una referencia central en SQL. Una copia temporal de pantalla no sustituye la persistencia.

**N-89 · Independencia de servicios de Internet.** Tanto la operación diaria como el acceso desde los dispositivos deben poder resolverse con los servicios internos disponibles. El futuro proyecto debe contemplar su instalación y mantenimiento en ese contexto.

**N-90 · Puesta en marcha sin historial previo.** La solución debe permitir cargar los maestros y realizar el relevamiento inicial sin exigir una migración de movimientos de Google Sheets. La existencia inicial debe validarse como una operación de arranque, no suponerse a partir de datos de demostración.

# 20. Información que el sector necesita conservar

El siguiente resumen reúne los objetos de información del relevamiento, sin imponer un diseño de tablas o una tecnología de programación.

| Información | Contenido y relaciones que deben preservarse |
|---|---|
| Almacén | Identidad, código, nombre, grupo, estado, posiciones y ámbitos autorizados. |
| Posición | Almacén, código y estructura física; estado, bloqueo y motivo; vínculo con la representación del depósito. |
| Producto | SKU, descripción, EAN, clasificación, conversiones, consumo y parámetros de gestión. |
| Pallet / carga | Identificador, SKU o contenidos, unidades, ubicación principal y huella de ocupación. |
| Existencia | Cantidad por almacén, posición, pallet y SKU, con unidad definida y sin duplicación por posiciones secundarias. |
| Movimiento | Identidad, tipo, fecha, operador, origen, destino, contenido, cantidades y condición de corrección/anulación. |
| Pedido / viaje | Referencia, destino, prioridad, entregas, líneas y cantidades utilizadas para la preparación. Su ciclo completo todavía necesita definición. |
| Inventario y conteo | Campaña, alcance, responsable, posiciones, esperado, encontrado, resultado, observaciones y estado. |
| Ajuste | Conteo de origen, estado anterior, cambio aplicado, motivo, autorizante y fecha. |
| Zonificación | Almacén, clasificación, rangos de posiciones y nivel considerados. |
| Legajo y acceso | Persona, rol, ámbito o almacenes permitidos, estado y referencias de actividad. |
| Auditoría | Entidad afectada, operación, usuario, fecha y datos anteriores/nuevos. |
| Conciliación SAP | Fuente y momento del dato comparado, SKU, unidad, stock SAP, stock WMS y diferencias. |
| Estado de envío | Identificador de operación, pendiente, confirmación o rechazo y causa. |

# 21. Reglas que deben permanecer explícitas en el proyecto

1. Una posición libre puede no estar disponible si está bloqueada, inactiva o fuera de la secuencia física permitida.
2. Un pallet puede contener varios SKU; un SKU puede encontrarse en varias posiciones o pallets.
3. Una carga que ocupa varias posiciones se cuenta una vez como carga y varias veces como ocupación física, sin duplicar bultos.
4. El almacén forma parte del contexto de cada posición, movimiento y conteo.
5. Las cantidades siempre deben interpretarse con su unidad: posición, pallet y bulto no son equivalentes.
6. Los datos faltantes de conversión deben quedar visibles; no justifican inventar existencias o diferencias.
7. En Drive-In, la posición accesible y el orden LIFO condicionan las alternativas de guardado y retiro.
8. Una sugerencia de guardado o ruta de preparación no equivale a un movimiento confirmado.
9. Un conteo que detecta diferencia no debe cambiar automáticamente el stock sin el ajuste autorizado correspondiente.
10. Un registro local pendiente no debe presentarse como si ya estuviera compartido entre todos los equipos.
11. La corrección, anulación, desactivación y eliminación tienen efectos diferentes y deben conservar su trazabilidad.
12. Un cambio de maestro no debe borrar ni volver ininterpretables las operaciones ya realizadas.

# 22. Definiciones pendientes, sin ampliar el alcance relevado

Los siguientes puntos necesitan precisión antes de contratar o implementar la solución definitiva. Su inclusión identifica lo que todavía no se acordó; no los presenta como nuevas funciones solicitadas.

| Tema a precisar | Definición que falta |
|---|---|
| Pedido y egreso | Cuándo se considera preparado, quién confirma y qué relación tiene con el descuento de stock. No se acordó una reserva automática. |
| SAP | Mecanismo de intercambio, unidad oficial, fecha de corte y eventual confirmación de documentos. Solo quedó relevada la comparación de existencias. |
| Accesos definitivos | Continuidad o reemplazo de claves compartidas por ámbito, política de sesión y asignación de una persona a varios almacenes. |
| Identificación del pallet | Alcance de la unicidad, tratamiento de los identificadores temporales y resolución de duplicados. |
| Stock monoproducto | Alcance del fraccionamiento de pallets cuando la existencia se cargó solo como pallet completo. |
| Códigos y modelo físico | Formatos a conservar por almacén y forma de mantener la geometría cuando cambien las ubicaciones. |
| Unidades y peso | Conversión oficial para cada proceso y significado del peso unitario; no se definieron capacidades máximas ni límites por rack. |
| Indicadores | Denominadores, fechas de corte, tratamiento de posiciones inactivas/bloqueadas y valores de objetivo. |
| Simultaneidad y tiempos | Cantidad de usuarios y dispositivos concurrentes, volumen diario, crecimiento y plazo esperado de actualización entre equipos. |
| Continuidad | Tiempo admisible de caída de LAN o SQL y procedimiento de recuperación de registros pendientes. |
| Transferencias | No quedó definido el flujo entre almacenes como una extensión automática de la reubicación interna. |
| Arranque | Responsables y forma de validar posiciones, SKU y existencias iniciales antes de la operación real. |

# 23. Índice de necesidades para revisión con el sector

| Bloque | Identificadores | Necesidad principal |
|---|---|---|
| Estructura operativa | N-01 a N-03 | Separar almacenes y reflejar el depósito. |
| Personas y acceso | N-04 a N-08 | Identificar responsables y limitar funciones/ámbitos. |
| Almacenes | N-09 a N-12 | Administrar su ciclo de vida y auditar cambios. |
| Posiciones | N-13 a N-21 | Mantener ubicaciones y su disponibilidad. |
| Productos y unidades | N-22 a N-26 | Mantener el catálogo y comprender el stock. |
| Pallets | N-27 a N-29 | Identificar y rastrear las cargas. |
| Movimientos | N-30 a N-38 | Registrar ingresos, traslados, salidas y cargas iniciales. |
| Reglas físicas | N-39 a N-44 | Controlar huellas, Drive-In y bloqueos. |
| Guardado y zonas | N-45 a N-47 | Orientar ubicaciones y detectar desvíos. |
| Preparación | N-48 a N-53 | Consolidar pedidos y guiar recorridos. |
| Inventarios | N-54 a N-62 | Contar, revisar diferencias y ajustar con responsabilidad. |
| Consulta y mapas | N-63 a N-66 | Encontrar mercadería y visualizar ocupación. |
| Historia y auditoría | N-67 a N-70 | Conservar evidencia y corregir con control. |
| Gestión y SAP | N-71 a N-75 | Analizar la operación y comparar existencias. |
| Puesto e impresos | N-76 a N-82 | Capturar datos y acompañar el trabajo físico. |
| Información compartida | N-83 a N-87 | Confirmar operaciones y resolver interrupciones. |
| Entorno y arranque | N-88 a N-90 | Operar con IIS y SQL internos desde una base nueva. |

# 24. Referencias del relevamiento

La consolidación se apoya en la conversación del proyecto y en las pantallas y reglas de GPS disponibles al 20 de octubre de 2026: administración multi-almacén y de posiciones, legajos y roles, registro de movimientos, maestro SKU, zonificación, pedidos, inventarios, mapas, análisis, conciliación y documentos operativos.

Referencia de revisión: repositorio **TS1511/WMS**, revisión **55496a6**, con documentación del backend de prueba versión **36**. Se revisaron `index.html`, `app.js`, los maestros de referencia y la documentación y reglas de `apps-script/`. Esta referencia permite ubicar el origen del relevamiento; no implica que todas las reglas estén verificadas contra una instalación productiva.

No se incorporan al alcance módulos generales de otros WMS que no fueron relevados en este proyecto. El documento busca conservar la necesidad del sector y dar continuidad al trabajo realizado, independientemente de la herramienta que finalmente se elija.
