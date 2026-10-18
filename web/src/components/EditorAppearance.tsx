import { useMemo } from 'react';
import { useStore } from '../state/useStore';
import { FONT_STACKS, fontStackOf, isFontAvailable } from '../lib/editorFonts';
import { EJEMPLOS_EMMET } from '../lib/emmetEjemplos';
import type { EditorSettings } from '../lib/types';

const MUESTRA = `function calcularTotal(items) {
  const total = items.reduce((suma, i) => suma + i.precio, 0);
  return total !== 0 ? total : null;
}`;

/**
 * Preferencias de apariencia del editor, con una muestra que se actualiza al
 * instante. Elegir tipografía a ciegas y tener que abrir un archivo para ver
 * el resultado sería un mal trato.
 */
export function EditorAppearance() {
  const settings = useStore((s) => s.settings);
  const saveSettings = useStore((s) => s.saveSettings);
  const editor = settings.editor;

  const set = (patch: Partial<EditorSettings>) => void saveSettings({ editor: { ...editor, ...patch } });

  // Medir fuentes es costoso: se hace una vez por lista, no en cada pulsación.
  const disponibles = useMemo(
    () => new Map(FONT_STACKS.map((f) => [f.id, f.id === 'default' || isFontAvailable(f.stack.split(',')[0].replace(/"/g, ''))])),
    [],
  );

  const elegida = fontStackOf(editor.fontFamily);
  const instalada = disponibles.get(elegida.id) ?? true;

  return (
    <>
      <div className="preview-code" style={{
        fontFamily: elegida.stack,
        fontSize: editor.fontSize,
        lineHeight: editor.lineHeight ? `${editor.lineHeight}px` : 1.5,
        letterSpacing: editor.letterSpacing ? `${editor.letterSpacing}px` : undefined,
        fontVariantLigatures: editor.fontLigatures ? 'contextual' : 'none',
      }}>
        {MUESTRA.split('\n').map((linea, i) => (
          <div key={i} className={editor.highlightCurrentLine && i === 1 ? 'preview-active' : undefined}>
            {editor.lineNumbers !== 'off' && (
              <span className="preview-gutter">
                {editor.lineNumbers === 'relative' ? Math.abs(i - 1) || 2 : i + 1}
              </span>
            )}
            <span>{linea || ' '}</span>
          </div>
        ))}
      </div>

      <div className="grid2">
        <div className="field">
          <label>Tipografía</label>
          <select value={editor.fontFamily} onChange={(e) => set({ fontFamily: e.target.value })}>
            {FONT_STACKS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}{disponibles.get(f.id) === false ? ' (no instalada)' : ''}
              </option>
            ))}
          </select>
          <p className="hint">
            {!instalada
              ? `${elegida.label} no está instalada en este equipo: se usará una de reserva.`
              : (elegida.note ?? 'Si no está instalada, se usa una monoespaciada del sistema.')}
          </p>
        </div>

        <div className="field">
          <label>Tamaño de fuente: {editor.fontSize} px</label>
          <input
            type="range" min={10} max={24} step={1}
            value={editor.fontSize}
            onChange={(e) => set({ fontSize: Number(e.target.value) })}
          />
        </div>

        <div className="field">
          <label>Altura de línea: {editor.lineHeight ? `${editor.lineHeight} px` : 'automática'}</label>
          <input
            type="range" min={0} max={40} step={1}
            value={editor.lineHeight}
            onChange={(e) => set({ lineHeight: Number(e.target.value) })}
          />
          <p className="hint">Más espacio entre líneas cansa menos la vista en sesiones largas. 0 la deja automática.</p>
        </div>

        <div className="field">
          <label>Espaciado entre letras: {editor.letterSpacing} px</label>
          <input
            type="range" min={-1} max={3} step={0.5}
            value={editor.letterSpacing}
            onChange={(e) => set({ letterSpacing: Number(e.target.value) })}
          />
        </div>

        <div className="field">
          <label>Números de línea</label>
          <select
            value={editor.lineNumbers}
            onChange={(e) => set({ lineNumbers: e.target.value as EditorSettings['lineNumbers'] })}
          >
            <option value="on">Normales</option>
            <option value="relative">Relativos a la línea actual</option>
            <option value="off">Ocultos</option>
          </select>
        </div>

        <div className="field">
          <label>Tabulación: {editor.tabSize} espacios</label>
          <input
            type="range" min={1} max={8} step={1}
            value={editor.tabSize}
            onChange={(e) => set({ tabSize: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="field">
        <label>Opciones</label>
        <div className="switch-grid">
          {([
            ['fontLigatures', 'Ligaduras', elegida.ligatures
              ? 'Une símbolos como => o !== en un solo trazo.'
              : `${elegida.label} no tiene ligaduras: activarlo no cambiará nada.`],
            ['wordWrap', 'Ajuste de línea', 'Parte las líneas largas en vez de desplazarlas.'],
            ['indentGuides', 'Guías de indentación', 'Líneas verticales que marcan los niveles.'],
            ['highlightCurrentLine', 'Resaltar la línea actual', 'Marca dónde está el cursor.'],
            ['bracketPairColorization', 'Corchetes de colores', 'Cada pareja con su color, para no perderse.'],
            ['stickyScroll', 'Encabezado fijo', 'Mantiene arriba la función en la que estás al desplazarte.'],
            ['minimap', 'Minimapa', 'Vista reducida del archivo en el lateral.'],
            ['emmet', 'Abreviaturas Emmet', 'Escribe html:5 y pulsa Tab para desplegar la página entera.'],
            ['autoSave', 'Autoguardado', 'Guarda solo tras una pausa al escribir. Ctrl+S sigue funcionando.'],
            ['formatearAlGuardar', 'Formatear al guardar (Prettier)', 'Al guardar a mano, ordena espacios y comillas de JS, TS, CSS, HTML, JSON, Markdown y YAML. Respeta tu .prettierrc. Nunca en el autoguardado.'],
          ] as const).map(([key, label, ayuda]) => (
            <label key={key} className="switch-row">
              <input
                type="checkbox"
                checked={Boolean(editor[key])}
                onChange={(e) => set({ [key]: e.target.checked } as Partial<EditorSettings>)}
              />
              <span>
                <strong>{label}</strong>
                <span className="hint">{ayuda}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {editor.autoSave && (
        <div className="field">
          <label>Guardar tras {(editor.autoSaveDelay / 1000).toFixed(1)} s sin escribir</label>
          <input
            type="range" min={400} max={5000} step={100}
            value={editor.autoSaveDelay}
            onChange={(e) => set({ autoSaveDelay: Number(e.target.value) })}
          />
        </div>
      )}

      {editor.emmet && (
        <div className="card" style={{ marginTop: 4 }}>
          <h4>Abreviaturas Emmet</h4>
          <p className="hint" style={{ marginBottom: 8 }}>
            Escribe la abreviatura y pulsa <strong>Tab</strong>. Funciona en archivos HTML, CSS y JSX.
          </p>
          {EJEMPLOS_EMMET.map((e) => (
            <div key={e.abreviatura} className="emmet-row">
              <code>{e.abreviatura}</code>
              <span>{e.resultado}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
