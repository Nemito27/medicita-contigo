# Despliegue separado

## Estado del destino

El repositorio público independiente [Nemito27/medicita-contigo](https://github.com/Nemito27/medicita-contigo) ya existe. El destino de Pages aún requiere confirmar la publicación y comprobar su respuesta; no se presenta una dirección prevista como un despliegue terminado. No usar la URL de Medicita original como destino de esta entrega.

La conexión no permitió crear el repositorio y el propietario lo creó vacío. Esa restricción no se resolvió escribiendo en el repositorio original. El remoto del checkout nuevo apunta exclusivamente a `Nemito27/medicita-contigo`.

## GitHub Actions y Pages

1. Confirmar que el remoto del checkout corresponde al repositorio nuevo.
2. Subir el código, lockfile, pruebas y workflow; excluir `.env`, `node_modules`, `dist`, secretos y datos personales.
3. La configuración pública del proyecto nuevo está en `web/src/config/public-project.json`. Las variables de Actions `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` son opcionales para sustituir esos valores; no son necesarias para construir esta entrega. La conexión rechazó escribir esas variables, sin bloquear el uso de la configuración pública propia. No colocar secretos de Google ni claves privilegiadas allí.
4. Elegir GitHub Actions como origen de Pages en Settings → Pages.
5. El workflow verifica `npm ci`, `npm test`, `npm run build` y prepara `dist`. Solo publica desde `main`, no desde una solicitud de cambios.
6. Esperar el estado de éxito del trabajo de publicación y comprobar HTTP 200 y los recursos servidos en la URL devuelta.
7. Registrar esa URL exacta en el nuevo proyecto Supabase y comprobar inicio/cierre de sesión. No asumir que el despliegue activa Google.

Vite usa rutas relativas para que el paquete funcione bajo una subruta de repositorio. El contenido publicado es `dist/` completo.

El cliente exige la referencia de Supabase independiente configurada en `web/src/config/app.js`. Una migración futura a otro backend requiere revisar de forma explícita esa protección y la configuración pública; no se debe apuntar accidentalmente a Medicita original.

## Ejecutar sin hosting

```sh
npm ci
npm test
npm run build
npm run preview
```

Una presentación local con datos ficticios permite comprobar el flujo sin pagar hosting ni activar proveedores externos. Para mostrarlo a otro dispositivo hace falta conectividad con el servidor de la presentación y configurar las direcciones permitidas si se utiliza OAuth real.

## Límites y costos

GitHub Free permite Pages en repositorios públicos. La documentación establece sitio publicado de hasta 1 GB y límite flexible de 100 GB de tráfico al mes. Las construcciones pueden finalizar por tiempo y existen límites de uso; el límite flexible de diez construcciones por hora no se aplica igual a workflows personalizados de Actions. Pages aloja archivos estáticos; Supabase ejecuta el backend. Sus condiciones no convierten Pages en hosting ilimitado para un SaaS comercial. [Límites oficiales](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).

Las cuotas de Supabase se documentan en [SUPABASE](SUPABASE.md). Revisar consumo antes de aceptar una ampliación. Correo, SMS y WhatsApp no son dependencias pagadas obligatorias del proceso principal.

## Revisión posterior

Comprobar en la publicación nueva: contexto independiente visible, demostración identificada, ausencia de secretos en el bundle, permisos por rol, encabezados y recursos cargados, navegación móvil y estados de red. Revisar el manifest y la política del service worker; ninguna respuesta con datos privados debe almacenarse en caché de aplicación.

Ante una versión incorrecta, republicar un commit verificado del repositorio nuevo. No modificar ni usar la publicación original como mecanismo de recuperación.
