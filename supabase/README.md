# Backend independiente de Medicita Contigo

Aplicar las migraciones de `migrations/` en orden únicamente en un proyecto nuevo. La migración inicial incluye perfiles mínimos para cuentas que hubieran ingresado antes de instalar el esquema: todas reciben inicialmente el rol paciente, sin confiar en roles de metadata editable. Las cuentas posteriores se crean mediante un trigger.

Las operaciones de agenda comparten un bloqueo transaccional y validan intervalos reales, estado, pertenencia y permisos. El helper privado `slot_enabled` vuelve a validar recursos, prestaciones, jornadas y bloqueos al consultar disponibilidad, reservar u ofrecer; una modificación administrativa no deja cupos antiguos utilizables fuera de sus condiciones actuales.

## Mantenimiento del servidor

Después de confirmar que `pg_cron` está disponible, el propietario puede aplicar `cron.sql`. La tarea `medicita-contigo-maintenance` se ejecuta cada cinco minutos y es idempotente: actualiza ofertas vencidas y genera recordatorios internos sin duplicarlos. Los roles públicos no pueden ejecutar `run_maintenance`; solo el propietario y el rol de servidor autorizado.

`public.system_runs` registra resultados de ejecuciones terminadas. Revisar `cron.job_run_details` para fallos del programador o del SQL. Si Cron no se habilita, las ofertas vencidas no bloquean cupos porque las consultas comprueban la fecha de caducidad, pero los recordatorios programados no se generan automáticamente. No sustituir ese trabajo por un temporizador del navegador.

No hay envío externo de correos, SMS ni WhatsApp. `notification_deliveries` registra disponibilidad y lectura del canal interno; no representa entrega de mensajes externos. Los recordatorios incluyen contenido administrativo mínimo y respetan la configuración individual.

## Datos ficticios

La demostración del navegador es independiente del backend y permite repetir el flujo de liberación y recuperación. El `seed.sql` opcional solo agrega profesionales identificados como ficticios y cupos de los siguientes cinco días en una base de presentación; no crea pacientes, cuentas de ingreso ni administradores. Es idempotente para esos intervalos y evita superposiciones existentes. No se ejecuta automáticamente al instalar la aplicación.

## Pruebas

`node --test tests/database.test.js` utiliza PGlite, roles separados y una implementación local de `auth.uid()`. La prueba verifica el SQL real de las migraciones. No equivale a una autenticación real con Google ni a una prueba de carga simultánea sobre un servidor remoto. Antes de un piloto, comprobar el ingreso desde dos cuentas reales, la configuración de Cron y la restauración de una copia de seguridad.
