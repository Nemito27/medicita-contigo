# Funcionalidades y estado de implementación

## Cómo leer el estado

La tabla distingue código preparado, configuración externa y verificación. Un botón visible no basta para declarar una función terminada. Los resultados ejecutados se registran en [PRUEBAS](PRUEBAS.md); los elementos pendientes no deben presentarse como servicios activos.

| Fase | Entrega y criterio | Estado de verificación |
|---|---|---|
| 1. Proyecto independiente | Copia y configuración propias, sin usar el backend anterior | Repositorio nuevo creado; compilación aprobada, 6 comprobaciones de aislamiento y migración aplicada solo al Supabase nuevo |
| 2. Interfaz | Bienvenida, paciente, personal, móvil, ayuda y accesibilidad | Implementada; 110 comprobaciones en Chromium, seis anchos de 320 a 1440 px |
| 3. Reservas | Estados, duración variable, cancelación y cambio atómico | Implementada; suite de 21 pruebas de PostgreSQL aprobada, con permisos y operaciones críticas |
| 4. Recuperación | Preferencias, candidatos, ofertas, respuesta, vencimiento y auditoría | Implementada; recorrido completo en navegador y 13 pruebas del adaptador ficticio aprobadas |
| 5. Comunicación | Avisos internos, lectura, preferencias y mantenimiento idempotente | Implementada y probada; tarea de servidor activa cada cinco minutos en el proyecto nuevo |
| 6. Administración | Agenda, recursos, permisos, cancelaciones, métricas y CSV | Implementada; roles y agregados comprobados, exportación CSV sin identidades en el recorrido de navegador |
| 7. Calidad/publicación | Pruebas, navegación móvil, documentación, demo y publicación nueva | 53 pruebas y compilación aprobadas; Pages configurado para GitHub Actions. Primera publicación, ingreso real y dispositivos físicos tienen estados propios en PRUEBAS |

## Pacientes

El recorrido disponible incluye próxima atención, historial, reserva, confirmación separada, cambio de hora con comparación, No podré asistir, espera editable por disponibilidad, ofertas, QR, avisos, perfil y ayuda. La cancelación explica que afecta solo al registro independiente. Los motivos son opcionales y administrativos.

El modo sencillo aumenta texto y áreas de interacción sin retirar operaciones esenciales. Alto contraste y reducción de movimiento son preferencias de uso; no acreditan por sí solas conformidad WCAG 2.2 AA sin evaluación.

## Administración

Recepción dispone de las operaciones autorizadas sobre agenda, espera, boxes y llegadas. Administración configura servicios, profesionales, duración, horarios, bloqueos y personal autorizado. Supervisor recibe informes agregados y auditoría sanitizada. Los controles del navegador no reemplazan los permisos de PostgreSQL.

Un cupo liberado, uno reasignado y uno recuperado efectivamente se muestran como conceptos distintos. El registro de inasistencia requiere personal autorizado y un plazo vencido; no se infiere de silencio ante un aviso.

## Canales y activaciones

| Función | Condición real |
|---|---|
| Demostración | Datos ficticios locales, identificados como simulación |
| Google | Proveedor activo y redirección inicial al cliente nuevo verificada; primer ingreso/cierre real todavía pendiente |
| Enlace de acceso por correo | Desactivado por defecto; requiere SMTP, destinatarios y límites reales de Supabase Auth |
| Avisos internos | Implementados y probados; se consultan desde la cuenta y no significan envío externo |
| Recordatorios programados | Mantenimiento idempotente probado y tarea de servidor activa cada cinco minutos; son avisos internos |
| Correo de recordatorio, SMS, WhatsApp | Integraciones opcionales/futuras; no se anuncian como enviadas |
| Escaneo QR por cámara | Sujeto a API y permiso del navegador; ingreso manual siempre disponible |
| Instalación PWA | Sujeta a soporte del navegador; no implica reservas offline |
| PDF | La vista permite imprimir o guardar PDF desde el navegador; no genera PDF firmados |
| Integración CESFAM/Telesalud | No implementada ni autorizada |

## Criterio de presentación

Se puede demostrar el flujo completo con personajes ficticios sin atribuir pacientes, métricas o profesionales al CESFAM Dr. Alfonso Leng. Los datos externos no configurados se declaran como pendientes y no se sustituyen silenciosamente por una simulación.
