# Seguridad, datos personales y operación

Fecha de revisión documental: **16 de noviembre de 2026**. Este documento describe decisiones técnicas y asuntos que debe resolver el responsable del eventual piloto; no acredita certificación clínica, cumplimiento legal integral ni una auditoría externa.

## Acceso y mínimo privilegio

| Rol | Alcance previsto |
|---|---|
| Paciente | Sus reservas, espera, ofertas, perfil y preferencias |
| Recepción | Operaciones administrativas autorizadas, llegadas y boxes; sin configuración de roles |
| Administrador | Agenda, recursos, personal autorizado y reportes |
| Supervisor | Indicadores agregados y auditoría sanitizada; sin nombres ni reservas individuales de pacientes |

PostgreSQL vuelve a verificar cada operación. Las tablas expuestas deben tener RLS; los clientes no reciben escritura general ni permisos de ejecución sobre helpers internos. Los roles se consultan en registros administrados y nunca se confían a metadata editable del usuario. Las funciones privilegiadas deben tener autorización explícita, nombres cualificados y `search_path` restringido.

La sesión real se verifica con Supabase. Cambiar de cuenta, perder validación o cerrar sesión debe limpiar información y diálogos, descartar respuestas anteriores y detener la cámara. El personaje de la demostración no es una credencial ni un rol del backend real.

## Datos mínimos y finalidad

| Dato | Finalidad | Acceso |
|---|---|---|
| Identificador autenticado y correo | Vincular cuenta y gestionar acceso | Titular y personal estrictamente autorizado |
| Nombre y apellido | Identificación administrativa | Titular y personal de atención autorizado |
| Teléfono opcional | Contacto acordado | Titular y personal autorizado; no reportes públicos |
| Servicio, fechas, reserva y estados | Gestionar el registro independiente | Titular y personal según rol |
| Preferencias de avisos/accesibilidad | Personalizar uso y consentimiento de canales | Titular y procesos autorizados |
| Auditoría y entregas | Investigar operaciones y fallos | Personal autorizado, con minimización para supervisor |

No se solicitan RUT, diagnósticos, previsión ni fichas clínicas. Incluso una especialidad o fecha puede permitir inferir información de salud: no se trata como dato inocuo ni se publica con identidad.

## Marco chileno consultado

Al 16 de noviembre de 2026, la Ley 19.628 establece el marco vigente de protección de la vida privada. La Ley 21.719, publicada el 13 de diciembre de 2024, tiene su entrada principal en vigor el **1 de diciembre de 2026**; no debe presentarse esa reforma como plenamente vigente antes de esa fecha. Revisar el texto y modificaciones al comenzar un piloto. [Ley 19.628](https://www.bcn.cl/leychile/navegar?idNorma=141599), [Ley 21.719](https://www.bcn.cl/leychile/Navegar/imprimir?idNorma=1209272), [fecha de vigencia, BCN](https://www.bcn.cl/balance-legislativo/detalle/ficha_LEY_21719_2024-12-13).

La Ley 20.584 regula derechos y deberes vinculados a la atención en salud, incluida la reserva de información y las responsabilidades en salud digital. Su aplicación concreta depende del papel que asuma el establecimiento y del tratamiento efectivo; este prototipo no reemplaza una ficha clínica ni una revisión jurídica institucional. [Texto Ley 20.584, BCN](https://www.bcn.cl/leychile/Navegar?idNorma=1039348&idVersion=2026-02-16).

## Decisiones pendientes antes de datos reales

- Identificar al responsable del tratamiento y a sus encargados; establecer sus instrucciones y contratos.
- Determinar la base jurídica apropiada para cada finalidad y el alcance de consentimiento cuando corresponda; una cuenta Google no acredita inscripción en un CESFAM.
- Entregar un aviso comprensible con finalidades, destinatarios, contacto responsable y derechos. El nombre de un centro de estudio no es su autorización.
- Aprobar plazos de conservación, eliminación y tratamiento de auditorías. No se atribuye aquí un plazo legal único a todos los datos administrativos.
- Habilitar un procedimiento verificable de acceso, rectificación, eliminación y otras solicitudes aplicables. No hay un plazo contractual institucional inventado en la app.
- Evaluar proveedores, región de alojamiento, transferencias internacionales, subencargados y acceso de soporte; registrar autorizaciones y condiciones.
- Ensayar copias de seguridad, restauración, revocación de acceso y respuesta a incidentes.
- Revisar acceso de menores o representantes antes de admitirlo; el prototipo no implementa representación clínica.

## Controles técnicos y comprobación

Las reservas y reasignaciones son transaccionales. Se valida propietario, fechas, estados, disponibilidad, intervalos, permisos y expiración. Los textos introducidos se escapan; los RPC reciben parámetros tipados. Un QR contiene un token opaco y su conocimiento no autoriza leer datos privados ni validar llegadas.

No se guardan respuestas privadas en un service worker. La app no confirma reservas sin conexión. Los reportes exportados son agregados y deben proteger además de nombres directos los grupos pequeños que permitan reidentificación; definir umbrales de publicación antes de difundir resultados institucionales.

Revisar dependencias y lockfile, asesores de Supabase, límites de frecuencia, logs sin tokens, expiración de sesiones y pruebas de acceso entre cuentas. La ausencia de hallazgos en una prueba no demuestra ausencia de vulnerabilidades.

## Asesores del proyecto nuevo

Después de aplicar la migración se comprobaron las 19 tablas públicas con RLS y se revisaron estos avisos del asesor de seguridad:

| Aviso | Interpretación y control de esta entrega |
|---|---|
| `rls_enabled_no_policy` en `public.system_runs` | La tabla de ejecuciones de servidor no tiene una política de lectura para clientes. RLS aplica denegación por defecto; no se abrió una política pública para silenciar el aviso informativo. [Guía de revisión](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) |
| `authenticated_security_definer_function_executable`, 18 RPC públicas | La API necesita operaciones transaccionales privilegiadas que vuelven a comprobar identidad, propiedad y rol. Solo se conceden las RPC de la lista explícita; los helpers internos permanecen en esquema privado. El aviso requiere revisar cada función y sus permisos al cambiar el modelo, no se interpreta como una autorización para exponer nuevas funciones. [Guía de revisión](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) |

No se presenta el asesor como una revisión sin avisos ni como una auditoría externa. Las pruebas de acceso de pacientes, recepción y supervisión complementan esta revisión; no sustituyen una evaluación antes de un piloto con datos reales.

## Secretos e incidentes

Solo URL y clave publicable pueden entrar al cliente. Credenciales privilegiadas, claves SMTP y Client Secret de Google permanecen en servicios de servidor. No compartirlos por chat o capturas. Si se exponen: revocar/rotar en el proyecto afectado, revisar accesos y logs, reconstruir el cliente y gestionar la notificación conforme a las obligaciones aplicables. No se debe girar una clave del proyecto original como parte de esta actualización.

Los datos de demostración son ficticios y su reinicio borra solo el espacio de almacenamiento de Contigo; no deben mezclarse con cuentas o bases reales.
