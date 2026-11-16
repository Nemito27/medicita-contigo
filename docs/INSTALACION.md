# Instalación en Windows

## Requisitos

Instalar Node.js 22 o una versión LTS posterior compatible, con npm, desde [Node.js](https://nodejs.org/). Instalar [Git para Windows](https://git-scm.com/downloads/win) si se utilizará un repositorio. Comprobar en PowerShell:

```powershell
node --version
npm --version
git --version
```

Si PowerShell bloquea `npm.ps1`, utilizar `npm.cmd` en estos comandos; no hace falta cambiar la política de ejecución de todo el equipo.

## Abrir el proyecto

Clonar el repositorio nuevo o descomprimir la entrega en una carpeta propia `medicita-contigo`. Abrir esa carpeta desde la terminal o el editor. No utilizar la carpeta ni el remoto de la app original como destino.

```powershell
git clone https://github.com/Nemito27/medicita-contigo.git
```

```powershell
cd C:\Proyectos\medicita-contigo
npm.cmd ci
npm.cmd run dev
```

Abrir la URL local que muestre Vite, normalmente `http://localhost:5173/`. La página puede mostrar la demostración con datos ficticios aunque todavía no se haya activado OAuth del nuevo backend.

## Configurar cuentas reales

Esta entrega ya contiene la URL y clave publicable del proyecto nuevo en `web/src/config/public-project.json`; no son secretos. Si necesitas sustituir la configuración pública local, crear un archivo de entorno a partir del ejemplo:

```powershell
Copy-Item .env.example .env
notepad .env
```

Completar `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` exclusivamente con la configuración pública del proyecto **nuevo**. Reiniciar Vite después de cambiarlas. Si permanecen vacías se utiliza la configuración pública propia incluida, nunca el backend anterior. La referencia del proyecto se valida en `web/src/config/app.js`. `.env` está excluido del historial; nunca colocar en él un secreto de Google o una clave privilegiada que vaya a ser empaquetada para el navegador.

Seguir [SUPABASE](SUPABASE.md) para migraciones, OAuth y primer administrador. La creación de un proyecto no activa automáticamente el proveedor Google.

## Verificar y generar la entrega web

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run preview
```

El resultado está en `dist`. Para publicarlo se sube toda esa carpeta, incluidos CSS, JavaScript e imágenes; ver [DESPLIEGUE](DESPLIEGUE.md).

## Problemas frecuentes

| Síntoma | Comprobación |
|---|---|
| No se encuentra `npm` | Reiniciar la terminal después de instalar Node.js y verificar PATH |
| Puerto ocupado | Ejecutar `npm.cmd run dev -- --port 5174` y autorizar esa URL local en el proyecto nuevo si se prueba OAuth |
| Google no está activo | Revisar proveedor, credenciales nuevas, callback y URLs permitidas |
| Se abre el archivo pero no funciona | Usar Vite o un servidor HTTP; no abrir el HTML por `file://` |
| El enlace de acceso por correo no llega | Revisar restricciones SMTP y direcciones autorizadas; no confundir solicitud con entrega |
| La app informa conexión perdida | Recuperar red y reintentar; no se confirman operaciones offline |
| Cambió `.env` pero no la app | Reiniciar Vite y reconstruir antes de publicar |

En macOS/Linux los mismos comandos usan `npm` y `cp .env.example .env`. La instalación de servicios de pago no es requisito para ejecutar la demostración local.
