# Historial de versiones

Todo lo que aparece aquí está comprobado ejecutándolo, no solo escrito.

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
