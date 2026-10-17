import type * as Monaco from 'monaco-editor';
import { useStore } from '../state/useStore';
import type { DetectedSymbol } from './types';

/**
 * Lo que el editor sabe de tu proyecto gracias al analizador.
 *
 * Se registra UNA vez por sesión. Antes la documentación al pasar el cursor
 * se registraba en cada montaje de Monaco, y como Monaco se vuelve a crear al
 * cambiar de archivo, tras abrir unos cuantos la misma explicación salía
 * repetida varias veces en el mismo recuadro.
 */
let registrados = false;

interface ModoTs {
  modeConfiguration: Record<string, boolean>;
  setModeConfiguration(c: Record<string, boolean>): void;
}

const rutaDe = (modelo: Monaco.editor.ITextModel) => modelo.uri.path.replace(/^\//, '');

/**
 * La definición de un nombre, preferentemente en el mismo archivo.
 *
 * Es búsqueda por nombre, no un compilador: si dos archivos declaran algo con
 * el mismo nombre, se elige el del archivo actual y si no, el primero. Para
 * ir y venir por el proyecto basta y sobra; para refactorizar no valdría,
 * pero esta aplicación no refactoriza.
 */
export function definicionDe(nombre: string, rutaActual: string | null): DetectedSymbol | null {
  const simbolos = useStore.getState().symbols().filter((s) => s.name === nombre && !s.menor);
  if (!simbolos.length) return null;
  return simbolos.find((s) => s.filePath === rutaActual) ?? simbolos[0];
}

export function registrarProveedores(monaco: typeof Monaco) {
  if (registrados) return;
  registrados = true;

  // ---------------------------------------------------- documentación
  monaco.languages.registerHoverProvider({ scheme: 'file' }, {
    provideHover(modelo, posicion) {
      const ruta = rutaDe(modelo);
      const estado = useStore.getState();
      const palabra = modelo.getWordAtPosition(posicion);
      if (!palabra) return null;

      const candidatos = Object.values(estado.approved).filter((d) => d.filePath === ruta);
      if (!candidatos.length) return null;

      // Lo documentado de ESTE archivo que contenga la línea y coincida con
      // la palabra: así un método no se confunde con otro de igual nombre.
      const simbolos = estado.symbols().filter((x) => x.filePath === ruta);
      const aqui = simbolos.find(
        (x) => x.name === palabra.word && x.line <= posicion.lineNumber && x.endLine >= posicion.lineNumber,
      ) ?? simbolos.find((x) => x.name === palabra.word);
      const doc = aqui ? estado.approved[aqui.id] : candidatos.find((d) => d.name === palabra.word);
      if (!doc) return null;

      const alDia = aqui ? estado.statusOf(aqui) !== 'revisar' : true;
      const d = doc.doc;
      const partes = [
        `**${d.nombre}** — ${doc.kind ?? 'elemento'}`,
        alDia ? '' : '⚠ _El código cambió desde que se aprobó esta explicación._',
        d.proposito,
        d.parametros?.length
          ? `**Parámetros:** ${d.parametros.map((p) => `\`${p.nombre}\`${p.descripcion ? ` — ${p.descripcion}` : ''}`).join('; ')}`
          : '',
        d.retorno?.descripcion ? `**Devuelve:** ${d.retorno.descripcion}` : '',
        '_Documentación aprobada por ti en CodeMind AI._',
      ].filter(Boolean);

      return {
        range: new monaco.Range(posicion.lineNumber, palabra.startColumn, posicion.lineNumber, palabra.endColumn),
        contents: partes.map((valor) => ({ value: valor, isTrusted: false })),
      };
    },
  });

  // ------------------------------------------------ ir a la definición
  //
  // Monaco trae su propia "definición" para JavaScript y TypeScript, pero solo
  // conoce el archivo abierto: desde un `import` te lleva a la línea del
  // propio import, nunca al otro archivo. Con las dos activas salía una lista
  // para elegir en vez de saltar. Se apaga la suya y queda la del analizador,
  // que sí conoce el proyecto entero.
  const ts = (monaco.languages as unknown as {
    typescript?: { typescriptDefaults: ModoTs; javascriptDefaults: ModoTs };
  }).typescript;
  for (const defaults of [ts?.typescriptDefaults, ts?.javascriptDefaults]) {
    defaults?.setModeConfiguration({ ...defaults.modeConfiguration, definitions: false });
  }
  //
  // Funciona en los 22 lenguajes que entiende el analizador, no solo en los
  // que Monaco conoce por su cuenta: F12, Ctrl+clic y "Ir a la definición".
  monaco.languages.registerDefinitionProvider({ scheme: 'file' }, {
    provideDefinition(modelo, posicion) {
      const palabra = modelo.getWordAtPosition(posicion);
      if (!palabra) return null;
      const destino = definicionDe(palabra.word, rutaDe(modelo));
      if (!destino) return null;
      // Si ya estás encima de la propia declaración, no hay a dónde ir.
      if (destino.filePath === rutaDe(modelo) && destino.line === posicion.lineNumber) return null;
      return {
        uri: modelo.uri.with({ path: `/${destino.filePath}` }),
        range: new monaco.Range(destino.line, 1, destino.line, 1),
      };
    },
  });

  // Saltar a OTRO archivo lo tiene que hacer la aplicación: Monaco por sí solo
  // no sabe abrir pestañas. Se abre el archivo y se lleva el cursor a la línea.
  monaco.editor.registerEditorOpener({
    openCodeEditor(_origen, recurso, seleccion) {
      const ruta = recurso.path.replace(/^\//, '');
      const linea = seleccion && 'startLineNumber' in seleccion
        ? seleccion.startLineNumber
        : (seleccion as Monaco.IPosition | undefined)?.lineNumber ?? 1;
      const estado = useStore.getState();
      void estado.openFile(ruta).then(() => estado.jumpToLine(ruta, linea));
      return true;
    },
  });
}
