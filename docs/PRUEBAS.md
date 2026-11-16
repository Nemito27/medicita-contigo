# Pruebas y evidencia

## Estado de este registro

La verificación de Medicita original no es evidencia automática de Contigo 2.0. Esta página debe registrar únicamente comandos y recorridos realmente ejecutados sobre la carpeta y backend nuevos. El estado inicial de la tabla es pendiente; se actualiza después de cada comprobación.

| Comprobación | Entorno | Resultado registrado |
|---|---|---|
| `npm ci` | Carpeta independiente | Pendiente de registrar ejecución final |
| `npm test` | Node.js y PostgreSQL embebido | Pendiente de registrar total y resultado |
| `npm run build` | Vite, proyecto nuevo | Pendiente de registrar ejecución final |
| `node --test tests/isolation.test.js` | Configuración, storage, remotos y árbol protegido local | **6/6 aprobadas**, sin omisiones, 16-11-2026 |
| Flujo A cancela → B acepta | Demostración ficticia | Pendiente de registrar recorrido |
| Anchos 320, 375, 390, 768, 1024 y 1440 | Navegador automatizado | Pendiente de registrar resultados por ancho |
| Teclado, foco, etiquetas y modo sencillo | Navegador | Pendiente de registrar comprobaciones |
| Migración y RLS remotos | Solo proyecto Supabase nuevo | Pendiente de aplicar/verificar |
| Google y cierre de sesión | Cuentas del proyecto nuevo | Pendiente de activar/verificar |
| Dos cuentas reales y sesión cambiada | Navegadores separados | Pendiente |
| iOS/Android físicos y lectores de pantalla | Dispositivos/usuarios | Pendiente |
| Prueba de uso con adultos mayores | Usuarios voluntarios y protocolo aprobado | Pendiente |

## Cobertura exigida al backend

La suite de aislamiento verificó plantilla de entorno sin fallback, ausencia de remoto de la app anterior, ausencia de claves privilegiadas en el cliente, simulación sin acceso de red, configuración separada y coincidencia byte a byte de los archivos originales protegidos. Las dos comprobaciones que requieren el checkout original se omiten explícitamente en una CI independiente donde ese árbol no se distribuye.

Reservas válidas, fechas pasadas y cupos ocupados; cruces por duración; cambio atómico que conserva la cita anterior ante errores; cancelación única y fecha de liberación; preferencias y retiro de espera; ofertas, rechazo, vencimiento y contención; lectura de citas ajenas, rol protegido y operaciones de recepción/supervisor; transiciones de llegada, atención y ausencia; métricas con futuros excluidos y recuperación efectiva sin duplicación.

Los tests con PGlite emulan roles y `auth.uid()` en una base independiente. Comprobar el esquema instalado requiere otra verificación; emular un usuario en SQL no equivale a iniciar sesión con Google desde un navegador.

## Interfaz y seguridad de sesión

Verificar navegación, formularios vacíos y erróneos, conservación segura de entradas, mensajes legibles, teclas Tab/Escape, foco al abrir/cerrar modales, expansión de texto y reducción de movimiento. Probar el cierre/cambio de cuenta mientras una carga o QR está pendiente: la respuesta anterior no debe volver a mostrar datos.

El estado de conexión debe impedir confirmar una operación offline como guardada. Ni la caché del service worker ni el cierre de sesión pueden revelar datos de una cuenta anterior.

## Concurrencia y límites

Un rechazo de una segunda reserva en secuencia comprueba restricciones, pero no acredita una prueba de carga simultánea. Si se ejecutan conexiones concurrentes, registrar número, escenario y resultado; no presentar un test secuencial como estrés real. Tampoco se declara compatibilidad universal por una captura de pantalla.

## Registro por fase

Al cerrar cada fase anotar commit, archivos relevantes, comandos, fecha, resultado y restricciones externas. Conservar logs sin tokens ni datos personales. Las capturas de demostración deben estar rotuladas como ficticias.
