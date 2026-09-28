# Historial de versiones

Todo lo que aparece aquí está comprobado ejecutándolo, no solo escrito.

---

## 1.2.0

### La documentacion, por fin, se lee

Estaba guardada y era practicamente inalcanzable: para leer algo documentado
habia que abrir el centro de documentacion, entrar en su seccion, buscar el
elemento y desplegarlo. Cuatro pasos y saber donde mirar. En la practica,
nadie la leia.

Ahora hay tres formas, todas de un paso:

- Una pestana **Documentacion** en el panel derecho, con lo documentado del
  archivo que tienes abierto y un contador de cuantos son.
- Un boton **Ver documentacion** en cada elemento documentado del panel.
- **Pasando el cursor por encima en el editor**: el proposito, los parametros
  y lo que devuelve, sin ir a ninguna parte. Si hay que buscarla, no se lee.

### Vista previa con servidor propio, como Live Server

Antes la vista previa era un iframe con el HTML metido dentro. Sirve para
mirar una pagina suelta y se queda corta en cuanto el proyecto es un proyecto:
las rutas relativas no resuelven igual, `fetch` no funciona y los modulos de
JavaScript no cargan, porque nada de eso existe sin un origen http de verdad.

Ahora se levanta un servidor HTTP sobre tu carpeta, uno por proyecto, en
`127.0.0.1` y en un puerto suyo, **y recarga la pagina sola al guardar**. El
boton "Vista previa" de arriba lo arranca y lo abre dentro del editor.

Solo escucha en 127.0.0.1 y no sirve nada de fuera de la carpeta del
proyecto; hay una prueba que intenta escaparse de cinco formas distintas.

### Ocho lenguajes mas

Scala, Elixir, OCaml, Objective-C, Zig, Solidity, JSON y TOML, ademas de los
catorce que ya habia: veintidos en total.

No estan todos los que tiene la libreria, y no por pereza: **Elm y YAML no
cargan** con esta version del motor (Elm dice "Incompatible language version
12" y el de YAML falla al inicializarse), y QL, ReScript, Emacs Lisp, TLA+ y
SystemRDL pesarian sin que nadie los fuera a usar aqui. Cada uno de los que
entran se probo cargando su gramatica y mirando que produce: incluir una
gramatica de la que no se extrae nada solo hace el paquete mas grande.

Elixir necesito un caso aparte: como todo se declara con macros, para la
gramatica `defmodule` y `def` son el mismo nodo y hay que mirar el nombre de
la macro para saber que es.

### Aspecto

Una capa visual nueva sobre los mismos tokens: profundidad con una escala de
sombras en vez de una sola, foco visible de verdad en los dos temas, marca de
la vista activa en la barra lateral, etiquetas redondeadas, el punto verde de
lo que esta en marcha late, y las secciones de la documentacion con
encabezados que se distinguen del texto.

Va en un archivo aparte a proposito: si algo molesta, se quita ese archivo y
la aplicacion sigue funcionando igual.

Probe esconder los botones de cada elemento hasta pasar el raton. Quedaba mas
limpio y lo descarte: esta aplicacion acaba de tener el problema contrario, y
un boton que solo aparece si aciertas a pasar por encima es un boton que la
mitad de la gente no descubre.

---

## 1.1.1

### El boton de ejecutar parecia no hacer nada

Se ejecutaba de verdad —Python corria y daba su salida— pero el panel del
Terminal no se enganchaba a la consola que acababa de abrirse: seguia
enseñando "Abrir la consola", vacio. Desde fuera era indistinguible de que no
funcionara.

La causa: el panel buscaba una consola viva solo al abrir el proyecto, y la
que crea el boton de ejecutar aparecia despues. Ahora cual es la consola
actual es estado compartido, asi que el boton deja dicho a cual engancharse y
el panel la muestra.

Es culpa mia de dos maneras. La primera, el fallo. La segunda, que al
comprobarlo mire la salida en el backend en lugar de mirar la pantalla, y di
por bueno algo que el usuario no podia ver.

---

## 1.1.0

### Ejecutar un archivo, en el lenguaje que sea

Tienes un `.py` abierto, pulsas el boton ▷ de la barra de pestanas y se
ejecuta. Lo mismo con JavaScript, TypeScript (sin compilar: Node se encarga),
Ruby, PHP, Go, Java, Rust, C, C++, C#, Lua, Dart, Swift, Bash y PowerShell.

Se ejecuta **dentro del Terminal**, no como un proceso aparte. Eso no es un
detalle: un programa que hace `input()` o pide una contrasena se quedaria
colgado para siempre sin una consola de verdad, y no habria forma de saber
por que. Asi ademas se ve en color, se puede parar con Ctrl+C y queda el
comando escrito, que es la mejor manera de aprender cual era.

Antes de ofrecer el boton se comprueba que la herramienta esta instalada,
preguntandole su version. Si no lo esta, se dice **cual falta y donde se
descarga**, en vez de dejar que el comando falle con "comando no encontrado".
El panel *Ejecutar* lista lo que este equipo puede ejecutar ahora mismo, con
un boton para volver a comprobarlo si instalas algo sin reiniciar nada.

Tres formas de lanzarlo, todas la misma: el boton de la barra de pestanas,
**F5** y la paleta de comandos. F5 solo se intercepta cuando de verdad hay
algo que ejecutar; si no, se deja pasar.

Dos casos que se detectan bien a proposito: en Windows, `python3` es un
señuelo de la Microsoft Store que imprime un anuncio, y un Java 8 no puede
ejecutar un `.java` suelto, cosa que necesita Java 11. En los dos se dice
exactamente lo que pasa.

### Corregido

- Al ejecutar en una consola recien abierta, el comando se escribia antes de
  que el interprete terminara de arrancar y se quedaba a medias, sin correr
  nunca. Ahora se espera a que este listo.
- Una ruta absoluta se reinterpretaba en silencio como relativa al proyecto,
  o sea que apuntaba a un archivo distinto del pedido sin avisar. Ahora se
  rechaza. Lo encontro la prueba nueva.
- `tests/busqueda.mjs` usaba el primer proyecto de la lista, asi que fallaba
  segun lo que hubiera en el equipo. Ahora se crea el suyo y lo borra.

---

## 1.0.1

Correcciones de lo que aparecio al usar la 1.0.0 de verdad.

### No dejaba escribir

Al hacer clic dentro del editor, la pestana saltaba sola a otro archivo y lo
que escribias no llegaba a ninguna parte. Era del editor dividido: al recibir
el foco se reactivaba "la ultima pestana usada en esta mitad", que tras
recuperar una sesion casi nunca es la que estas viendo. Ahora, si la pestana
activa ya vive en esa mitad, no se toca nada.

### El panel no reconocia la mayoria de las etiquetas

Solo aparecian las secciones, los encabezados, los formularios, las tablas,
las listas y lo que llevara `id`. Se quedaban fuera los parrafos, los enlaces,
las imagenes, los controles, las celdas, el `<title>` y hasta el `<body>`:
abrias tu pagina y faltaba media.

Ahora se reconocen **todas**, con su tipo (enlace, multimedia, control,
contenedor, metadato, texto) y con sus atributos a la vista. Para que una
pagina grande siga siendo legible, el panel tiene un filtro *Sin relleno* que
esconde los parrafos y contenedores que no llevan ni `id` ni clase.

### Y se sentia trabada al escribir

Analizar una pagina de 3600 lineas tardaba **1,3 segundos**, y eso corre con
cada pulsacion: escribir en un archivo grande era un suplicio. Dos causas:
para cada etiqueta se contaban los saltos de linea desde el principio del
archivo (recorrerlo entero, una vez por etiqueta), y de cada elemento se unia
su contenido completo para despues recortarlo a 20 000 caracteres, asi que el
`<body>` copiaba el documento entero.

Ahora el indice de lineas se calcula una vez y cada consulta es una busqueda
binaria, y solo se copian las lineas que caben en el limite. La misma pagina
pasa de 1295 ms a 20 ms.

El panel, ademas, dibujaba los 4200 elementos de esa pagina en cada
redibujado. Ahora pinta 300 y dice cuantos hay en total: no se esconde nada a
la callada, pero escribir vuelve a ser instantaneo.

### Otras

- Una constante del modulo con un valor sencillo (`export const VERSION =
  "1.0.0"`, `const IVA = 0.19`) no se detectaba. Solo contaban los objetos,
  listas y expresiones regulares. Dentro de una funcion sigue sin contar,
  porque ahi es una variable de trabajo.
- Las propuestas titulaban **"Funcion"** cualquier cosa, asi que un `<form>` o
  una regla CSS aparecian como funciones. Ahora el titulo dice lo que es, y a
  lo que no se invoca no se le ensenan las secciones de parametros y retorno,
  que ahi no significan nada.

---

## 1.0.0

La versión en la que CodeMind AI deja de ser un editor con documentación asistida y pasa a ser un
entorno de trabajo completo. Lo que cambia de fondo: **entiende muchos más lenguajes, no depende de
ningún servicio de IA concreto, y tiene un terminal de verdad**.

### El analizador entiende catorce lenguajes más

Python, Java, C#, Go, PHP, Ruby, Rust, C, C++, Bash, Lua, Kotlin, Swift y Dart. De cada archivo
salen sus clases, funciones, métodos, constructores, propiedades, interfaces, enumeraciones y
constantes, con su línea real, y sus importaciones alimentan el mapa del proyecto.

Los analizadores de JavaScript, HTML y CSS siguen escritos a mano porque son los lenguajes que el
propio editor entiende. Para los demás se usa tree-sitter, el mismo motor que usan los editores de
verdad, con su gramática compilada a WebAssembly. **Todo ocurre en tu equipo**: las gramáticas son
archivos locales y el código no sale de aquí para analizarse.

### Varios servicios de IA, y uno que corre en tu equipo

Groq, OpenAI, Anthropic, OpenRouter y **Ollama**. Cada uno guarda su propia clave y su propio
modelo: cambiar de uno a otro y volver no pierde nada de lo configurado.

Con Ollama el modelo corre en tu propia máquina: el código no sale de ella en ningún momento y la
aplicación funciona sin conexión. Para un programa cuyo único trabajo es leer tu código, esa es una
diferencia que importa.

### Terminal de verdad

El intérprete real del equipo abierto en la carpeta del proyecto, con prompt, eco de lo que
escribes, colores y **Ctrl+C de verdad** — comprobado interrumpiendo un proceso de Python, que
responde con `KeyboardInterrupt` en lugar de morir de un golpe.

Aquí no hay lista de comandos permitidos: una consola que solo deja escribir ciertas cosas no es una
consola. El panel *Ejecutar* mantiene su lista blanca, porque ahí el propósito es otro.

### Mapa del proyecto

El proyecto dibujado como un grafo, construido **solo con hechos comprobables**: los `import`, los
`<script src>`, los `<link rel=stylesheet>` y los `@import`. Nada se deduce ni se inventa; lo que no
se puede resolver a un archivo del proyecto se muestra aparte como dependencia externa, no como una
flecha supuesta. Detecta ciclos, los archivos de los que más depende el proyecto y los que nadie
importa.

### Comprobaciones del proyecto

Ejecuta tus scripts de pruebas, tipos y estilo, y convierte su salida en una lista de avisos con
archivo y línea en los que se puede pulsar para ir al sitio exacto. Lee `tsc`, ESLint, vitest, jest,
TAP y el corredor propio de Node.

No trae compilador ni analizador propios y **no corrige nada**: enseña lo que dice tu herramienta con
tus reglas. Si no entiende la salida, lo dice y la muestra entera en vez de inventar una
interpretación.

### Glosario del proyecto

Las palabras propias del dominio —«carrito», «reserva», «pedido en firme»— con su significado y con
los archivos donde aparecen, que se pueden abrir. La IA propone candidatos a partir de los nombres
del código; ninguno entra sin que una persona lo apruebe, igual que con la documentación. El
asistente usa después el glosario aprobado como vocabulario dado por bueno.

### Editor dividido

Dos mitades, cada una con sus pestañas y su archivo. La mitad enfocada es donde se abre lo
siguiente, y la división se guarda con la sesión.

### Corregido

- **Una API key podía acabar dentro de un mensaje de error** por la vía de un fallo de red, que es
  justo el texto que uno copia y pega para pedir ayuda. Ahora toda clave se borra de cualquier
  mensaje antes de que salga, y hay una prueba que lo vigila. La encontró esa prueba.
- **Un salto a una línea se perdía en silencio** cuando el editor acababa de abrirse: quedaba
  guardada la referencia a un Monaco ya destruido, que acepta las órdenes sin hacer nada. Afectaba a
  «Ir al código», a los resultados de la búsqueda y a los avisos de las comprobaciones.
- **El analizador de CSS** atribuía a cada selector la línea del anterior, y con ella sus
  propiedades.
- **El mapa** hacía pasar por externos los imports relativos, y los `<script src>` nunca llegaban a
  la lista de dependencias.
- **La consola se perdía al cambiar de pestaña** aunque la sesión siguiera viva en el backend.

---

## 0.2.0

Diálogos propios en lugar de `window.prompt`, que Electron no implementa: cinco botones estaban
muertos y fallaban con «prompt() is not supported». Los nuevos además validan antes de aceptar.

Búsqueda y reemplazo en todo el proyecto con vista previa obligatoria, paleta de comandos, Emmet,
apariencia del editor configurable, exportación de la documentación, detección de código sin usar y
niveles de explicación.

---

## 0.1.5

Arreglado el 401 de Groq en la aplicación instalada. La causa no era la clave: una variable de
entorno antigua del sistema tapaba la buena, y la aplicación instalada no lleva `.env` dentro. Ahora
el mensaje de error **dice de dónde salió la clave**, y *Probar conexión* llama de verdad al servicio
en lugar de comprobar que hay algo escrito.

---

## 0.1.0

Aplicación de escritorio con Electron. El backend no es un segundo proceso: el proceso principal ya
es Node e importa el backend directamente.

Aquí apareció el problema más difícil de todos: el instalador se generaba bien y la aplicación
fallaba al arrancar con `Cannot find module './implementation'`. Las dependencias anidadas generaban
rutas de casi 200 caracteres que, sumadas al prefijo de `C:\Program Files\`, rebasaban el límite de
260 de Windows, y **algunos archivos simplemente no se copiaban, sin ningún error**. Se resolvió
instalando fuera del monorepo, y quedaron dos guardas que abortan el build si vuelve a acercarse al
límite.

---

## Fases 1 a 6

Editor Monaco, explorador de archivos, persistencia en disco, detección de funciones por AST,
documentación asistida con aprobación manual, centro de documentación, memoria del proyecto,
historial, Git real, GitHub por token, ejecución de servidores de desarrollo y navegador integrado.
