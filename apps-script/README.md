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

Al primer acceso se crean las hojas `Legajos` y `Claves de Acceso`. El administrador puede cambiar después las claves de CD, Back salón y Todo Escobar desde **Administración > Legajos y roles**.

## Precauciones

- No guardar claves reales dentro de `Code.gs` ni en GitHub.
- No compartir `GPS_ADMIN_KEY_HASH`; funciona como credencial reutilizable contra esta API.
- El endpoint de la aplicación web es público por diseño. Toda acción sensible debe validarse en Apps Script.
- Después de modificar el backend hay que crear una nueva versión de la implementación; guardar el archivo no actualiza la URL publicada.
