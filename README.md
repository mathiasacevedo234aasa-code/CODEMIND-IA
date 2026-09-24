# CodeMind AI

Entorno de desarrollo web con documentación asistida por IA.

**La IA explica. El usuario decide.** CodeMind AI nunca modifica, corrige ni refactoriza tu código:
detecta tus funciones, genera propuestas de documentación cuando tú lo pides, y no guarda nada
como oficial hasta que tú lo apruebas.

---

## Puesta en marcha

```bash
npm install
```

Crea el archivo `.env` en la raíz (copia de `.env.example`):

```
GROQ_API_KEY=tu_clave
GROQ_MODEL=openai/gpt-oss-120b
PORT=5174
```

Arranca backend y frontend a la vez:

```bash
npm run dev
```

> El lanzador es `scripts/dev.mjs`, no `concurrently`. En Windows, cuando el backend arranca el
> servidor de desarrollo de tu proyecto aparece un proceso nieto en la misma consola y
> `concurrently` se llevaba por delante todo el árbol: se caían el backend, Vite y el servidor
> recién arrancado. Está documentado en `docs/PRUEBAS.md`.

- Interfaz: http://localhost:5173
- API: http://localhost:5174/api

Para producción: `npm run build` y después `npm start` (el backend sirve el build de `web/dist`).

## Aplicación de escritorio

CodeMind AI es local por naturaleza — lee tu disco, ejecuta tus servidores, usa tu git — así que su
forma de distribución natural es una aplicación instalable, no un sitio web.

```bash
npm run desktop         # compila el frontend y abre la ventana
npm run desktop:build   # genera el instalador y el ejecutable portable en release/
```

El resultado son dos archivos en `release/`:

- `CodeMind-AI-Instalador-<versión>-x64.exe` — instalador con atajos y desinstalador
- `CodeMind-AI-Portable-<versión>-x64.exe` — un solo ejecutable, sin instalar nada

### Cómo está montada

El backend **no** es un segundo proceso: el proceso principal de Electron ya es Node, así que
`desktop/main.cjs` importa el propio backend, lo pone a escuchar en `127.0.0.1` con un puerto libre
que elige el sistema, y la ventana carga esa dirección. De este modo el frontend usa las mismas rutas
relativas `/api` que en el navegador y no existen dos versiones del código.

| Detalle | Cómo se resuelve |
|---|---|
| Datos del usuario | En la app instalada van a `%APPDATA%\codemind-ai\data`, porque la carpeta de instalación es de solo lectura. En desarrollo se usa `server/data`, para compartir proyectos con `npm run dev` |
| Clave de Groq | En la app instalada no hay `.env`: se guarda desde **Configuración**, en la carpeta de datos. Si tu equipo tiene una variable de entorno `GROQ_API_KEY`, la app la usará como último recurso — y si está caducada verás un 401. La clave guardada desde Configuración siempre tiene prioridad |
| Dependencias | `scripts/pack-runtime.mjs` instala un árbol limpio con solo `express`, `cors` y `dotenv`. Electron, Vite y Monaco no viajan en el paquete |
| Comprobación del paquete | `scripts/verify-package.mjs` compara el número de archivos empaquetados con el origen, exige los archivos imprescindibles y mide el margen de longitud de ruta. El build falla si algo no cuadra |
| Permisos de la ventana | Sin acceso a Node (`contextIsolation`, sin `nodeIntegration`): solo habla con el backend por HTTP |
| Enlaces externos | Se abren en el navegador del sistema, nunca en una ventana de Electron sin barra de direcciones |
| Diálogos de texto | Electron **no implementa `window.prompt`**: lanza "prompt() is not supported" y el botón se queda muerto. CodeMind AI usa su propio diálogo, que además valida antes de aceptar |
| Al cerrar | Los servidores de desarrollo que hubieras arrancado se detienen: no quedan procesos huérfanos ocupando puertos |

### Si el empaquetado falla en Windows

`electron-builder` descarga unas herramientas de firma cuyo archivo contiene enlaces simbólicos de
macOS, y Windows no los crea sin permisos elevados. No hacen falta para firmar (no firmamos), pero la
extracción aborta el proceso. Se resuelve extrayendo ese archivo a mano sin la carpeta `darwin`:

```bash
node_modules/7zip-bin/win/x64/7za.exe x -y -snld "-x!darwin*"   -o"$LOCALAPPDATA/electron-builder/Cache/winCodeSign/winCodeSign-2.6.0"   "$LOCALAPPDATA/electron-builder/Cache/winCodeSign/"*.7z
```

La otra vía es activar el Modo de desarrollador de Windows, que permite crear enlaces simbólicos sin
elevar privilegios.

### El límite de rutas de Windows

Las dependencias se instalan **fuera del monorepo** y se copian después. No es un capricho: dentro,
npm ve el `node_modules` del padre y acaba anidando las dependencias transitivas unas dentro de
otras, generando rutas de casi 200 caracteres. Sumadas al prefijo de instalación real
(`C:\Program Files\CodeMind AI
esourcespp
ode_modules\`) rebasan el límite de 260 caracteres
de Windows, y entonces **algunos archivos simplemente no se copian, sin ningún error**.

Eso ocurrió de verdad: el instalador se generaba correctamente y la aplicación instalada fallaba al
arrancar con `Cannot find module './implementation'`, porque a `function-bind` le faltaban
`implementation.js` y `package.json`. Instalando fuera del monorepo npm reparte plano y la ruta más
larga baja de 191 a 50 caracteres, con 154 de margen.

Por eso hay dos guardas automáticas en el proceso de empaquetado, y ambas **abortan el build**:

- `pack-runtime.mjs` calcula cuánto ocuparía la ruta más larga instalada en `Program Files`.
- `verify-package.mjs` cuenta los archivos del paquete y los compara con el origen.

### Lo que el instalador no hace

No está **firmado digitalmente**. Windows mostrará el aviso de SmartScreen la primera vez y habrá que
pulsar "Más información → Ejecutar de todas formas". Firmarlo exige un certificado de pago; mientras
no lo tengas, es el comportamiento esperado y conviene advertirlo a quien se lo pases.

### De dónde sale la clave de Groq

Se busca en este orden, y **el primero que exista gana**:

1. La guardada desde **Configuración** (en la carpeta de datos)
2. El archivo `.env` del proyecto
3. La variable de entorno `GROQ_API_KEY` del equipo

El tercer punto es una trampa conocida: si tu sistema tiene una `GROQ_API_KEY` antigua, la aplicación
**instalada** la usará, porque no lleva `.env` dentro. Verás "Groq ✓" y después un 401 al documentar.
Por eso el mensaje de error dice de dónde salió la clave, y **Configuración → Probar conexión** llama
de verdad a Groq en lugar de limitarse a comprobar que hay algo escrito.

La solución: guarda tu clave desde Configuración. Tiene prioridad sobre todo lo demás.

---

## Arquitectura

```
codemind-ai/
├── scripts/dev.mjs         Lanzador de desarrollo (backend + frontend)
├── server/                 Backend Node + Express (guardián de credenciales, disco y procesos)
│   └── src/
│       ├── index.js        Arranque en 127.0.0.1, rutas, apagado ordenado
│       ├── env.js          Carga de .env con prioridad sobre el entorno del sistema
│       ├── git-askpass.cjs Entrega el token a git sin exponerlo en la línea de comandos
│       ├── routes/         projects · docs · ai · settings · workspace
│       └── services/
│           ├── store.js    Persistencia (proyectos, docs, memoria, historial, carpetas reales)
│           ├── groq.js     Integración con Groq + validación de respuestas
│           ├── git.js      Envoltorio sobre el git del sistema
│           ├── github.js   API de GitHub + push/pull autenticados
│           ├── fsbrowse.js Navegación por el disco del equipo
│           └── runner.js   Arranque y supervisión de servidores de desarrollo
└── web/                    Frontend React + TypeScript + Vite + Monaco
    └── src/
        ├── lib/
        │   ├── analyzer.ts Detección de funciones por AST (@babel/parser)
        │   ├── preview.ts  Vista previa HTML/CSS/JS en iframe aislado
        │   ├── api.ts      Cliente HTTP
        │   └── types.ts    Tipos compartidos
        ├── state/useStore.ts   Estado de la aplicación (zustand)
        └── components/     TopBar · ActivityRail · FileExplorer · EditorArea · WebView ·
                            FunctionsPanel · ReviewPanel · AssistantPanel · GitPanel ·
                            GitHubPanel · RunPanel · FolderPicker · BottomPanel ·
                            DocCenter · SettingsDialog · Welcome
```

### Por qué estas decisiones

| Decisión | Motivo |
|---|---|
| Backend propio | La API key de Groq no puede estar en el frontend. Todas las llamadas pasan por el servidor. |
| Persistencia en disco, no en el navegador | `localStorage` se pierde al limpiar datos del navegador y no soporta proyectos grandes. Los archivos se guardan como archivos reales. |
| `@babel/parser` (AST) | Entiende JS, JSX, TS y TSX de verdad. Las expresiones regulares no distinguen un método de clase de un callback anónimo. |
| Monaco Editor | Es el editor de VS Code: resaltado, plegado, búsqueda y reemplazo, multicursor y marcadores de error sin construirlos desde cero. |
| Zustand | Estado compartido entre paneles sin el peso de Redux. |
| Sin base de datos | Un proyecto es una carpeta real, así que Git trabaja directamente sobre ella. |
| Git por CLI, no por librería | El git del sistema es el que el usuario ya conoce y configura. Una reimplementación divergiría de su comportamiento real. |
| Token de GitHub vía `GIT_ASKPASS` | Los argumentos de un proceso son visibles para toda la máquina. El token viaja por variable de entorno a un ayudante mínimo y nunca aparece en `argv` ni en la URL del remoto. |
| Lanzador propio en vez de `concurrently` | `concurrently` mataba el árbol de procesos al aparecer un nieto en la misma consola de Windows. |

---

## Cómo funciona la documentación

1. Escribes una función.
2. El analizador local la detecta (tu código **no** sale de tu máquina en este paso).
3. Pulsas **Documentar función**.
4. El backend envía a Groq la función y un contexto acotado: proyecto, objetivo, archivo,
   funciones vecinas, imports, clases y la documentación previa si existía.
5. Groq devuelve un JSON estructurado que el backend **valida**. Si falta algún campo, se rechaza y
   se te informa; nunca se guarda una respuesta incompleta.
6. La propuesta aparece en el panel **Revisión** con cuatro acciones: aprobar, editar, regenerar, descartar.
7. Solo al aprobar pasa a ser documentación oficial, y la versión anterior se conserva en el historial.

### Identidad de las funciones

Una función se identifica por `archivo::nombreCualificado#ocurrencia`, no por su nombre. Dos
`validar()` en archivos distintos son dos funciones distintas, y dos sobrecargas en el mismo archivo
tampoco se mezclan.

Si una función se renombra o se mueve, el sistema compara la huella del código y **propone** reasignar
su documentación. La reasignación la confirmas tú.

### Documentación desactualizada

Cada documentación aprobada guarda la huella del código que documentaba. Si ese código cambia, esa
función —y solo esa— pasa a estado *Revisar documentación*. La versión anterior no se borra: se puede
consultar junto con el código al que correspondía.

---

## Seguridad de credenciales

- La clave se lee del `.env` o, si la guardas desde la interfaz, de `server/data/secrets.json`.
- Nunca se devuelve por la API: `/api/settings` y `/api/health` solo informan de si existe y de dónde viene.
- No se escribe en consola ni en mensajes de error.
- `.env` y `server/data/` están excluidos en `.gitignore`.
- El token de GitHub se guarda junto a la clave de Groq en `server/data/secrets.json`, se valida
  contra GitHub antes de guardarse y nunca se devuelve por la API.
- Git recibe el token por `GIT_ASKPASS`, no por la línea de comandos ni por la URL del remoto, que
  se configura limpia (`https://github.com/propietario/repo.git`). Cualquier salida de git se filtra
  antes de llegar a la interfaz.
- La vista previa de HTML suelto se ejecuta en un iframe con `sandbox="allow-scripts"` **sin**
  `allow-same-origin`: no comparte origen con la aplicación y no puede leer su almacenamiento ni
  llamar al backend en tu nombre. El navegador integrado sí concede `allow-same-origin`, porque ahí
  se muestra el servidor de desarrollo del propio usuario y lo necesita para funcionar.
- El backend escucha únicamente en `127.0.0.1`: navega por tu disco y ejecuta procesos, así que no
  debe quedar accesible desde la red.

---

## Alcance actual

Implementado y verificado (fases 1 a 6):

**Editor y proyectos**
- Editor Monaco con pestañas, temas, atajos e indicadores de cambios sin guardar
- Explorador con crear, renombrar, eliminar y carpetas anidadas
- Proyectos en el espacio gestionado **o sobre cualquier carpeta real de tu equipo**
- Selector que navega por las unidades del disco y **crea carpetas nuevas** sin salir de la aplicación
- Apariencia del editor configurable: tipografía, tamaño, interlineado, espaciado, ligaduras,
  números de línea, guías de indentación, corchetes de colores, encabezado fijo y minimapa,
  con una muestra que se actualiza mientras eliges

**Comprensión y documentación**
- Detección de funciones por AST en `.js .jsx .ts .tsx .mjs .cjs` y el `<script>` de `.vue` y `.svelte`
- Panel *Funciones del proyecto* con estado, archivo, línea y navegación al código
- Documentación asistida por Groq con aprobación manual obligatoria
- Centro de documentación: descripción general, arquitectura, funciones, decisiones, progreso, historial
- Memoria contextual por proyecto y asistente en cuatro modos

**Control de versiones**
- Git real sobre el ejecutable del sistema: estado, comparaciones, preparar, confirmar, historial y ramas
- Cada cambio se etiqueta como **código**, **documentación**, **configuración** u **otro**
- Cambiar de rama con cambios sin confirmar se bloquea y se explica: nunca se descarta tu trabajo
- GitHub con token personal: repositorios, vinculación, subida y descarga controladas
- Antes de subir se muestra siempre qué commits y qué archivos viajan, a qué rama y con qué avisos

**Ejecución**
- Vista previa de HTML/CSS/JS con consola y errores reales
- Arranque del servidor de desarrollo del propio proyecto (Vite, Next, Angular, Vue, Svelte...)
  con registro en vivo y detección automática de la URL
- Navegador integrado para ver esa página dentro del editor, con sondeo previo que avisa cuando
  un sitio prohíbe mostrarse incrustado

### Organización de la interfaz

Una barra de actividad a la izquierda con cinco vistas excluyentes (Explorador, Funciones, Git,
GitHub, Ejecutar), el editor y el navegador integrado en el centro compartiendo pestañas, el panel
inferior con seis registros (Consola, Errores, Vista previa, Procesos, Registro de Git,
Documentación) y el panel del asistente a la derecha, **que se puede ocultar** desde su aspa o desde
la barra superior y recuperar con el asa del borde.

### Límites reconocidos

- **GitHub usa un token personal, no OAuth.** OAuth exigiría registrar y alojar una aplicación; el
  token lo emite y revoca el propio usuario y es lo que permite una arquitectura local.
- **No hay terminal libre.** Solo se ejecutan scripts declarados en el `package.json` del proyecto
  y la instalación de dependencias. Es una lista blanca deliberada: una terminal libre expuesta por
  HTTP sería un agujero de seguridad.
- **Traer cambios solo avanza (fast-forward).** Si el historial ha divergido, la aplicación se
  detiene y lo dice; no fusiona ni rebasea por su cuenta.
- El análisis recorre como máximo 250 archivos por proyecto y el árbol 6000 entradas; ambos avisan.
- Los archivos de más de 2 MB y los binarios no se abren en el editor.
- No hay autenticación: el backend escucha solo en `127.0.0.1` porque puede leer tu disco y ejecutar
  los scripts de tus proyectos.
