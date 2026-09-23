import { useState } from 'react';
import { useStore } from '../state/useStore';
import { api } from '../lib/api';
import { Icon } from './Icon';

export function SettingsDialog() {
  const open = useStore((s) => s.settingsOpen);
  const setOpen = useStore((s) => s.setSettingsOpen);
  const settings = useStore((s) => s.settings);
  const defaultModel = useStore((s) => s.defaultModel);
  const saveSettings = useStore((s) => s.saveSettings);
  const apiKeyConfigured = useStore((s) => s.apiKeyConfigured);
  const saveApiKey = useStore((s) => s.saveApiKey);
  const clearApiKey = useStore((s) => s.clearApiKey);
  const setError = useStore((s) => s.setError);

  const [key, setKey] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  if (!open) return null;

  const loadModels = async () => {
    setLoadingModels(true);
    try {
      const res = await api.models();
      setModels(res.models.map((m) => m.id).sort());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingModels(false);
    }
  };

  return (
    <div className="overlay" onClick={() => setOpen(false)}>
      <div className="modal narrow" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Configuracion</h2>
          <button className="btn icon" onClick={() => setOpen(false)}><Icon name="close" /></button>
        </div>
        <div className="modal-body">
          <h3 style={{ fontSize: 13, margin: '0 0 10px' }}>Groq</h3>

          <div className="field">
            <label>API key</label>
            {apiKeyConfigured ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className="tag ok"><Icon name="check" size={11} /> Configurada en el backend</span>
                <button className="btn sm danger" onClick={() => void clearApiKey()}>Eliminar clave guardada</button>
              </div>
            ) : (
              <p className="hint">No hay ninguna clave configurada.</p>
            )}
            <input
              type="password"
              placeholder="gsk_..."
              value={key}
              onChange={(e) => setKey(e.target.value)}
              autoComplete="off"
            />
            <button
              className="btn primary"
              disabled={key.trim().length < 20}
              onClick={async () => { await saveApiKey(key.trim()); setKey(''); }}
            >
              Guardar clave en el backend
            </button>
            <p className="hint">
              La clave se envia al backend local y se guarda en <code>server/data/secrets.json</code>. No se devuelve nunca
              a la interfaz, no se escribe en la consola y no viaja al navegador en ninguna respuesta. La via recomendada
              sigue siendo el archivo <code>.env</code>, que esta excluido del control de versiones.
            </p>
          </div>

          <div className="field">
            <label>Modelo</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                placeholder={defaultModel}
                value={settings.model ?? ''}
                onChange={(e) => void saveSettings({ model: e.target.value || null })}
              />
              <button className="btn outline" onClick={() => void loadModels()} disabled={loadingModels || !apiKeyConfigured}>
                {loadingModels ? <span className="spinner" /> : <Icon name="refresh" size={13} />} Consultar
              </button>
            </div>
            {models.length > 0 && (
              <select value={settings.model ?? ''} onChange={(e) => void saveSettings({ model: e.target.value || null })}>
                <option value="">(usar el del archivo .env: {defaultModel})</option>
                {models.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            )}
            <p className="hint">
              Vacio significa usar <code>{defaultModel}</code>. Los identificadores de modelo cambian con el tiempo:
              usa "Consultar" para ver los que tu cuenta tiene disponibles ahora mismo.
            </p>
          </div>

          <div className="grid2">
            <div className="field">
              <label>Temperatura ({settings.temperature})</label>
              <input
                type="number" min={0} max={2} step={0.1}
                value={settings.temperature}
                onChange={(e) => void saveSettings({ temperature: Number(e.target.value) })}
              />
            </div>
            <div className="field">
              <label>Tokens maximos de respuesta</label>
              <input
                type="number" min={256} max={8192} step={128}
                value={settings.maxTokens}
                onChange={(e) => void saveSettings({ maxTokens: Number(e.target.value) })}
              />
            </div>
          </div>

          <h3 style={{ fontSize: 13, margin: '18px 0 10px' }}>Editor</h3>
          <div className="grid2">
            <div className="field">
              <label>Tema</label>
              <select
                value={settings.editor.theme}
                onChange={(e) => void saveSettings({ editor: { ...settings.editor, theme: e.target.value as 'dark' | 'light' } })}
              >
                <option value="dark">Oscuro</option>
                <option value="light">Claro</option>
              </select>
            </div>
            <div className="field">
              <label>Tamano de fuente</label>
              <input
                type="number" min={10} max={24}
                value={settings.editor.fontSize}
                onChange={(e) => void saveSettings({ editor: { ...settings.editor, fontSize: Number(e.target.value) } })}
              />
            </div>
            <div className="field">
              <label>Tabulacion</label>
              <input
                type="number" min={1} max={8}
                value={settings.editor.tabSize}
                onChange={(e) => void saveSettings({ editor: { ...settings.editor, tabSize: Number(e.target.value) } })}
              />
            </div>
            <div className="field">
              <label>Opciones</label>
              <label className="hint" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="checkbox" style={{ width: 'auto' }}
                  checked={settings.editor.wordWrap}
                  onChange={(e) => void saveSettings({ editor: { ...settings.editor, wordWrap: e.target.checked } })}
                />
                Ajuste de linea
              </label>
              <label className="hint" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="checkbox" style={{ width: 'auto' }}
                  checked={settings.editor.minimap}
                  onChange={(e) => void saveSettings({ editor: { ...settings.editor, minimap: e.target.checked } })}
                />
                Minimapa
              </label>
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn primary" onClick={() => setOpen(false)}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
