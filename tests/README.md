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

Verifica que el backend arranca dentro de Electron con un puerto libre, que la ventana carga la
aplicación, que el paquete del frontend se sirve, y que el explorador de disco responde.

Para comprobar el **paquete ya construido** en lugar del código, cambia la constante `electron` del
archivo por `release/win-unpacked/CodeMind AI.exe` y quita el argumento de la carpeta `desktop`.

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
