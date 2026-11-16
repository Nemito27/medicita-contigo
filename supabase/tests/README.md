# Comprobación del backend instalado

`smoke.sql` se ejecuta completo, como propietario, únicamente en el proyecto independiente nuevo y después de las migraciones. No contiene DDL ni credenciales. Crea cuatro identidades SQL efímeras y recursos de prueba; comprueba reservas, cancelación, oferta, aceptación, permisos y reportes a través de los RPC instalados.

Al terminar fuerza una excepción controlada dentro de una subtransacción para revertir todas las filas de prueba y los cambios locales de rol y JWT. Después verifica que no quedaron fixtures. Un error inesperado se propaga y revierte el bloque; no se transforma en éxito. Las aserciones se activan explícitamente incluso si la sesión las tenía deshabilitadas. Las secuencias de identidad pueden avanzar, dejando huecos de numeración sin filas asociadas.

Ejecutar también el `SELECT` final, que devuelve JSON con `passed`, `assertions_enabled`, `fixtures_rolled_back` y las comprobaciones completadas. No ejecutar el bloque como un rol público ni desde el navegador.

Este recorrido usa identidades simuladas en SQL bajo el rol `authenticated`. Verifica PostgreSQL y RLS reales, pero no acredita ingreso con Google, una prueba de carga simultánea ni un recorrido desde dos navegadores. Esas pruebas se registran por separado.
