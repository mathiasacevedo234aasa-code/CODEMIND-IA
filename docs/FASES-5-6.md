# Fases 5 y 6 — pruebas ejecutadas

Fecha: 22 de septiembre de 2026. Todas las comprobaciones son sobre la aplicación real, no simuladas.

## Backend (automatizado, contra la API)

| Prueba | Resultado |
|---|---|
| Crear un proyecto sobre una carpeta real del disco | Correcto — `mode=carpeta`, raíz en el Escritorio |
| Leer el árbol de la carpeta del usuario | Correcto — `node_modules`, `.git` y artefactos excluidos |
| Estado de git antes de inicializar | Correcto — `available=true`, `isRepo=false`, sin lanzar error |
| `git init` | Correcto — rama `main`, 3 archivos sin seguimiento |
| Clasificación de cambios | Correcto — `README.md` → documentación; `js/app.js` e `index.html` → código |
| Preparar archivos y ver la comparación | Correcto |
| Crear commit | Correcto — `3c404e9` |
| Historial y ramas | Correcto |
| Renombrado (formato `-z` de git) | Correcto — `js/app.js -> js/saludos.js`, lista alineada |
| Ruta con espacios | Correcto — `nombre con espacios.txt` bien parseada |
| Cambiar de rama con cambios sin confirmar | Bloqueado con explicación (409), sin descartar nada |
| GitHub sin token | Honesto — `configured=false`, `canPush=false` y el aviso correspondiente |
| Rechazar un script que no está en `package.json` | Correcto — 400 |
| Sondeo de URL viva y de puerto cerrado | Correcto |
| **Eliminar el proyecto NO borra la carpeta del usuario** | Correcto — comprobado explícitamente |

## Interfaz (navegador)

| Prueba | Resultado |
|---|---|
| Selector de carpetas del disco | Correcto — unidades C: y D:, accesos directos y sondeo de la carpeta |
| Abrir una carpeta como proyecto | Correcto — abre directamente, sin pasar por el formulario |
| Panel Ejecutar | Correcto — scripts detectados, `npm run dev` en marcha, registro en vivo |
| Detección de la URL del servidor | Correcto — `http://localhost:4321/` |
| Navegador integrado | Correcto — la página del proyecto se muestra dentro del editor |
| Flujo completo de Git desde la interfaz | Correcto — init, preparar todo, commit `579b602`, árbol limpio e historial |
| Ocultar el panel del asistente | Correcto — con su aspa y desde la barra superior; se recupera con el asa lateral |
| Barra de actividad | Correcto — cinco vistas excluyentes |

## Lo que no se ha podido comprobar

**La subida real a GitHub.** El formulario, la validación del token contra la API de GitHub y la
vista previa de sincronización sí funcionan, pero para ejecutar un `push` de verdad hace falta un
token personal del usuario, que no tengo ni debo tener. El código está escrito y la ruta es la misma
que ya se ejerció con `fetch` y `git`, pero **no afirmo que esté probada de extremo a extremo**.

## Fallos encontrados y corregidos durante estas pruebas

1. **Bytes nulos en los argumentos de git.** El formato del `git log` llevaba un byte nulo literal y
   Node rechaza argumentos que lo contengan. Se pasó a los escapes propios de git (`%x1f`, `%x00`),
   que git expande y devuelve como bytes reales en la salida.

2. **`concurrently` mataba todo el árbol de procesos.** Al arrancar el servidor de desarrollo del
   proyecto del usuario aparecía un proceso nieto en la misma consola de Windows y se caían el
   backend, Vite y el servidor recién arrancado. Se reprodujo tres veces y se aisló comparando con
   los mismos dos servidores lanzados por separado, que sobrevivían sin problema. Se sustituyó por
   `scripts/dev.mjs`, un lanzador de 60 líneas.

3. **`detached: true` en Windows rompía la captura de salida.** Fue el primer intento de arreglar lo
   anterior: el hijo recibía una consola nueva y su salida dejaba de llegar, así que nunca se
   detectaba la URL. Revertido; en Windows el hijo no se lanza como `detached`.

4. **Aviso DEP0190 de Node** sobre argumentos sin escapar al usar `shell`. Se añadió una validación
   del nombre del script (`/^[A-Za-z0-9_:.-]+$/`) para cerrar esa vía por completo.

5. **`node --watch` reiniciaba el backend por cambios dentro de `node_modules`.** Acotado con
   `--watch-path=./src`.

6. **"Abrir una carpeta del equipo" rellenaba un formulario en vez de abrir la carpeta.** Corregido.

## Decisiones de diseño que conviene recordar

- **Git se usa por línea de comandos**, no por una librería. Es el mismo git que el usuario ya tiene
  configurado (identidad, credenciales, hooks); reimplementarlo divergiría de su comportamiento real.
- **El token de GitHub nunca pasa por `argv`.** Los argumentos de un proceso son legibles para toda
  la máquina. Se entrega por variable de entorno a `server/src/git-askpass.cjs`, que git invoca
  mediante `GIT_ASKPASS`. La URL del remoto se guarda limpia.
- **No hay terminal libre.** Solo se ejecutan scripts declarados en el `package.json` del proyecto y
  la instalación de dependencias. Una terminal libre expuesta por HTTP sería un agujero de seguridad,
  por mucho que escuche solo en localhost.
- **El backend escucha en `127.0.0.1`**, no en todas las interfaces: puede leer el disco y lanzar
  procesos.
