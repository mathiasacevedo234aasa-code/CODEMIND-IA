# Pruebas funcionales

Son pruebas de extremo a extremo contra la API real: no hay dobles ni simulaciones. Necesitan el
backend en marcha y, para `documentacion.mjs`, una clave de Groq válida en `.env`.

```bash
npm run dev          # en una terminal
node tests/documentacion.mjs
node tests/git-y-ejecucion.mjs
```

## `documentacion.mjs`

Cubre el núcleo del producto: crear un proyecto, guardar archivos, detectar funciones con el
analizador AST, pedir una explicación a Groq, comprobar que **el código original no se toca**, que la
propuesta **no entra en la documentación oficial** hasta aprobarla, que descartarla no deja rastro,
que modificar una función marca **solo esa** para revisión, y que la clave de Groq no se filtra por
ninguna respuesta de la API.

## `git-y-ejecucion.mjs`

Cubre las fases 5 y 6. Crea la carpeta de trabajo que necesita antes de empezar:

```bash
mkdir -p ~/Desktop/codemind-demo-git/js
```

Comprueba: abrir una carpeta real del disco como proyecto, `git init`, la clasificación de cambios
(código / documentación / configuración), preparar, comparar, confirmar, historial y ramas, el
parseo de renombrados y de rutas con espacios, que cambiar de rama con cambios sin confirmar se
**bloquea** en vez de descartar trabajo, que un script inexistente se rechaza, el sondeo de URLs y
—lo más importante— que **eliminar un proyecto no borra la carpeta del usuario**.

## `analizador.mjs`

No necesita el backend: prueba el analizador directamente. Comprueba que una página HTML produce a
la vez elementos de **estructura** (secciones, formularios, tablas, componentes personalizados),
**estilo** (las reglas de su `<style>`, incluidas variables CSS y `@media`) y **código** (las
funciones y clases de su `<script>`), y —lo más delicado— que las líneas del código incrustado
apuntan a la posición real dentro del archivo completo, no a la del fragmento.

```bash
node tests/analizador.mjs
```

## `escritorio.mjs`

Arranca la aplicación de escritorio, comprueba contra su backend interno y la cierra. Todo en un
único proceso, porque Electron no sobrevive si se lanza en segundo plano y se consulta después.

```bash
npm run build          # el frontend compilado es lo que carga la ventana
node tests/escritorio.mjs
```

Comprueba que el backend arranca dentro de Electron con un puerto libre, que la ventana carga la
aplicación, que se sirve el paquete del frontend, que el explorador de disco responde, **que el
terminal nativo carga** y **que las gramáticas de tree-sitter llegan al navegador**.

Con `--paquete` examina el ejecutable ya construido en `release/win-unpacked/` en lugar del código
del repositorio. **Esa es la forma que hay que ejecutar antes de publicar**: comprueba el programa
que va a recibir el usuario, y ahí es donde aparecen los fallos de empaquetado, que no se ven de
ninguna otra manera —que falte un archivo por el límite de rutas de Windows, que un módulo nativo no
cargue, o que un binario copiado aparte se haya quedado fuera—.

```bash
npm run desktop:build
node tests/escritorio.mjs --paquete
```

---

Los resultados de la última ejecución están en `docs/PRUEBAS.md` y `docs/FASES-5-6.md`.

## `busqueda.mjs`

Prueba la búsqueda y el reemplazo contra la API. Lo más importante que comprueba es que la **vista
previa del reemplazo no escribe nada**: compara el tamaño del archivo antes y después de calcularla.

## `mapa.mjs`

Construye el mapa de dependencias de un proyecto de mentira que tiene un `<script src>`, un
`<link rel=stylesheet>`, un `@import` de CSS, imports de JavaScript, un paquete externo, un archivo
que nadie importa y un ciclo puesto a propósito. Comprueba que cada relación aparece, que el ciclo
se detecta, que `react` se clasifica como externo y que la disposición del grafo es **reproducible**:
el mapa no puede cambiar de forma solo al reabrirlo.

## `comprobaciones.mjs`

Prueba el lector de las comprobaciones del proyecto (pruebas, tipos y estilo). Traduce salidas
reales de `tsc`, de ESLint en formato *stylish*, de vitest, de jest y del corredor propio de Node,
y verifica que cada aviso queda situado en su archivo y su línea, que un archivo de fuera del
proyecto se descarta y que un `warning` no se convierte en error.

Al final ejecuta de verdad un proyecto temporal que falla, y comprueba que un script que no es una
comprobación —o que no existe en el `package.json`— se rechaza en lugar de ejecutarse.

## `lenguajes.mjs`

Analiza un archivo real de Python, Java, C#, Go, Rust, PHP, Ruby y Bash con las gramáticas de
tree-sitter, y comprueba que de cada uno salen los elementos esperados **con su tipo y su línea
real**: que un método de dentro de una clase se llama `Clase.metodo`, que un constructor no se
confunde con un método, que una variable de dentro de una función no aparece como constante del
módulo, y que las importaciones se detectan para el mapa.

Necesita las gramáticas: ejecuta `npm run gramaticas` antes (lo hacen solos `npm run dev` y
`npm run build`).

## `terminal.mjs`

Abre una consola de verdad en una carpeta temporal, ejecuta un comando, comprueba que la salida
llega entera y que la carpeta de trabajo es la del proyecto. Después lanza un proceso que tardaría
dos minutos, lo interrumpe y verifica que la consola **vuelve a responder en segundos**: si la
interrupción no funcionara, esa comprobación tardaría los dos minutos y fallaría.

También comprueba los límites (una orden vacía, un texto desmesurado, una consola que no existe) y
que al cerrar no queda ninguna sesión suelta.

Funciona igual con pseudoterminal y sin él: dice en cuál de los dos modos se ejecutó.

## `proveedores.mjs`

Prueba la capa de proveedores de IA **sin llamar a ningún servicio real**: sustituye `fetch` y mira
exactamente qué se envía y cómo se interpreta lo que llega. Eso es justo lo que se rompe al soportar
varios proveedores: mandarle a Anthropic el cuerpo de OpenAI, poner la clave en la cabecera
equivocada, o que una clave acabe dentro de un mensaje de error.

Lo más importante que comprueba: **ningún mensaje de error puede contener la API key**, ni el que
devuelve el servicio ni el de un fallo de red. Esa comprobación encontró una fuga real.

Ollama se prueba además contra un **servidor HTTP de verdad** levantado por la prueba, que habla su
mismo dialecto: listar modelos, probar la conexión y completar, por un socket real. No prueba a
Ollama —para eso hay que instalarlo—, prueba que nuestro lado del protocolo está bien.

## `ejecutar.mjs`

Prueba la ejecución de un archivo suelto. Lo que más importa: que **nunca se ofrezca un botón que
va a fallar**. Comprueba que se detectan de verdad las herramientas instaladas (Node tiene que
aparecer: es quien está ejecutando la prueba), que lo que falta dice de dónde se descarga, y que un
archivo que no se sabe ejecutar lo dice y sugiere el Terminal.

Y dos cosas que se rompen sin que se note: que un nombre de archivo con espacios o comillas no
puede partir el comando en dos, y que no se puede apuntar fuera del proyecto (`../`, rutas
absolutas). Esa última comprobación encontró un caso real: una ruta absoluta se reinterpretaba en
silencio como relativa.

Al final ejecuta de verdad el comando que genera para un `.js` y comprueba su salida, y —con el
backend en marcha— que **la respuesta dice en qué consola se ejecutó**. Eso último es el contrato
del que depende la interfaz: el panel del Terminal se engancha a esa consola. Cuando no se cumplía,
el archivo se ejecutaba de verdad pero el usuario veía un terminal vacío y parecía que no pasaba
nada.

Esa última parte necesita `npm run dev`; si el backend no responde, la prueba **falla** en lugar de
darla por buena.

## `vistaprevia.mjs`

Prueba el servidor de vista previa. Como sirve archivos del disco del usuario, lo que más importa
es que **no sirva nada de fuera de la carpeta del proyecto**, por retorcida que venga la ruta: se
prueban cinco formas de intentar escaparse, incluidas las codificadas (`..%2f`, `%2e%2e%2f`).

Además comprueba que cada tipo de archivo se sirve con su `Content-Type` —un `.js` servido como
texto plano no lo ejecuta el navegador—, que el script de recarga se inyecta en el HTML **y no
dentro de un `.js`**, que guardar un archivo avisa a la página, y que al detener el servidor el
puerto queda libre de verdad.

## `git-avanzado.mjs`

Prueba lo que puede romper el trabajo de alguien si sale mal: traer cambios con el historial
divergido, deshacer commits y el stash. No necesita GitHub ni el servidor: el "origin" es un
repositorio desnudo en una carpeta temporal y se clona dos veces, como si fueran dos personas.

Comprueba que la vista previa detecta la divergencia y enseña los commits que llegan, que solo
avanzar se niega si hay divergencia, que **no fusiona con cambios sin confirmar**, que merge crea el
commit de fusión y rebase deja tus commits encima, y que ante un conflicto se para, nombra el archivo
y **deshacer lo deja todo exactamente como estaba** (mismo commit, árbol limpio).

También que deshacer el último commit se niega si ese commit ya está en el remoto, y que si no,
conserva sus cambios preparados; que el stash aparta también los archivos nuevos y se recupera; y
que una referencia de stash rara (`--all`) se rechaza en vez de pasársela a git.

Usa su propia carpeta de datos temporal (`CODEMIND_DATA_DIR`), así que no toca tu configuración.

