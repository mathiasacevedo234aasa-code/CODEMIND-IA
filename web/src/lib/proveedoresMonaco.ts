import type * as Monaco from 'monaco-editor';
import { useStore } from '../state/useStore';
import { registrarColorSemantico } from './colores';
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
  registrarColorSemantico(monaco);

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
    // Lo mismo con las referencias: las del analizador cubren el proyecto entero.
    defaults?.setModeConfiguration({ ...defaults.modeConfiguration, definitions: false, references: false });
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

  // ------------------------------------------------------ autocompletado
  //
  // Los símbolos de TODO el proyecto, en cualquier lenguaje que entienda el
  // analizador. Monaco ya completa JavaScript y TypeScript, pero solo con lo
  // que ve en el archivo abierto; esto añade lo que está en los demás, con
  // su archivo y, si está documentado, su propósito.
  const K = monaco.languages.CompletionItemKind;
  const tipoCompletado = (kind: string) =>
    /metodo|constructor/.test(kind) ? K.Method
      : /clase|componente/.test(kind) ? K.Class
        : /interfaz/.test(kind) ? K.Interface
          : /tipo|enumeracion/.test(kind) ? K.Enum
            : /constante/.test(kind) ? K.Constant
              : /propiedad/.test(kind) ? K.Property
                : /modulo/.test(kind) ? K.Module
                  : K.Function;
  monaco.languages.registerCompletionItemProvider({ scheme: 'file' }, {
    provideCompletionItems(modelo, posicion) {
      const palabra = modelo.getWordUntilPosition(posicion);
      if (!palabra.word) return { suggestions: [] };
      const ruta = rutaDe(modelo);
      const estado = useStore.getState();
      const rango = new monaco.Range(posicion.lineNumber, palabra.startColumn, posicion.lineNumber, palabra.endColumn);
      const prefijo = palabra.word.toLowerCase();
      const vistos = new Set<string>();
      const suggestions: Monaco.languages.CompletionItem[] = [];
      for (const s of estado.symbols()) {
        // Lo del propio archivo ya lo propone el lenguaje; aquí, lo de fuera.
        // Solo código: una sección de HTML o una regla CSS no se escriben como nombres.
        if (s.menor || s.category !== 'codigo' || s.filePath === ruta || vistos.has(s.name)) continue;
        if (!s.name.toLowerCase().startsWith(prefijo)) continue;
        vistos.add(s.name);
        const doc = estado.approved[s.id]?.doc;
        suggestions.push({
          label: { label: s.name, description: s.filePath },
          kind: tipoCompletado(s.kind),
          insertText: s.name,
          detail: `${s.kind}${s.params?.length ? `(${s.params.join(', ')})` : ''} — ${s.filePath}:${s.line}`,
          documentation: doc?.proposito ? { value: `${doc.proposito}\n\n_Documentación aprobada._` } : undefined,
          range: rango,
          sortText: `z${s.name}`,
        });
        if (suggestions.length >= 50) break;
      }
      return { suggestions };
    },
  });

  // ------------------------------------------------------ snippets propios
  //
  // Los que el usuario crea en Configuración. Se leen de los ajustes en cada
  // petición, así que uno nuevo funciona en el acto, sin recargar nada.
  monaco.languages.registerCompletionItemProvider({ scheme: 'file' }, {
    provideCompletionItems(modelo, posicion) {
      const snippets = useStore.getState().settings.snippets ?? [];
      if (!snippets.length) return { suggestions: [] };
      const lenguaje = modelo.getLanguageId();
      const palabra = modelo.getWordUntilPosition(posicion);
      const rango = new monaco.Range(posicion.lineNumber, palabra.startColumn, posicion.lineNumber, palabra.endColumn);
      return {
        suggestions: snippets
          .filter((s) => s.prefijo && (!s.lenguaje || s.lenguaje === lenguaje))
          .map((s) => ({
            label: { label: s.prefijo, description: 'snippet propio' },
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: s.cuerpo,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: s.descripcion || 'Snippet propio',
            documentation: { value: `\`\`\`\n${s.cuerpo}\n\`\`\`` },
            range: rango,
            sortText: `0${s.prefijo}`,
          })),
      };
    },
  });

  // ----------------------------------------------------- referencias
  //
  // Shift+F12 / "Ir a referencias": dónde aparece ese nombre en TODO el
  // proyecto (palabra completa). Es por texto, como el renombrado: también
  // encuentra el nombre en comentarios.
  monaco.languages.registerReferenceProvider({ scheme: 'file' }, {
    provideReferences(modelo, posicion) {
      const palabra = modelo.getWordAtPosition(posicion)?.word;
      if (!palabra || palabra.length < 2) return [];
      const st = useStore.getState();
      const fuentes: Record<string, string> = { ...st.sources };
      for (const [r, f] of Object.entries(st.files)) if (!f.vista) fuentes[r] = f.content;
      const re = new RegExp(`(?<![\\w$])${palabra.replace(/[$]/g, '\\$')}(?![\\w$])`, 'g');
      const salida: Monaco.languages.Location[] = [];
      for (const [ruta, texto] of Object.entries(fuentes)) {
        texto.split('\n').forEach((linea, i) => {
          for (const m of linea.matchAll(re)) {
            if (salida.length >= 500) return;
            const col = (m.index ?? 0) + 1;
            salida.push({ uri: modelo.uri.with({ path: `/${ruta}` }), range: new monaco.Range(i + 1, col, i + 1, col + palabra.length) });
          }
        });
      }
      return salida;
    },
  });

  // ------------------------------------------- imágenes al pasar el cursor
  //
  // Sobre una ruta de imagen ("img/logo.png", src="...", url(...)) se ve la
  // imagen. Solo si el archivo existe en el proyecto.
  monaco.languages.registerHoverProvider({ scheme: 'file' }, {
    provideHover(modelo, posicion) {
      const st = useStore.getState();
      if (!st.project) return null;
      const linea = modelo.getLineContent(posicion.lineNumber);
      const re = /["'(]([^"'()\s]+\.(?:png|jpe?g|gif|webp|svg|ico|avif|bmp))["')]/gi;
      for (const m of linea.matchAll(re)) {
        const inicio = (m.index ?? 0) + 2;
        const fin = inicio + m[1].length;
        if (posicion.column < inicio || posicion.column > fin) continue;
        // Relativa al archivo, y si no, desde la raíz del proyecto.
        const base = rutaDe(modelo).split('/').slice(0, -1);
        const partes = [...(m[1].startsWith('/') ? [] : base), ...m[1].replace(/^\.?\//, '').split('/')];
        const pila: string[] = [];
        for (const p of partes) { if (p === '..') pila.pop(); else if (p && p !== '.') pila.push(p); }
        const ruta = pila.join('/');
        const existe = (nodos: typeof st.tree): boolean => nodos.some((n) => (n.type === 'dir' ? existe(n.children) : n.path === ruta));
        if (!existe(st.tree)) return null;
        const url = `${location.origin}/api/projects/${st.project.id}/raw?path=${encodeURIComponent(ruta)}`;
        return {
          range: new monaco.Range(posicion.lineNumber, inicio, posicion.lineNumber, fin),
          contents: [{ value: `![${ruta}](${url}|width=220)\n\n\`${ruta}\``, isTrusted: false, supportHtml: false }],
        };
      }
      return null;
    },
  });

  // ------------------------------------------------- selector de color
  //
  // #hex, rgb() y hsl() en cualquier archivo muestran su color y, al pulsar
  // el cuadradito, un selector. En CSS ya lo hace Monaco por su cuenta.
  const SIN_SELECTOR_PROPIO = new Set(['css', 'scss', 'less']);
  const hexA = (h: string) => {
    const x = h.length <= 5 ? h.slice(1).split('').map((c) => c + c).join('') : h.slice(1);
    const n = (i: number) => parseInt(x.slice(i, i + 2), 16) / 255;
    return { red: n(0), green: n(2), blue: n(4), alpha: x.length === 8 ? n(6) : 1 };
  };
  for (const lenguaje of ['javascript', 'typescript', 'html', 'json', 'markdown', 'python', 'plaintext', 'xml', 'yaml']) {
    if (SIN_SELECTOR_PROPIO.has(lenguaje)) continue;
    monaco.languages.registerColorProvider(lenguaje, {
      provideDocumentColors(modelo) {
        const colores: Monaco.languages.IColorInformation[] = [];
        const texto = modelo.getValue();
        if (texto.length > 500000) return colores;
        for (const m of texto.matchAll(/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)/g)) {
          const ini = modelo.getPositionAt(m.index ?? 0);
          const fin = modelo.getPositionAt((m.index ?? 0) + m[0].length);
          const color = m[0].startsWith('#')
            ? hexA(m[0])
            : { red: Number(m[1]) / 255, green: Number(m[2]) / 255, blue: Number(m[3]) / 255, alpha: m[4] ? Number(m[4]) : 1 };
          colores.push({ color, range: new monaco.Range(ini.lineNumber, ini.column, fin.lineNumber, fin.column) });
        }
        return colores;
      },
      provideColorPresentations(_modelo, info) {
        const { red, green, blue, alpha } = info.color;
        const h = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
        const r = Math.round(red * 255), g = Math.round(green * 255), b = Math.round(blue * 255);
        return [
          { label: `#${h(red)}${h(green)}${h(blue)}${alpha < 1 ? h(alpha) : ''}` },
          { label: alpha < 1 ? `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})` : `rgb(${r}, ${g}, ${b})` },
        ];
      },
    });
  }

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
