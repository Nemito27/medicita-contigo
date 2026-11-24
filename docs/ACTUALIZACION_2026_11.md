# Actualización 2.1 · noviembre de 2026

## Alcance y estado del trabajo

Esta actualización conserva el proyecto **Medicita Contigo**, el repositorio `Nemito27/medicita-contigo` y su dirección pública:

https://nemito27.github.io/medicita-contigo/

La rama de implementación es `feature/coronitas-visual-comunidad`. Las tres migraciones aditivas se aplicaron y verificaron en el backend de Contigo; sus archivos coinciden con las versiones alojadas `20261124205837`, `20261124205903` y `20261124210142`. La diferencia histórica de versión del esquema inicial se documenta en [SUPABASE](SUPABASE.md#migraciones) y debe revisarse antes de usar un push automático de migraciones. La publicación de la actualización debe registrarse aquí únicamente después de que las comprobaciones y el despliegue hayan terminado. La versión anterior `/medicita/` y su base de datos no son destinos de esta actualización.

Las reservas, confirmaciones, cambios atómicos, cancelaciones, espera, ofertas, boxes, perfiles y reportes existentes se conservan. La aplicación sigue siendo independiente de las agendas oficiales de los CESFAM.

## Coronitas: reglas y significado

Las coronitas son reconocimientos simbólicos. No tienen valor monetario, no otorgan descuentos y no intervienen en la asignación ni prioridad de las horas.

| Evento válido | Coronitas | Límite |
|---|---:|---|
| Bienvenida | 5 | Una vez por cuenta, incluidos los usuarios existentes que no la hayan recibido |
| Perfil básico completo | 3 | Una vez |
| Confirmación antes del inicio | 2 | Una vez por proceso de atención; un cambio de hora conserva ese proceso |
| Atención con asistencia validada por el personal | 10 | Una recompensa válida por proceso; las correcciones quedan auditadas |

Reservar, cancelar, comentar, abrir la app, mirar un QR o pulsar un botón de accesibilidad no concede coronitas. No hay descuentos automáticos por ausencia, enfermedad o cancelación.

El saldo se obtiene del historial del servidor. El navegador no puede editar el saldo, crear una asistencia válida ni concederse galardones. Los ajustes del administrador requieren un motivo. Una corrección agrega un movimiento compensatorio y conserva el movimiento original para auditoría.

Los niveles son Primera corona (5), Corona de bronce (20), Corona de plata (50), Corona de oro (100) y Corona Con Tigo (200). Desbloquear un galardón no consume coronitas. Las misiones de bienvenida, perfil, primera confirmación y una, tres o cinco asistencias muestran progreso verificable; sus galardones no añaden un bono de coronitas adicional.

### Configuración y comprobación

En una cuenta de administrador, abrir **Personas y coronitas → Reglas de coronitas → Cambiar regla**. El formulario exige un motivo de 8 a 300 caracteres y llama a `save_reward_rule(p_key,p_amount,p_reason)`. Solo admite las claves `welcome`, `profile`, `confirmation` y `attendance`, con cantidades enteras de 0 a 100. Los cambios rigen para eventos futuros; no reescriben premios anteriores. El importe de una asistencia queda asociado a su proceso, también al corregirla y restablecerla.

La bienvenida y el perfil tienen restricciones únicas por cuenta. La confirmación y la asistencia se vinculan a `care_process_id`, que se conserva al reagendar. `get_my_rewards()` y `get_reward_history()` obtienen el saldo y los movimientos; el saldo se deriva de la suma del historial, no de una cifra editable del perfil. La migración asigna la bienvenida una vez a las cuentas existentes y el premio de perfil a quienes ya tenían un perfil válido y marcado como completado. No asigna asistencia a citas futuras.

En **Personas y coronitas**, el administrador puede buscar, filtrar por nivel, ordenar y abrir **Ver historial y galardones**. **Ajuste administrativo** agrega un movimiento con motivo mediante `adjust_coronitas`. **Corregir asistencia registrada**, disponible en una asistencia corregible del historial, usa `correct_attendance`: añade una reversión, conserva el original y devuelve la cita al estado de llegada registrada. Una validación posterior legítima restaura el importe correspondiente sin multiplicar el premio neto.

La comunidad solo muestra alias, avatares del catálogo, coronitas y nivel de quienes aceptaron participar. No muestra correos, teléfonos, reservas, motivos de consulta, diagnósticos ni historiales de asistencia. La participación se puede retirar; cada persona sigue viendo su propio saldo aunque no participe.

## Jornadas ficticias de diciembre

El conjunto identificado como **`medicita-december-2026-v1`** se prepara por separado de las agendas y cuentas reales. No crea usuarios de autenticación con contraseñas compartidas y no dispara comunicaciones externas.

Cantidades comprobadas en el generador, la plantilla instalada en Supabase y su apertura en el navegador:

| Jornada en `America/Santiago` | Cupos | Ocupados | Sin reserva |
|---|---:|---:|---:|
| 3 de diciembre de 2026 | 176 | 120 | 56 |
| 4 de diciembre de 2026 | 176 | 126 | 50 |
| 5 de diciembre de 2026 | 176 | 114 | 62 |
| **Total** | **528** | **360** | **168** |

El modelo utiliza 12 profesionales ficticios, ocho boxes y 120 personas ficticias, cinco tipos de atención, cupos de 30 minutos de 08:00 a 20:00 y una hora de descanso por box. Los roles técnicos del presentador se distinguen del registro de pacientes ficticios. Una oferta pendiente puede reservar temporalmente un cupo sin que todavía exista una reserva; por eso los cupos sin cita y los cupos realmente disponibles deben informarse por separado.

El generador y sus pruebas comprueban conflictos de profesional, box y paciente, concordancia de especialidades, actividad de mañana y tarde e idempotencia. Las reservas futuras no se marcan como atendidas. Cualquier historial pasado que ilustre un galardón es ficticio, tiene fechas coherentes y sus coronitas proceden de movimientos de historial.

La plantilla de demostración se conserva en un registro separado del servidor. Las interacciones del presentador se ejecutan en el adaptador de simulación y se guardan en el navegador, tal como indica el rótulo de demostración. Esta simulación no representa movimientos de usuarios reales del servidor. La regeneración o retirada debe afectar solo al identificador de este conjunto.

Los accesos rápidos **3, 4 y 5 de diciembre** están en el ingreso, el inicio y la agenda. También se pueden abrir directamente:

- [3 de diciembre](https://nemito27.github.io/medicita-contigo/?demo=1&dataset=december-2026&day=2026-12-03)
- [4 de diciembre](https://nemito27.github.io/medicita-contigo/?demo=1&dataset=december-2026&day=2026-12-04)
- [5 de diciembre](https://nemito27.github.io/medicita-contigo/?demo=1&dataset=december-2026&day=2026-12-05)

Elegir **Administración** o **Recepción** en el selector de personajes para revisar la agenda completa. Los filtros conservan la jornada elegida; el reloj real no se cambia. La paginación permite recorrer todos los cupos de cada día. El selector incluye las 120 personas ficticias y los tres actores técnicos.

El generador reproducible está en `scripts/generate-december-demo.mjs`; `node scripts/generate-december-demo.mjs` reconstruye el JSON del repositorio. La migración `20261124210142_contigo_dataset_diciembre_20261124.sql` crea el registro aislado y la plantilla; `supabase/demo-december-2026.sql` permite repetir la carga del conjunto sin duplicarlo. Ninguno inserta pacientes ficticios en `auth.users`, perfiles o agendas reales.

Con una cuenta administradora real, abrir **Configuración → Conjunto ficticio de diciembre** para regenerar o retirar únicamente `medicita-december-2026-v1`. Las acciones llaman a `manage_demo_dataset(p_action,p_tag)`, con `reset` o `retire`, y quedan auditadas. `get_demo_dataset(p_tag)` devuelve únicamente el conjunto ficticio activo; retirar el conjunto impide nuevas aperturas desde el servidor. Regenerar lo reactiva con la plantilla inicial.

**Reiniciar** dentro de la demostración restablece solo la copia de ese escenario en ese navegador. Regenerar o retirar la plantilla del servidor no borra copias locales ya abiertas en otros navegadores. Para volver al ejemplo nuevo en un navegador, usar Reiniciar o retirar su almacenamiento específico: `medicita-contigo-demo-v2:medicita-december-2026-v1`. El escenario pequeño anterior usa otra clave y se conserva separado.

## Comentarios de boxes

Los comentarios sirven para observaciones de experiencia y organización. No constituyen un canal de urgencias ni deben incluir diagnósticos, datos personales o información de otras personas.

En **Boxes → Comentarios**, el servidor valida un máximo de 500 caracteres, palabras configuradas y evasiones comunes, 30 segundos entre publicaciones, cinco publicaciones por hora y duplicados de las últimas 24 horas. Los autores pueden editar su contenido publicado o pendiente durante 24 horas y retirarlo posteriormente. En **Moderar comentarios**, administración consulta reportes, decide el estado con motivo y mantiene las expresiones del filtro; el personal autorizado puede responder como Equipo Medicita. Los reportes, las respuestas del personal y la moderación conservan trazabilidad. Los estados distinguen publicado, pendiente de revisión, oculto y retirado.

La ayuda del navegador no sustituye la validación del servidor. El contenido se representa como texto, escapando HTML. El filtro de palabras tiene límites: no detecta por sí solo todas las expresiones ofensivas ni resuelve sus contextos; el reporte y la revisión manual siguen disponibles.

## Modo visual y llamados al box

El modo **“Modo visual: personas sordas o con dificultades auditivas”** está disponible desde el ingreso y el perfil. Los avisos deben poder entenderse sin sonido, con texto, icono y estado. La vibración es opcional y depende del dispositivo; no reemplaza la alternativa visual.

Un llamado procede de una acción de personal autorizado sobre una reserva con llegada registrada. No se deduce del estado libre de un box. El aviso privado permite responder **Entendido** o **Necesito ayuda**, y el personal consulta recepción y respuesta. Los llamados pendientes deben recuperarse al reconectar.

El panel público de sala muestra únicamente un código opaco de turno y el box. No expone nombres, contactos ni motivos de atención. Los avisos dentro de una pestaña abierta no acreditan notificaciones de fondo con la app cerrada. No se presentan traducciones no verificadas a Lengua de Señas Chilena.

Antes de iniciar sesión se conservan localmente las preferencias y cuáles cambió expresamente la persona. Al entrar, las preferencias de la cuenta prevalecen; únicamente esas elecciones locales pendientes se asocian a la cuenta mediante `save_accessibility_preferences`. Después de guardarlas se elimina la marca pendiente. Un valor por defecto de un dispositivo nuevo no sobrescribe la cuenta. Si falla el guardado, la preferencia sigue aplicándose en ese dispositivo y se reintenta al actualizar. Esta operación no completa el perfil ni concede coronitas.

El personal abre **Llamados al box** o pulsa **Llamar al box** en una cita de Agenda con llegada registrada. El paciente ve el aviso también dentro de un diálogo abierto, conserva su borrador y puede responder. La conexión Realtime acelera la entrega cuando está disponible; una consulta cada diez segundos y al reconectar recupera los llamados pendientes. No se usa audio ni parpadeo como requisito.

Para una pantalla de sala se utiliza `?sala=todas` o `?sala=UUID_DEL_BOX`. La consulta pública devuelve solamente turno opaco, box, fecha y estado. Los avisos anteriores y su lectura siguen en **Avisos**. En una demostración, `?demo=1&sala=todas` muestra solo los turnos de la copia ficticia local.

## Verificación de la actualización

Las comprobaciones de esta tabla pertenecen a la actualización del 24 de noviembre. Los resultados anteriores se conservan como evidencia histórica en [PRUEBAS](PRUEBAS.md), no como una ejecución automática de los módulos nuevos.

| Grupo | Comprobación | Estado |
|---|---|---|
| Recompensas | Bienvenida única, perfil, confirmación por proceso, asistencia autorizada y corrección | Aprobadas en Node/PGlite y smoke del servidor; navegador verificó cambio sin premio repetido y corrección/restablecimiento netos de 10 |
| Recompensas | Galardones, progreso, ajustes auditados y privacidad de comunidad | Aprobadas; activación/retiro de alias, saldo propio e historial del ajuste comprobados en Chromium |
| Agenda ficticia | Cantidades, intervalos, especialidades, etiquetas e idempotencia | Aprobadas; plantilla del servidor y jornadas 176/176/176 con 120/126/114 reservas; accesos rápidos no cambian el reloj |
| Comentarios | Insultos, evasiones, falsos positivos, permisos, límites, reportes y representación segura | Aprobadas en servidor/PGlite; publicación, reporte, ocultamiento, rechazo y texto HTML seguro verificados en Chromium |
| Modo visual | Llamado privado, respuesta sin audio, reconexión y avisos dentro de diálogos | Aprobadas; dos pestañas ficticias, borrador conservado, recibido/ayuda/entendido, recarga y pantalla pública sin identidades |
| Interfaz | Móvil, tablet, computador, teclado y controles con etiqueta | 44/44 comprobaciones nuevas a 320, 390, 768 y 1440 px; sin desbordamiento, IDs duplicados, controles sin etiqueta ni botones bajo 44 px en las vistas revisadas |
| Regresión | Pruebas anteriores, conservación de operaciones y compilación | `npm test`: 135 totales, 133 aprobadas y dos omisiones justificadas; build aprobado; 110 comprobaciones de interfaz anteriores aprobadas |
| Instalado | Migraciones no destructivas, RLS, datos existentes y funciones del servidor | Aplicadas en Contigo; smoke del servidor aprobado con fixtures revertidos; agenda real conservada |
| Publicación | CI, mismo enlace público y recursos servidos | Pendiente de publicar la actualización |

La compilación 2.1.0 revisada y el resumen sanitizado de las seis suites de navegador se conservan en [evidencia de Chromium](evidencia/chromium-update-summary.json). Los diez resúmenes de flujo pasaron y no se registraron errores JavaScript ni de consola. Las dos omisiones de `npm test` corresponden a comprobaciones que requieren el checkout y la huella del árbol original, ausentes en este workspace; no se omiten las pruebas nuevas.

El smoke alojado `tests/hosted-update-smoke.sql` comprobó permisos, recompensas, correcciones, comentarios, preferencias, llamados y administración del conjunto en la base real de Contigo dentro de una transacción revertida. La revisión posterior confirmó la conservación de la agenda anterior y ausencia de cuentas/filas temporales de esa prueba.

El recorrido adicional de interfaz se automatiza en `tests/update-browser-smoke.py`. Su ejecución en Chromium gestionado no confió en el certificado del proxy para la lectura pública del conjunto de diciembre. Se repitió ese grupo con `CONTIGO_QA_READ_BRIDGE=1`: Python hizo la misma petición HTTPS al servidor real, con verificación de certificado predeterminada, y entregó su respuesta al navegador. No se sustituyó el conjunto por un fixture local ni se desactivó TLS. Este puente se limita a `get_demo_dataset` y queda registrado en el JSON de evidencia; no acredita por sí solo la conexión TLS nativa de otros dispositivos. La prueba de demostración en Chromium y las pruebas SQL con identidades simuladas son evidencias distintas; ninguna acredita una prueba con dos cuentas Google reales ni compatibilidad en dispositivos físicos.
