# Pruebas y evidencia

Fecha de registro: **16 de noviembre de 2026**. Estos resultados pertenecen a Medicita Contigo y a su backend nuevo. Las pruebas de Medicita original no se utilizan como evidencia automática de esta versión.

## Resultados registrados

| Comprobación | Entorno | Resultado |
|---|---|---|
| Instalación de dependencias | Carpeta independiente | Completada con `npm ci` |
| `npm test` | Node.js y PostgreSQL embebido | **53/53 aprobadas**, cero fallos y cero omisiones en la corrida local combinada |
| `npm run build` | Vite, proyecto nuevo | **Aprobada**, genera `dist/` |
| Aislamiento | Configuración, almacenamiento, remoto y árbol protegido local | **6/6 aprobadas**; archivos originales protegidos idénticos byte a byte |
| Auditoría de dependencias | Dependencias de producción y desarrollo | **0 vulnerabilidades informadas** por `npm audit` en la ejecución registrada |
| Interfaz adaptable | Chromium automatizado, 320, 375, 390, 768, 1024 y 1440 px | **110 comprobaciones aprobadas**, incluidas vistas de pacientes/personal, bienvenida y preferencias de accesibilidad |
| Flujo central | Demostración ficticia en Chromium | **Aprobado:** cancelación → candidato compatible → oferta → aceptación → llegada → atención completada |
| Métrica de recuperación | Escenario de demostración | Reasignación 1/recuperación 0 al aceptar; recuperación 1 después de completar la atención |
| CSV y supervisión | Navegador con personajes ficticios | CSV agregado sin nombres ni identificadores; supervisión sin identidades de pacientes |
| QR, formularios y foco | Navegador | QR dentro del diálogo, contención de Tab, Escape/cierre con restauración de foco; contenido de perfil escapado y borrador conservado ante error |
| Migración remota | Solo Supabase nuevo `iqisdeyxlzpxtlbkyero` | Aplicada; **19 tablas públicas con RLS** |
| Mantenimiento remoto | `pg_cron` del proyecto nuevo | Trabajo `medicita-contigo-maintenance` activo cada cinco minutos; ejecución manual completada, `error=null`, cero ofertas vencidas y cero avisos internos en la base vacía |
| Google, inicio del flujo | Supabase nuevo | Proveedor activo; respuesta 302 a Google con cliente independiente y callback nuevo correcto |
| Google, ingreso/cierre completo y primer administrador | Cuentas del proyecto nuevo | **Pendiente**; activar un proveedor no acredita un ingreso de usuario ni la asignación de administrador |
| Fuente y publicación | Repositorio nuevo | Fuente subida en `b6015f6`; Pages ya configurado como GitHub Actions. La primera CI aprobó pruebas y compilación, pero publicación falló antes de esa configuración. Nuevo despliegue y respuesta pública **pendientes de comprobar** |
| Dos cuentas Google reales | Navegadores separados | **Pendiente** |
| Safari, Firefox, Edge y dispositivos iOS/Android físicos | Navegadores/dispositivos | **Pendiente**; no se declara compatibilidad universal a partir de Chromium |
| Lectores de pantalla y uso con adultos mayores | Evaluación con usuarios | **Pendiente**; no se acredita conformidad integral WCAG 2.2 AA |

## Cobertura automatizada

| Suite | Pruebas | Alcance principal |
|---|---:|---|
| PostgreSQL | 21 | RLS, permisos, estados, reservas, intervalos, cambio atómico, cancelación, espera, ofertas, llegada, ausencia, recursos, reportes, recordatorios y continuidad del snapshot |
| Demostración | 13 | Escenario A/B reproducible, consistencia, expiración, preferencias completas, permisos, disponibilidad tras editar recursos y métricas de recuperación |
| Sesión e integración de formularios | 11 | Cambio de identidad, respuestas tardías, QR, recuperación de sesión, cierre de diálogos, almacenamiento propio y controles `name="id"` que no interrumpen el despacho de formularios |
| Aislamiento | 6 | Entorno independiente, remoto nuevo, ausencia de claves privilegiadas, simulación sin red y protección del original |
| Fechas y puerta de sesión | 2 | Invalidación por identidad y conversión de horas de Chile, incluidos cambios de horario |
| **Total local** | **53** | **Todas aprobadas** |

Las dos comprobaciones de aislamiento que necesitan el checkout original se omiten explícitamente en una CI independiente donde no se distribuye ese árbol. Una corrida remota puede, por tanto, informar esas omisiones justificadas; no deben confundirse con la corrida local de 53 aprobadas sin omisiones.

PGlite emula roles y `auth.uid()` en una base independiente. Esta evidencia no equivale a iniciar sesión con Google desde un navegador ni a una prueba de carga simultánea en el servicio remoto.

## Interfaz y escenario de presentación

La prueba reproducible está en `tests/browser-smoke.py` y utiliza Python, Playwright y Chromium. Requiere las herramientas de prueba instaladas y la aplicación sirviéndose por HTTP; no forma parte de `npm test` ni se ejecuta automáticamente con solo instalar las dependencias npm.

La revisión detectó y corrigió problemas de tamaño de controles, desbordamiento de informes, etiqueta de identificación asistida y despacho de formularios con un campo llamado `id`. Después se repitió el recorrido. La matriz final no informó desbordamientos de documento, identificadores duplicados, controles sin etiqueta, botones bajo el objetivo de 44 px ni errores JavaScript en las vistas comprobadas.

Las comprobaciones adicionales incluyeron modo sencillo y alto contraste a 320 px, QR dentro de la pantalla, navegación de foco del diálogo, contenido malicioso de prueba escapado en perfil y conservación del texto inválido para corregirlo. La inspección automatizada es básica: no sustituye pruebas con lectores de pantalla, usuarios ni dispositivos físicos.

El escenario demuestra la diferencia entre reservar, confirmar intención, llegar y completar una atención. Solo se cuenta recuperación efectiva cuando un cupo liberado termina siendo atendido por otra persona. Ninguna cifra del escenario pertenece a un CESFAM real.

## Backend, mantenimiento y acceso externo

La migración se aplicó solamente al proyecto nuevo. Se revisaron RLS y asesores de seguridad; los avisos y su interpretación están documentados en [SEGURIDAD](SEGURIDAD.md). El trabajo programado está activo en el servidor y no depende de un temporizador ni de una pestaña abierta. Su ejecución manual terminó sin error; registró cero vencimientos y cero avisos internos, coherente con una base todavía sin usuarios ni reservas.

El inicio de Google respondió con una redirección al proveedor correcto y un cliente separado del anterior. Siguen pendientes la vuelta completa a la aplicación publicada, la creación/verificación de un perfil real, el cierre de sesión y la asignación explícita del primer administrador. Los usuarios nuevos empiezan como pacientes.

## Límites de la evidencia

Un rechazo de una segunda reserva en secuencia verifica restricciones, pero no acredita una prueba de estrés concurrente. No se ensayaron carga sostenida, restauración completa de un respaldo, lectores de pantalla ni operación clínica. No se anuncian correo de recordatorios, SMS o WhatsApp como enviados.

Mantener logs y capturas sin tokens ni datos personales. Las capturas de la demostración deben conservar el rótulo de datos ficticios. El historial de despliegue y cualquier nueva aceptación con cuentas reales deben añadirse a este registro con su resultado efectivo.

## Verificación del backend instalado

Se ejecutó `supabase/tests/smoke.sql` únicamente en el proyecto nuevo. Las 15 comprobaciones pasaron con assertions habilitadas: perfiles y citas privadas, roles protegidos, helpers privados, reserva separada de confirmación, cambio fallido que conserva la reserva, cancelación única, candidatos, oferta supervisada, respuesta por su propietario, aceptación atómica, snapshot limitado, reasignación distinta de atención efectiva, exclusión de futuras en ausencias, supervisión agregada y rechazo anónimo. Todas las cuentas y filas temporales se revirtieron. Esta prueba simula identidades en SQL y no acredita un recorrido Google en dos navegadores.

Para repetir las pruebas de interfaz en Windows, con Python instalado:

```powershell
py -m pip install playwright tzdata
py -m playwright install chromium
# Mantener Vite abierto en otro terminal: npm run dev -- --port 5174
py tests/browser-smoke.py
```

El script utiliza Chromium del sistema si está disponible y, en su ausencia, el navegador de Playwright. Guarda evidencia en `work/browser-qa/` (excluida de Git). `CONTIGO_QA_URL`, `CONTIGO_QA_OUTPUT` y `CONTIGO_CHROMIUM_PATH` permiten indicar servidor, destino y navegador. Las 110 comprobaciones registradas arriba se ejecutaron en Chromium Linux; la portabilidad del script no sustituye una ejecución en Windows.
