# Supabase independiente y autenticación

## Proyecto propio

Proyecto nuevo: **Medicita Contigo**. Referencia: `iqisdeyxlzpxtlbkyero`. Región: São Paulo (`sa-east-1`).

- URL pública de API: `https://iqisdeyxlzpxtlbkyero.supabase.co`
- Callback de Google: `https://iqisdeyxlzpxtlbkyero.supabase.co/auth/v1/callback`
- La clave publicable se obtiene desde la configuración de API del proyecto nuevo.

Este proyecto no comparte tablas, usuarios, roles, credenciales ni tareas programadas con la aplicación original. Confirmar visualmente el nombre y la referencia antes de ejecutar cualquier SQL.

La migración inicial fue aplicada en este proyecto y verificó 19 tablas públicas con RLS. La revisión del 24 de noviembre de 2026 encontró siete perfiles reales, incluidos dos administradores, y una reserva confirmada. La base ya no está vacía. Estos registros se conservan; no se publican sus identidades en la documentación. El estado de las migraciones nuevas y su verificación se registra en [Actualización de noviembre](ACTUALIZACION_2026_11.md).

## Variables del cliente

```dotenv
VITE_SUPABASE_URL=https://iqisdeyxlzpxtlbkyero.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=CLAVE_PUBLICABLE_DEL_PROYECTO_NUEVO
VITE_EMAIL_LOGIN_ENABLED=false
```

Las variables `VITE_` se incluyen en el paquete del navegador. Solo admiten valores públicos. No colocar contraseñas de base de datos, `service_role`, `sb_secret_...`, secretos SMTP ni el Client Secret de Google en archivos del cliente, GitHub Variables o capturas de pantalla.

`web/src/config/public-project.json` contiene la URL y clave publicable del proyecto nuevo para que esta entrega no dependa de permisos para escribir variables de Actions. Los valores de entorno, si se completan, permiten sustituir esa configuración pública. El cliente comprueba que la URL corresponde a la referencia independiente esperada; no admite un cambio silencioso al backend original.

## Migraciones

El contenido del esquema inicial corresponde a `20261116033253_contigo.sql` y ya está instalado aquí: **no volver a ejecutarlo en este proyecto**. El historial alojado de esa instalación heredada usa una marca de versión distinta de la del archivo fuente. Antes de automatizar un `supabase db push`, inspeccionar el historial local y remoto y reconciliar esa entrada histórica con la administración del proyecto; no interpretar la diferencia como una instrucción para repetir la instalación inicial. Esta entrega no declara el historial heredado listo para un push genérico sin esa revisión. Para reproducir la instalación en otro proyecto vacío:

1. Confirmar que el proyecto nuevo está disponible y que no contiene una instalación anterior que se deba conservar.
2. Inspeccionar `supabase/migrations/` y aplicar las migraciones en su orden de nombre, únicamente al proyecto nuevo.
3. Ejecutar las pruebas de PostgreSQL y revisar tablas, RLS, permisos de RPC y asesores de seguridad.
4. Registrar la migración aplicada y no volver a ejecutar una migración inicial sobre tablas existentes.
5. Revisar `supabase/cron.sql` antes de habilitar mantenimiento periódico. Si Cron no está disponible, documentar que los recordatorios programados aún no se ejecutan; no simularlos con un temporizador del navegador.

El seed, si se utiliza, contiene solo datos explícitamente ficticios. La presentación reproducible del navegador no necesita insertar usuarios de prueba en un backend real.

## Migraciones aditivas de noviembre

Aplicar en orden, después de la migración inicial y únicamente al proyecto `iqisdeyxlzpxtlbkyero`:

1. `20261124205837_contigo_coronitas_20261124.sql`: reglas, procesos de atención, historial inmutable, galardones, validaciones y comunidad.
2. `20261124205903_contigo_comunicacion_visual_20261124.sql`: comentarios, reportes, moderación, llamados privados y preferencias visuales.
3. `20261124210142_contigo_dataset_diciembre_20261124.sql`: plantilla ficticia aislada, lectura pública limitada a ese conjunto y administración exclusiva por etiqueta.

Los nombres y versiones de las tres migraciones nuevas coinciden con el historial alojado:

| Versión | Nombre remoto |
|---|---|
| `20261124205837` | `contigo_coronitas_20261124` |
| `20261124205903` | `contigo_comunicacion_visual_20261124` |
| `20261124210142` | `contigo_dataset_diciembre_20261124` |

La aplicación usa sus RPC autorizadas; no requiere claves nuevas ni servicios de pago. Las reglas y la regeneración se explican en la [guía de actualización](ACTUALIZACION_2026_11.md). La suscripción Realtime de llamados tiene una consulta periódica de respaldo; no habilita notificaciones con la app cerrada. Verificar las migraciones instaladas antes de repetir una operación: no volver a ejecutar la migración inicial sobre una base existente.

## Mantenimiento instalado

La extensión `pg_cron` y el trabajo `medicita-contigo-maintenance` están activos en este proyecto nuevo, con programación `*/5 * * * *`. Ejecutan `public.run_maintenance()` desde el servidor para generar recordatorios internos y procesar vencimientos. El historial de aplicación queda en `public.system_runs` y el del programador en `cron.job_run_details`, accesibles al propietario, no al navegador público.

La función es idempotente: no duplica un recordatorio por repetir la tarea. Las consultas de disponibilidad verifican la expiración de las ofertas directamente, de modo que una oferta vencida no bloquea un cupo permanentemente aunque una ejecución se retrase. El resultado de ejecuciones observadas se documenta en [PRUEBAS](PRUEBAS.md).

La comprobación inicial del 16 de noviembre finalizó sin error y registró cero ofertas vencidas y cero avisos internos en la base entonces vacía. Esto verifica la ejecución de la tarea; todavía no acredita la recepción de recordatorios por usuarios reales.

## Google OAuth nuevo

El proveedor Google ya está habilitado con un cliente separado. Los siguientes pasos permiten revisar o reproducir su configuración, sin alterar el cliente OAuth de Medicita original:

| Campo en Google | Valor |
|---|---|
| Tipo de aplicación | Aplicación web |
| Origen JavaScript local | `http://localhost:5173` |
| Origen JavaScript publicado | El origen de la URL nueva confirmada, sin ruta |
| URI de redirección | `https://iqisdeyxlzpxtlbkyero.supabase.co/auth/v1/callback` |

Configurar nombre, correo de soporte y audiencia. Solicitar solamente identidad básica: `openid`, correo y perfil. Si el cliente está en pruebas, agregar las cuentas que participarán en la verificación como usuarios de prueba.

Guardar Client ID y Client Secret en Authentication → Sign In / Providers → Google del **proyecto nuevo**, activar y guardar. En URL Configuration establecer la URL completa nueva como Site URL y Redirect URL. Para desarrollo agregar `http://localhost:5173/` por separado. Confirmar con un ingreso real, perfil creado y cierre de sesión; la presencia de variables públicas no acredita que OAuth funcione.

Referencia oficial: [acceso con Google](https://supabase.com/docs/guides/auth/social-sign-in/auth-google) y [URLs de retorno](https://supabase.com/docs/guides/auth/redirect-urls).

## Correo mediante enlace seguro

La interfaz mantiene este acceso desactivado por defecto (`VITE_EMAIL_LOGIN_ENABLED=false`). El cliente puede solicitar un enlace de Supabase Auth cuando se active de forma explícita, sujeto a la configuración efectiva de SMTP y retornos. El SMTP incorporado está limitado a direcciones del equipo de la organización y actualmente a dos mensajes por hora; no tiene garantía de entrega para producción. Para otros destinatarios se requiere SMTP propio o un mecanismo autorizado. No se promete envío público ilimitado. [Restricciones SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [límites Auth](https://supabase.com/docs/guides/auth/rate-limits).

Un correo de acceso no es un recordatorio de cita. Los recordatorios implementados en la app son internos; cualquier envío externo debe activarse y verificarse aparte.

## Primer administrador y otros roles

En esta instalación ya existen administradores verificados; no se debe repetir la asignación inicial. El procedimiento siguiente es una referencia para una instalación nueva vacía. Todos los registros públicos empiezan como paciente. Después de que el propietario ingrese por un proveedor verificado, confirmar su correo, UUID e identidad en Authentication → Users del proyecto nuevo. La asignación inicial se realiza desde una sesión administrativa del proyecto:

```sql
-- Sustituir únicamente por el UUID de la cuenta comprobada del proyecto nuevo.
update public.profiles
set role = 'admin'
where id = 'UUID_VERIFICADO_DEL_NUEVO_PROYECTO';
```

Comprobar que cambió exactamente un perfil. El rol no debe provenir de un nombre editable, un parámetro de URL ni metadata modificable por el usuario. Posteriormente se utilizan las operaciones autorizadas de administración para personal nuevo. No publicar credenciales administrativas reutilizables.

## Plan gratuito y respaldo

Los límites consultados el 16 de noviembre de 2026 incluyen dos proyectos activos Free, 500 MB de base de datos por proyecto, 50.000 usuarios activos mensuales, 5 GB de salida y 1 GB de archivos. Un proyecto Free puede pausarse tras una semana de inactividad. Revisar siempre plan, cuotas y organización antes de crear recursos. No se contrató un servicio de mensajería como requisito. [Precios oficiales](https://supabase.com/pricing).

Definir copias de seguridad y una restauración ensayada antes de un piloto con personas reales. No asumir que Free incorpora los mecanismos o la retención de planes pagados.
