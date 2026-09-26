import { emmetHTML, emmetCSS, emmetJSX } from 'emmet-monaco-es';
import type * as Monaco from 'monaco-editor';

/**
 * Emmet dentro del editor.
 *
 * Es lo que hace que escribir `html:5` y pulsar Tab despliegue el esqueleto
 * completo de una página, o que `ul>li.item*3` cree la lista entera. Para
 * escribir HTML a mano es la diferencia entre teclear y construir.
 *
 * Se activa una sola vez por sesión: la librería registra proveedores globales
 * en Monaco y volver a llamarla duplicaría las sugerencias.
 */

let activado = false;
const liberar: Array<() => void> = [];

export function activarEmmet(monaco: typeof Monaco): void {
  if (activado) return;
  activado = true;

  // Cada lenguaje tiene su dialecto: la abreviatura de HTML no sirve en CSS,
  // y en JSX las clases se escriben como className.
  liberar.push(emmetHTML(monaco, ['html', 'php', 'handlebars', 'markdown']));
  liberar.push(emmetCSS(monaco, ['css', 'scss', 'less']));
  liberar.push(emmetJSX(monaco, ['javascript', 'typescript']));
}

/** Solo para pruebas: deja Monaco como estaba. */
export function desactivarEmmet(): void {
  for (const fn of liberar.splice(0)) fn();
  activado = false;
}

/** Ejemplos que se muestran en la ayuda de la interfaz. */
export const EJEMPLOS_EMMET = [
  { abreviatura: 'html:5', resultado: 'El esqueleto completo de una página HTML5' },
  { abreviatura: 'div.tarjeta', resultado: '<div class="tarjeta"></div>' },
  { abreviatura: 'ul>li*3', resultado: 'Una lista con tres elementos' },
  { abreviatura: 'nav>ul>li.enlace*4>a', resultado: 'Un menú de navegación completo' },
  { abreviatura: 'section#inicio', resultado: '<section id="inicio"></section>' },
  { abreviatura: 'img[src=foto.jpg]', resultado: 'Una imagen con su atributo' },
  { abreviatura: 'm10' , resultado: 'margin: 10px;  (en archivos CSS)' },
];
