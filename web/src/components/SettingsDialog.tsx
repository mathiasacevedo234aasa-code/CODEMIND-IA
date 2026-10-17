import { useStore } from '../state/useStore';
import { Icon } from './Icon';
import { EditorAppearance } from './EditorAppearance';
import { ProveedorIADialog } from './ProveedorIADialog';
import { useT } from '../lib/i18n';

export function SettingsDialog() {
  const t = useT();
  const open = useStore((s) => s.settingsOpen);
  const setOpen = useStore((s) => s.setSettingsOpen);
  const settings = useStore((s) => s.settings);
  const saveSettings = useStore((s) => s.saveSettings);

  if (!open) return null;

  return (
    <div className="overlay" onClick={() => setOpen(false)}>
      <div className="modal narrow" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t('Configuración')}</h2>
          <button className="btn icon" onClick={() => setOpen(false)}><Icon name="close" /></button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>{t('Idioma')} / Language</label>
            <select
              value={settings.idioma ?? 'es'}
              onChange={(e) => void saveSettings({ idioma: e.target.value as 'es' | 'en' })}
            >
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
            <p className="hint">{t('Idioma de la interfaz y de lo que escribe la IA (explicaciones, documentación y respuestas del asistente).')}</p>
          </div>

          <ProveedorIADialog />

          <div className="field">
            <label>{t('Nivel de las explicaciones')}</label>
            <select
              value={settings.explanationLevel}
              onChange={(e) => void saveSettings({ explanationLevel: e.target.value as 'principiante' | 'intermedio' | 'avanzado' })}
            >
              <option value="principiante">{t('Principiante — evita la jerga y explica los términos')}</option>
              <option value="intermedio">{t('Intermedio — para quien ya programa')}</option>
              <option value="avanzado">{t('Avanzado — al grano, con los detalles finos')}</option>
            </select>
            <p className="hint">
              {t('Cambia el tono y la profundidad de lo que escribe la IA, no los hechos: sigue sin poder inventarse nada ni corregir tu código.')}
            </p>
          </div>

          <div className="field">
            <label>{t('Estilo de la documentación')}</label>
            <select
              value={settings.estiloDoc ?? 'normal'}
              onChange={(e) => void saveSettings({ estiloDoc: e.target.value as 'normal' | 'breve' | 'didactico' | 'jsdoc' })}
            >
              <option value="normal">{t('Normal — completa y equilibrada')}</option>
              <option value="breve">{t('Breve — lo justo, en una o dos frases por campo')}</option>
              <option value="didactico">{t('Didáctico — para estudiantes, con ejemplos comentados')}</option>
              <option value="jsdoc">{t('Formal — tono de referencia, ejemplo en formato JSDoc o docstring')}</option>
            </select>
            <p className="hint">
              {t('Se combina con el nivel de arriba: el nivel decide a quién se explica y el estilo, cómo se escribe.')}
            </p>
          </div>

          <div className="grid2">
            <div className="field">
              <label>{t('Temperatura ({t})', { t: settings.temperature })}</label>
              <input
                type="number" min={0} max={2} step={0.1}
                value={settings.temperature}
                onChange={(e) => void saveSettings({ temperature: Number(e.target.value) })}
              />
            </div>
            <div className="field">
              <label>{t('Tokens máximos de respuesta')}</label>
              <input
                type="number" min={256} max={8192} step={128}
                value={settings.maxTokens}
                onChange={(e) => void saveSettings({ maxTokens: Number(e.target.value) })}
              />
            </div>
          </div>

          <h3 style={{ fontSize: 13, margin: '18px 0 10px' }}>{t('Editor')}</h3>

          <div className="field">
            <label>{t('Tema')}</label>
            <select
              value={settings.editor.theme}
              onChange={(e) => void saveSettings({ editor: { ...settings.editor, theme: e.target.value as 'dark' | 'light' } })}
            >
              <option value="dark">{t('Oscuro')}</option>
              <option value="light">{t('Claro')}</option>
            </select>
          </div>

          <EditorAppearance />
        </div>
        <div className="modal-foot">
          <button className="btn primary" onClick={() => setOpen(false)}>{t('Cerrar')}</button>
        </div>
      </div>
    </div>
  );
}
