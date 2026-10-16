# Backend de Google Apps Script

El código no contiene contraseñas ni hashes reutilizables. La clave inicial de `Todo Escobar` se guarda como una propiedad privada del proyecto de Apps Script.

## Configuración inicial

1. Abrir el proyecto de Apps Script asociado a la planilla.
2. Reemplazar `Code.gs` por la versión de este directorio.
3. En **Configuración del proyecto > Propiedades de la secuencia de comandos**, crear temporalmente:
   - Propiedad: `GPS_INITIAL_ADMIN_KEY`
   - Valor: la clave administrativa inicial de seis dígitos.
4. Ejecutar manualmente la función `configureGpsAdminKey` y aceptar los permisos solicitados.
5. Confirmar que `GPS_INITIAL_ADMIN_KEY` fue eliminada y que existe `GPS_ADMIN_KEY_HASH`.
6. Crear una nueva versión de la aplicación web y actualizar la implementación activa.

Al primer acceso se crean o completan automáticamente las hojas necesarias. El administrador puede cambiar después las claves de CD, Back salón y Todo Escobar desde **Administración > Legajos y roles**.

## Hojas utilizadas por la versión multi-almacén

- `Hoja 1`: movimientos, ahora asociados mediante `almacen_id`.
- `Maestro SKU`: catálogo global de productos.
- `Almacenes`: depósitos configurados y su estado.
- `Posiciones`: posiciones de almacenes nuevos y ajustes administrativos sobre posiciones base de Escobar.
- `Auditoria Maestros`: altas, cambios de estado, modificaciones e importaciones de almacenes y posiciones.
- `Zonas SKU`: zonificación por clasificación y almacén.
- `Conteos Inventario`: resultados de conteos asociados al almacén.
- `Sesiones Activas`: presencia de usuarios y almacén activo.
- `Legajos` y `Claves de Acceso`: usuarios, roles y claves compartidas por ámbito.

Las posiciones actuales de CD Escobar y Back Salón continúan embebidas en la aplicación para preservar el mapa existente. La hoja `Posiciones` almacena únicamente sus cambios administrativos y el maestro completo de los almacenes nuevos.

## Actualización de la aplicación web

1. Sustituir `Code.gs` por esta versión.
2. Guardar el proyecto.
3. Crear una **nueva versión** de la implementación web; editar el código sin versionar no actualiza el endpoint usado por GPS.
4. Mantener la ejecución como propietario del script y el acceso definido para la prueba interna.
5. Abrir GPS, iniciar sesión como administrador y comprobar que el backend informe la versión `36` en sus respuestas.
6. Crear primero el almacén y después importar sus posiciones desde **Administración de posiciones**.

La importación no sobrescribe códigos existentes. Si un lote se interrumpe, se conserva lo confirmado hasta ese punto y el reintento informa los duplicados; esta es una limitación conocida del transporte JSONP usado por el prototipo.

## Precauciones

- No guardar claves reales dentro de `Code.gs` ni en GitHub.
- No compartir `GPS_ADMIN_KEY_HASH`; funciona como credencial reutilizable contra esta API.
- El endpoint de la aplicación web es público por diseño. Toda acción sensible debe validarse en Apps Script.
- Después de modificar el backend hay que crear una nueva versión de la implementación; guardar el archivo no actualiza la URL publicada.
- Google Sheets y Apps Script siguen siendo una arquitectura de prueba. La separación por almacén y las validaciones administrativas están implementadas, pero la seguridad y transaccionalidad definitivas se completarán al migrar a la API interna y SQL Server.
