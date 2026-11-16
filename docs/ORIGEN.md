# Auditoría de Medicita y reutilización

Fecha de revisión: 16 de noviembre de 2026. Base de lectura: Medicita, commit `84f1b26fc5eba29641632b4be5c56138b4898563`.

La revisión se realizó sobre la copia local del código. No se utilizó la base de datos original como entorno de desarrollo o de pruebas. No se copiaron claves privadas, usuarios, perfiles, roles ni configuraciones de OAuth al proyecto nuevo.

## Hallazgos y decisiones

| Elemento existente | Hallazgo | Uso en Contigo |
|---|---|---|
| Vite, HTML, CSS y JavaScript | Cliente estático compatible con publicación bajo una subruta | Conservar herramientas y separar responsabilidades en módulos |
| `web/src/main.js` | Vistas y formularios concentrados en un archivo | Reutilizar flujos y textos útiles; distribuir vistas, acciones, servicios y componentes |
| Protección de sesiones | Invalida consultas anteriores al cerrar sesión o cambiar de cuenta y protege QR tardíos | Mantener este principio al reorganizar la aplicación |
| Supabase Auth | Acceso con Google mediante PKCE y verificación de usuario | Nuevo proyecto y nuevo cliente OAuth; no reutilizar la configuración anterior |
| RPC de reservas | Bloqueos y cambios atómicos conservan la hora anterior ante errores | Extender a duración variable, estados nuevos y más permisos |
| RLS y permisos | Cada paciente accede a sus registros; helpers fuera del acceso del cliente | Mantener mínimo privilegio y comprobar nuevos roles |
| Agenda | Duración fija de 30 minutos, profesionales como texto | Servicios y profesionales administrables, intervalos reales y bloqueos |
| Estados | Una nueva reserva quedaba confirmada inmediatamente | Separar `reserved` de `confirmed`; agregar `no_show` validado por personal |
| Espera y ofertas | Compatibilidad por especialidad/rango, aceptación transaccional | Agregar días/jornada/preferencias, vencimiento y notificaciones internas |
| Métricas | Contaban ocupación y reasignaciones, sin equivaler a asistencia real | Reportes agregados; recuperación efectiva exige atención completada por otra persona |
| Lectura de datos | Descarga paginada de tablas completas | Consultas acotadas por fecha, filtros, rol y página |
| Mascota | Recurso Con Tigo disponible | Copiar el recurso gráfico a la app nueva sin cambiar el original |
| Pruebas | Casos de permisos, reserva, oferta y cambios de sesión | Conservar los escenarios útiles y agregar cobertura para nuevos contratos |
| Workflow | Destino y configuración ligados a Medicita | Workflow nuevo sin valores predeterminados del backend anterior |

## Comprobación de independencia

La carpeta nueva tiene su propio historial Git y no debe apuntar al remoto de Medicita. El archivo de ejemplo de entorno no contiene una URL operativa ni claves. La simulación usa un espacio de almacenamiento distinto y nunca llama al backend real.

La comprobación local compara las huellas del árbol original antes y después del trabajo. Esa evidencia no se sustituye por una afirmación basada solo en el nombre de la carpeta. `tests/isolation.test.js` comprueba configuraciones, claves privilegiadas, almacenamiento y destinos del nuevo checkout. En la revisión del 16 de noviembre de 2026 pasaron sus seis comprobaciones; los archivos del árbol original protegido coincidieron byte a byte con la huella inicial. La prueba se vuelve a ejecutar al cerrar la entrega.

## Límites de la auditoría

Es una revisión de ingeniería para el prototipo. No equivale a una auditoría externa de seguridad, certificación de accesibilidad ni autorización de un establecimiento de salud. Las pruebas del producto anterior no se presentan como resultados automáticos de la versión nueva.
