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
