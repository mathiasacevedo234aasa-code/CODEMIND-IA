# CodeMind AI 1.4.0

Entorno de desarrollo con documentación asistida por IA.

**La IA explica. El usuario decide.** CodeMind AI nunca modifica, corrige ni refactoriza tu código:
reconoce lo que has escrito, genera propuestas de documentación cuando tú lo pides, y no guarda nada
como oficial hasta que tú lo apruebas. Esa regla no es un eslogan: está en las instrucciones que
recibe el modelo, en la validación de sus respuestas y en el hecho de que ninguna propuesta —ni de
documentación ni de glosario— llega a ser oficial sin que una persona pulse *Aprobar*.

El historial de versiones está en [CHANGELOG.md](CHANGELOG.md).

---

## Puesta en marcha

```bash
npm install
```

Opcionalmente, crea el archivo `.env` en la raíz (copia de `.env.example`) con la clave del
proveedor de IA que vayas a usar. También puedes guardarla desde **Configuración**, y esa siempre
tiene prioridad. Con **Ollama** no hace falta ninguna clave: el modelo corre en tu propio equipo.

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
npm run fuente          # .zip del codigo del ultimo commit (sin release/ ni node_modules)
npm run desktop:build:linux   # AppImage (hay que ejecutarlo en Linux)
npm run desktop:build:mac     # .dmg (hay que ejecutarlo en macOS)
```

AppImage y .dmg solo se pueden generar en su propio sistema. El flujo
`.github/workflows/compilar.yml` compila los tres en GitHub Actions (a mano o al subir una etiqueta `v*`).

El ejecutable **portable** guarda todos sus datos en la carpeta `CodeMind-datos`, junto al `.exe`: se
puede llevar en una USB sin dejar nada en el equipo.

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
| Claves de IA | En la app instalada no hay `.env`: se guardan desde **Configuración**, en la carpeta de datos, una por proveedor. Si tu equipo tiene una variable de entorno (`GROQ_API_KEY`, `OPENAI_API_KEY`...), la app la usará como último recurso — y si está caducada verás un 401. La clave guardada desde Configuración siempre tiene prioridad |
| Dependencias | `scripts/pack-runtime.mjs` instala un árbol limpio con solo lo que el backend usa en ejecución: `express`, `cors`, `dotenv` y el terminal nativo. Electron, Vite y Monaco no viajan en el paquete |
| Terminal nativo | `@lydell/node-pty` trae binarios precompilados con **N-API**, estable entre versiones, así que no hay que recompilarlo para Electron. Verificado dentro de Electron 33 (ABI 130) |
| Gramáticas de lenguajes | Los `.wasm` de tree-sitter (23 MB) no están en el repositorio: `scripts/copiar-gramaticas.mjs` los copia desde `node_modules` antes de arrancar y de construir |
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
(`C:\Program Files\CodeMind AI\resources\app\node_modules\`) rebasan el límite de 260 caracteres
de Windows, y entonces **algunos archivos simplemente no se copian, sin ningún error**.

Eso ocurrió de verdad: el instalador se generaba correctamente y la aplicación instalada fallaba al
arrancar con `Cannot find module './implementation'`, porque a `function-bind` le faltaban
`implementation.js` y `package.json`. Instalando fuera del monorepo npm reparte plano y la ruta más
larga baja de 191 a 50 caracteres, con 154 de margen.

Por eso hay dos guardas automáticas en el proceso de empaquetado, y ambas **abortan el build**:

- `pack-runtime.mjs` calcula cuánto ocuparía la ruta más larga instalada en `Program Files`.
- `verify-package.mjs` cuenta los archivos del paquete y los compara con el origen.

### Actualizaciones

La aplicación instalada consulta las Releases de GitHub del repositorio que indica `publish` en
`electron-builder.yml` (Ayuda → Buscar actualizaciones, y una vez al arrancar sin molestar). Nunca
descarga ni instala sola: pregunta antes de descargar y otra vez antes de reiniciar.

Para publicar una versión hace falta un token de GitHub con permiso sobre ese repositorio:

```bash
set GH_TOKEN=<token>
npm run desktop:publicar
```

`npm run desktop:build` no publica nunca (`--publish never`).

### Lo que el instalador no hace

No está **firmado digitalmente**. Windows mostrará el aviso de SmartScreen la primera vez y habrá que
pulsar "Más información → Ejecutar de todas formas". Firmarlo exige un certificado de pago; mientras
no lo tengas, es el comportamiento esperado y conviene advertirlo a quien se lo pases.

### De dónde sale la clave de cada proveedor

Se busca en este orden, y **el primero que exista gana**:

1. La guardada desde **Configuración** (en la carpeta de datos)
2. El archivo `.env` del proyecto
3. La variable de entorno del equipo (`GROQ_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`,
   `OPENROUTER_API_KEY`)

El tercer punto es una trampa conocida: si tu sistema tiene una clave antigua exportada, la
aplicación **instalada** la usará, porque no lleva `.env` dentro. Verás el indicador en verde y
después un 401 al documentar. Por eso el mensaje de error **dice de dónde salió la clave**, y
**Configuración → Probar conexión** llama de verdad al servicio en lugar de limitarse a comprobar
que hay algo escrito.

La solución: guarda tu clave desde Configuración. Tiene prioridad sobre todo lo demás.

---

## Arquitectura

```
codemind-ai/
├── scripts/
│   ├── dev.mjs                 Lanzador de desarrollo (backend + frontend)
│   ├── copiar-gramaticas.mjs   Copia los .wasm de tree-sitter a web/public
│   ├── pack-runtime.mjs        Arbol limpio de dependencias para el instalador
│   └── verify-package.mjs      Comprueba el paquete antes de darlo por bueno
├── server/                     Backend Node + Express (guardian de credenciales, disco y procesos)
│   └── src/
│       ├── index.js            Arranque en 127.0.0.1, rutas, apagado ordenado
│       ├── env.js              Carga de .env con prioridad sobre el entorno del sistema
│       ├── git-askpass.cjs     Entrega el token a git sin exponerlo en la linea de comandos
│       ├── routes/             projects · docs · ai · settings · workspace
│       └── services/
│           ├── store.js        Persistencia y claves (una por proveedor)
│           ├── proveedores.js  Groq · OpenAI · Anthropic · OpenRouter · Ollama
│           ├── ia.js           Reglas del asistente y validacion de respuestas
│           ├── glosario.js     Vocabulario del proyecto: propuestas y aprobacion
│           ├── quality.js      Pruebas, tipos y estilo del proyecto del usuario
│           ├── terminal.js     Consola real (pseudoterminal, con plan B por tuberias)
│           ├── git.js          Envoltorio sobre el git del sistema
│           ├── github.js       API de GitHub + push/pull autenticados
│           ├── search.js       Busqueda y reemplazo con vista previa
│           ├── export.js       Exportacion de la documentacion aprobada
│           ├── fsbrowse.js     Navegacion por el disco del equipo
│           └── runner.js       Arranque y supervision de servidores de desarrollo
└── web/                        Frontend React + TypeScript + Vite + Monaco
    └── src/
        ├── lib/
        │   ├── analyzer/       index · js · html · css · markdown · treesitter
        │   ├── projectMap.ts   Grafo de dependencias y deteccion de ciclos
        │   ├── preview.ts      Vista previa HTML/CSS/JS en iframe aislado
        │   ├── api.ts          Cliente HTTP
        │   └── types.ts        Tipos compartidos
        ├── state/useStore.ts   Estado de la aplicacion (zustand)
        └── components/         TopBar · ActivityRail · FileExplorer · EditorArea ·
                                SymbolsPanel · SearchPanel · ProjectMap · GlosarioPanel ·
                                ChecksPanel · TerminalPanel · ReviewPanel · AssistantPanel ·
                                GitPanel · GitHubPanel · RunPanel · WebView · FolderPicker ·
                                BottomPanel · DocCenter · SettingsDialog · ProveedorIADialog ·
                                CommandPalette · DialogHost · Welcome
```

### Por qué estas decisiones

| Decisión | Motivo |
|---|---|
| Backend propio | Una API key no puede estar en el frontend. Todas las llamadas a la IA pasan por el servidor. |
| Persistencia en disco, no en el navegador | `localStorage` se pierde al limpiar datos del navegador y no soporta proyectos grandes. Los archivos se guardan como archivos reales. |
| `@babel/parser` (AST) | Entiende JS, JSX, TS y TSX de verdad. Las expresiones regulares no distinguen un método de clase de un callback anónimo. |
| tree-sitter para los demás lenguajes | Escribir catorce analizadores más no tiene sentido. tree-sitter es el motor que usan los editores de verdad, y su gramática compilada a WebAssembly corre **en tu equipo**: el código no sale de él para analizarse. |
| Varios proveedores de IA | Atar la aplicación a un solo servicio es atar al usuario. Por dentro son dos protocolos, no cinco: el de OpenAI, que casi todos hablan, y el de Anthropic. |
| Ollama como opción de primera | Para un programa cuyo único trabajo es leer tu código, poder hacerlo **sin que salga de tu equipo** no es un detalle. |
| Pseudoterminal nativo | Sin él no hay prompt, ni eco, ni colores, ni un Ctrl+C de verdad. El módulo trae binarios N-API, estables entre versiones de Electron, así que no reintroduce el problema de compilar nativos. |
| Monaco Editor | Es el editor de VS Code: resaltado, plegado, búsqueda y reemplazo, multicursor y marcadores de error sin construirlos desde cero. |
| Zustand | Estado compartido entre paneles sin el peso de Redux. |
| Sin base de datos | Un proyecto es una carpeta real, así que Git trabaja directamente sobre ella. |
| Git por CLI, no por librería | El git del sistema es el que el usuario ya conoce y configura. Una reimplementación divergiría de su comportamiento real. |
| Token de GitHub vía `GIT_ASKPASS` | Los argumentos de un proceso son visibles para toda la máquina. El token viaja por variable de entorno a un ayudante mínimo y nunca aparece en `argv` ni en la URL del remoto. |
| Lanzador propio en vez de `concurrently` | `concurrently` mataba el árbol de procesos al aparecer un nieto en la misma consola de Windows. |

---

## Cómo funciona la documentación

1. Escribes código.
2. El analizador local lo reconoce (tu código **no** sale de tu máquina en este paso, ni siquiera en
   los lenguajes que usan tree-sitter: la gramática corre aquí).
3. Pulsas **Documentar**.
4. El backend envía al proveedor de IA que hayas elegido el elemento y un contexto acotado:
   proyecto, objetivo, archivo, elementos vecinos, imports, clases, el glosario aprobado y la
   documentación previa si existía.
5. El modelo devuelve un JSON estructurado que el backend **valida**. Si falta algún campo, se
   rechaza y se te informa; nunca se guarda una respuesta incompleta.
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

- Las claves se leen del `.env` o, si las guardas desde la interfaz, de `server/data/secrets.json`,
  una por proveedor.
- **Ninguna clave puede aparecer en un mensaje de error**, ni en el que devuelve el servicio ni en el
  de un fallo de red: se borra de cualquier texto antes de que salga. Hay una prueba que lo vigila
  (`tests/proveedores.mjs`), y fue esa prueba la que encontró una fuga real por la vía del fallo de red.
- Nunca se devuelve por la API: `/api/settings` y `/api/health` solo informan de si existe y de dónde viene.
- No se escribe en consola ni en mensajes de error.
- `.env` y `server/data/` están excluidos en `.gitignore`.
- El token de GitHub se guarda junto a las claves de IA en `server/data/secrets.json`, se valida
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

## Alcance de la versión 1.0

Todo lo que sigue está implementado y **comprobado ejecutándolo**, no solo escrito.

**Editor y proyectos**
- Monaco con pestañas, temas, atajos e indicadores de cambios sin guardar
- **Editor dividido**: dos mitades, cada una con sus pestañas y su archivo; la mitad enfocada es
  donde se abre lo siguiente, y la división se guarda con la sesión
- Emmet (`html:5`, `ul>li*3`, `div.clase`) y apariencia configurable: tipografía, tamaño,
  interlineado, espaciado, ligaduras, números de línea, guías, corchetes de colores y minimapa
- Explorador con crear, renombrar, eliminar y carpetas anidadas
- Proyectos en el espacio gestionado **o sobre cualquier carpeta real de tu equipo**
- Selector que navega por las unidades del disco y crea carpetas sin salir de la aplicación
- Diálogos propios, porque Electron no implementa `window.prompt`

**Comprensión del código**
- Análisis por AST (`@babel/parser`) de `.js .jsx .ts .tsx .mjs .cjs`, del `<script>` y el `<style>`
  **dentro del HTML**, de las reglas CSS y de los encabezados Markdown
- **Veintidós lenguajes más con tree-sitter**: Python, Java, C#, Go, PHP, Ruby, Rust, C, C++, Bash,
  Lua, Kotlin, Swift, Dart, Scala, Elixir, OCaml, Objective-C, Zig, Solidity, y los formatos JSON
  y TOML — clases, funciones, métodos, constructores, propiedades, interfaces,
  enumeraciones y constantes, con su línea real. La gramática corre en tu equipo
- **Todas las etiquetas de tus páginas**, con sus atributos: secciones, formularios, tablas, listas,
  enlaces, imágenes, controles, contenedores, metadatos y texto, además de los manejadores en línea.
  Un filtro esconde el relleno —párrafos y contenedores sin `id` ni clase— cuando la página es grande
- Reglas CSS, medias queries, animaciones y variables CSS
- **Mapa del proyecto**: grafo de dependencias construido solo con hechos comprobables — los
  `import`, los `<script src>`, los `<link rel=stylesheet>` y los `@import` — con detección de
  ciclos, archivos de los que más depende el proyecto y archivos que nadie importa
- Detección de **código sin usar**, presentada como sospecha razonada y nunca como orden de borrar
- Explicar **cualquier selección** de código, no solo las funciones detectadas

**Documentación**
- **Se lee sin buscarla**: una pestaña con lo documentado del archivo abierto, un botón en cada
  elemento, y **al pasar el cursor por encima en el editor** sale su propósito, sus parámetros y lo
  que devuelve
- Propuestas de documentación con aprobación manual obligatoria
- Centro de documentación: descripción general, arquitectura, **glosario**, documentación de
  elementos, decisiones, progreso e historial
- **Glosario del proyecto**: las palabras propias del dominio con su significado y con los archivos
  donde aparecen, que se pueden abrir. La IA propone; ninguna entra sin que tú la apruebes. El
  asistente usa después el glosario aprobado como vocabulario dado por bueno
- Memoria contextual por proyecto y asistente en cuatro modos
- Nivel de las explicaciones: principiante, intermedio o avanzado
- Exportación a Markdown o a una página HTML lista para imprimir
- Comparación de una versión antigua de la documentación con la actual, lado a lado

**Servicios de IA**
- **Groq, OpenAI, Anthropic, OpenRouter y Ollama.** Cada uno guarda su propia clave y su propio
  modelo: cambiar de uno a otro y volver no pierde nada
- **Ollama en tu propio equipo**: el código no sale de él y la aplicación funciona sin conexión
- *Probar conexión* llama de verdad al servicio; los errores dicen de dónde salió la clave, qué
  modelo falta y cómo descargarlo

**Búsqueda y navegación**
- Búsqueda y reemplazo en todo el proyecto, con expresiones regulares, filtros por tipo de archivo
  y **vista previa obligatoria antes de tocar nada**
- Paleta de comandos (`Ctrl+Shift+P`)

**Control de versiones**
- Git real sobre el ejecutable del sistema: estado, comparaciones, preparar, confirmar, historial y ramas
- Cada cambio etiquetado como **código**, **documentación**, **configuración** u **otro**
- Cambiar de rama con cambios sin confirmar se bloquea y se explica: nunca se descarta tu trabajo
- GitHub con token personal: repositorios, vinculación, subida y descarga controladas, mostrando
  siempre qué commits y qué archivos viajan antes de subir

**Ejecución y comprobación**
- **Ejecutar el archivo abierto** con un botón, con **F5** o desde la paleta de comandos, en el lenguaje que sea: Python, JavaScript,
  TypeScript (sin compilar nada), Ruby, PHP, Go, Java, Rust, C, C++, C#, Lua, Dart, Swift, Bash y
  PowerShell. Se ejecuta dentro del Terminal, así que los programas que piden datos por teclado
  funcionan y se pueden parar con Ctrl+C
- Antes de ofrecer el botón se comprueba que la herramienta está instalada, preguntándole su
  versión. Si falta, se dice **cuál y de dónde se descarga**; el panel *Ejecutar* lista todo lo que
  este equipo puede ejecutar ahora mismo
- **Terminal de verdad** en la carpeta del proyecto: prompt, eco, colores y Ctrl+C reales
- **Comprobaciones del proyecto**: ejecuta tus scripts de pruebas, tipos y estilo, y convierte su
  salida en avisos con archivo y línea en los que se puede pulsar. Lee `tsc`, ESLint, vitest, jest,
  TAP y el corredor propio de Node
- **Vista previa con servidor propio**, como Live Server: levanta un `http://127.0.0.1` sobre tu
  carpeta y **recarga la página sola al guardar**. A diferencia de un iframe, aquí funcionan las
  rutas relativas, `fetch` y los módulos de JavaScript, porque hay un origen real
- Vista previa simple de HTML/CSS/JS en iframe, con consola y errores reales
- Arranque del servidor de desarrollo del propio proyecto, con registro en vivo y detección de la URL
- Navegador integrado, con sondeo previo que avisa cuando un sitio prohíbe mostrarse incrustado

### Organización de la interfaz

Una barra de actividad a la izquierda con seis vistas excluyentes (Explorador, Buscar, Elementos,
Git, GitHub, Ejecutar), el editor —que puede partirse en dos— y el navegador integrado en el centro,
el panel inferior con ocho pestañas (Consola, Errores, Comprobaciones, Terminal, Vista previa,
Procesos, Registro de Git, Documentación) y el panel del asistente a la derecha, que se puede
ocultar y recuperar con el asa del borde.

---

## Límites reconocidos

Lo que esta versión **no** hace, dicho sin adornos.

- **El terminal es real y no tiene lista blanca.** Es lo que pide un terminal: si solo dejara
  escribir ciertos comandos, no sería uno. Ejecuta lo que escribas, con tus permisos. El backend
  escucha solo en `127.0.0.1` y cada sesión vive en la carpeta del proyecto, pero conviene saberlo.
  El panel *Ejecutar* sigue teniendo lista blanca: ahí solo corren los scripts de tu `package.json`.
- **Ollama no se ha probado contra una instalación real de Ollama.** Se ha probado nuestro lado del
  protocolo contra un servidor que habla su mismo dialecto, por un socket real, y también el camino
  de error cuando no está. Si falla con Ollama de verdad, es un fallo que queda por descubrir.
- **El instalador no está firmado digitalmente.** Windows mostrará SmartScreen la primera vez.
  Firmarlo exige un certificado de pago.
- **GitHub usa un token personal, no OAuth.** OAuth exigiría registrar y alojar una aplicación; el
  token lo emite y revoca el propio usuario, y es lo que permite una arquitectura local.
- **Traer cambios solo avanza (fast-forward).** Si el historial ha divergido, la aplicación se
  detiene y lo dice; no fusiona ni rebasea por su cuenta.
- **El mapa solo dibuja lo que está escrito.** Una dependencia cargada dinámicamente o por nombre no
  aparece, y se avisa de ello en el propio mapa.
- **Las sospechas de código sin usar son sospechas.** Se busca el nombre por el proyecto sin analizar
  ámbitos. Nunca se propone borrar nada.
- Con la ventana en segundo plano, xterm puede dejar un error suelto en la consola del navegador al
  recalcular su área de desplazamiento. Es interno de la librería, no rompe nada y el terminal sigue
  funcionando al volver.
- El análisis recorre como máximo 250 archivos por proyecto y el árbol 6000 entradas; ambos avisan.
- Los archivos de más de 2 MB y los binarios no se abren en el editor.
- No hay autenticación: el backend escucha solo en `127.0.0.1` porque puede leer tu disco y ejecutar
  procesos.
- **No se puede alojar en un servidor.** No es una limitación pendiente de resolver, es lo que es:
  esta aplicación navega por tu disco, ejecuta tus procesos y abre tu terminal. Su forma correcta de
  distribución es una aplicación de escritorio.

---

## Pruebas

Diez pruebas, todas ejecutables y todas contra cosas reales. Están documentadas una por una en
[`tests/README.md`](tests/README.md).

```bash
node tests/analizador.mjs      # los analizadores de JS, HTML, CSS y Markdown
node tests/lenguajes.mjs       # Python, Java, C#, Go, Rust, PHP, Ruby y Bash con tree-sitter
node tests/mapa.mjs            # grafo de dependencias, ciclos y disposición reproducible
node tests/comprobaciones.mjs  # lectura de las salidas de tsc, ESLint, vitest, jest y node --test
node tests/terminal.mjs        # una consola de verdad: comandos, interrupción y cierre
node tests/proveedores.mjs     # los dos protocolos, Ollama y que ninguna clave se filtre
node tests/ejecutar.mjs        # ejecutar un archivo: detección, comandos y límites
node tests/vistaprevia.mjs     # el servidor: tipos, recarga y que no sirva nada de fuera
node tests/busqueda.mjs        # que la vista previa del reemplazo no escriba nada
node tests/git-avanzado.mjs    # traer con merge/rebase, conflictos, deshacer commit y stash
```

Y la que hay que ejecutar **antes de publicar**, porque comprueba el programa que va a recibir el
usuario y no el que tenemos en el repositorio:

```bash
npm run desktop:build
node tests/escritorio.mjs --paquete
```

Ahi es donde aparecen los fallos de empaquetado, que no se ven de ninguna otra manera: que falte un
archivo por el limite de rutas de Windows, que el terminal nativo no cargue, o que las gramaticas de
tree-sitter no lleguen al navegador.

Las de lenguajes necesitan las gramáticas: `npm run gramaticas` (lo hacen solos `npm run dev` y
`npm run build`).

---

## Licencia

MIT. Ver [LICENSE](LICENSE).
