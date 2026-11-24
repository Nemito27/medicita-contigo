# Medicita Contigo 2.1

**Menos horas perdidas, más oportunidades de atención.**

Aplicación independiente de gestión administrativa de reservas, cancelaciones, espera y recuperación de cupos. Conserva la mascota Con Tigo y reutiliza los patrones de reservas y permisos de Medicita con una estructura modular.

Es un prototipo avanzado para evaluación y presentaciones. Actualmente no está conectado con agendas oficiales de CESFAM, Telesalud ni plataformas del Estado. Una reserva o cancelación afecta únicamente a este sistema.

[Abrir la aplicación publicada](https://nemito27.github.io/medicita-contigo/) · [Código y revisión de la actualización](https://github.com/Nemito27/medicita-contigo/pull/1)

## Actualización de noviembre de 2026

La actualización incorpora **Mis coronitas** (niveles, seis misiones, galardones e historial), **Comunidad** opcional con alias, **Personas y coronitas** para administración, comentarios moderados de boxes y llamados visuales privados con respuesta. Las coronitas son simbólicas y no modifican la prioridad de atención.

La agenda ficticia de los [días 3](https://nemito27.github.io/medicita-contigo/?demo=1&dataset=december-2026&day=2026-12-03), [4](https://nemito27.github.io/medicita-contigo/?demo=1&dataset=december-2026&day=2026-12-04) y [5 de diciembre de 2026](https://nemito27.github.io/medicita-contigo/?demo=1&dataset=december-2026&day=2026-12-05) contiene 528 cupos, 12 profesionales, ocho boxes y 120 pacientes inventados, separados de las cuentas y reservas reales. La plantilla se conserva en el servidor; las acciones de la demostración siguen siendo una simulación persistida en ese navegador.

Consultar [la guía de actualización](docs/ACTUALIZACION_2026_11.md) para rutas, reglas, regeneración, pruebas y estado de publicación. Las cifras de pruebas del 16 de noviembre que aparecen más abajo son evidencia histórica; los resultados de esta actualización se registran por separado.

## Ejecutar en el computador

Requiere Node.js 22 o superior y npm. Desde esta carpeta:

```sh
npm ci
npm run dev
```

Abrir la dirección local que indique Vite. La demostración utiliza personajes y datos ficticios y dispone de un reinicio reproducible; no requiere un servicio pagado ni una cuenta clínica. El código incluye únicamente la configuración pública del proyecto independiente; el estado del acceso real y del primer administrador está en [SUPABASE](docs/SUPABASE.md).

```sh
npm test
npm run build
npm run preview
```

`npm run build` genera `dist/`. Se debe servir la carpeta completa mediante HTTP/HTTPS; abrir `web/index.html` por `file://` no ejecuta correctamente módulos ni OAuth.

## Separación de entornos

| Entorno | Datos y acceso |
|---|---|
| Demostración | Datos ficticios en el navegador; selector de personajes únicamente dentro de la simulación |
| Backend independiente | Proyecto nuevo de Supabase, usuarios autenticados, permisos y operaciones PostgreSQL |
| Medicita original | Fuente de código consultada en modo de lectura; no es destino de migraciones ni de publicación |

El proyecto Supabase nuevo se llama **Medicita Contigo**, en la región São Paulo. La migración inicial instaló 19 tablas públicas con RLS. Las migraciones aditivas de noviembre amplían ese esquema; su instalación y verificación actuales se registran en la guía de actualización. `web/src/config/public-project.json` contiene solo su URL y clave publicable; no contiene secretos ni configuración del backend anterior. `.env.example` conserva valores vacíos para documentar las variables de una instalación local.

## Funciones y verificación

El flujo central es: **cancelar → liberar el cupo → revisar candidatos compatibles → ofrecer → aceptar → registrar llegada y atención**. Este recorrido pasó en Chromium con datos ficticios. El informe muestra una reasignación al aceptar y cuenta el cupo como recuperado únicamente después de que otra persona complete la atención.

La entrega inicial del 16 de noviembre implementó estados de reservas, duración variable, cambio atómico, preferencias de espera, avisos internos, perfiles y accesibilidad, QR con alternativa manual, agenda, recursos, permisos por rol, indicadores y CSV. Registró **53 pruebas automatizadas**, compilación y **110 comprobaciones de interfaz en Chromium**, en seis anchos de 320 a 1440 px. La versión 2.1 conserva esas funciones y añade las verificaciones documentadas en la guía de actualización. Esto no equivale a probar todos los navegadores o dispositivos físicos.

El mantenimiento de servidor está configurado cada cinco minutos en el proyecto nuevo; los recordatorios son internos. La revisión de dependencias, incluidas las de desarrollo, informó cero vulnerabilidades en la ejecución registrada.

El repositorio nuevo es [Nemito27/medicita-contigo](https://github.com/Nemito27/medicita-contigo). Pages ya está configurado para GitHub Actions; la primera publicación con esa configuración y el ingreso real se registran por separado en [DESPLIEGUE](docs/DESPLIEGUE.md) y [PRUEBAS](docs/PRUEBAS.md). La revisión del 24 de noviembre encontró cuentas y administradores reales en el proyecto. Esto no sustituye una nueva prueba interactiva con dos cuentas Google durante esta actualización.

Consultar [FUNCIONALIDADES](docs/FUNCIONALIDADES.md) para el alcance y [PRUEBAS](docs/PRUEBAS.md) para resultados y limitaciones comprobados. Correo externo de recordatorios, SMS, WhatsApp e integración institucional no están activos.

## Organización

| Carpeta | Responsabilidad |
|---|---|
| `web/src/pages/` | Vistas y acciones de pacientes y personal |
| `web/src/components/` | Componentes accesibles y presentación reutilizable |
| `web/src/services/` | Autenticación, acceso al backend y simulación separada |
| `web/src/layouts/` | Navegación y estructura por rol |
| `web/src/styles/` | Diseño adaptable, contraste y modo sencillo |
| `web/src/utils/` | Fechas de Chile, validaciones y utilidades |
| `supabase/` | Migraciones nuevas, mantenimiento y configuración de tareas |
| `tests/` | Pruebas de comportamiento, permisos y aislamiento |
| `docs/` | Instalación, arquitectura, seguridad y presentación |

## Documentación

- [Auditoría y reutilización](docs/ORIGEN.md)
- [Arquitectura](docs/ARQUITECTURA.md)
- [Instalación en Windows](docs/INSTALACION.md)
- [Supabase y OAuth nuevos](docs/SUPABASE.md)
- [Despliegue separado](docs/DESPLIEGUE.md)
- [Seguridad y datos personales](docs/SEGURIDAD.md)
- [Funciones y estado de fases](docs/FUNCIONALIDADES.md)
- [Actualización de noviembre de 2026](docs/ACTUALIZACION_2026_11.md)
- [Pruebas](docs/PRUEBAS.md)
- [Hoja de ruta](docs/HOJA_DE_RUTA.md)
- [Guion de presentación](docs/PRESENTACION.md)

## Costos

La ejecución local y la demostración no requieren contratar un servicio. El alojamiento externo depende de las cuotas del proveedor y de la organización elegida; ver [DESPLIEGUE](docs/DESPLIEGUE.md). No se promete capacidad ilimitada ni se activan mensajería pagada o planes adicionales como requisito del flujo principal.
