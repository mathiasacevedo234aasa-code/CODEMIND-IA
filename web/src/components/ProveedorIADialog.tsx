import { useEffect, useState } from 'react';
import { useStore } from '../state/useStore';
import { api } from '../lib/api';
import type { EstadoClave, ProveedorIA, PruebaConexion } from '../lib/types';
import { Icon } from './Icon';

/**
 * Elección del servicio de IA.
 *
 * CodeMind AI no está casado con ningún proveedor. Puedes usar Groq, OpenAI,
 * Anthropic u OpenRouter, o **Ollama en tu propio equipo**, que es la opción
 * en la que el código no sale de la máquina y además funciona sin conexión.
 *
 * Cada proveedor guarda su propia clave y su propio modelo: cambiar de uno a
 * otro y volver no pierde nada de lo que ya habías configurado.
 */
export function ProveedorIADialog() {
  const settings = useStore((s) => s.settings);
  const saveSettings = useStore((s) => s.saveSettings);
  const saveApiKey = useStore((s) => s.saveApiKey);
  const clearApiKey = useStore((s) => s.clearApiKey);
  const claves = useStore((s) => s.claves);
  const proveedores = useStore((s) => s.proveedores);
  const setError = useStore((s) => s.setError);

  const [clave, setClave] = useState('');
  const [modelos, setModelos] = useState<string[]>([]);
  const [cargandoModelos, setCargandoModelos] = useState(false);
  const [prueba, setPrueba] = useState<PruebaConexion | null>(null);
  const [probando, setProbando] = useState(false);

  const activo: ProveedorIA | undefined =
    proveedores.find((p) => p.id === settings.proveedor) ?? proveedores[0];
  const estadoClave: EstadoClave = claves[settings.proveedor] ?? { configured: false, source: null };
  const modeloElegido = settings.modelos?.[settings.proveedor] ?? '';

  // Al cambiar de proveedor, lo de antes ya no aplica: ni los modelos ni la
  // prueba de conexión ni la clave a medio escribir.
  useEffect(() => {
    setModelos([]);
    setPrueba(null);
    setClave('');
  }, [settings.proveedor]);

  const probar = async () => {
    setProbando(true);
    setPrueba(null);
    try {
      setPrueba(await api.probarIA(settings.proveedor));
    } catch (err) {
      setPrueba({
        ok: false, proveedor: settings.proveedor, nombre: activo?.nombre ?? '',
        source: null, message: (err as Error).message,
      });
    } finally {
      setProbando(false);
    }
  };

  const cargarModelos = async () => {
    setCargandoModelos(true);
    try {
      const res = await api.models(settings.proveedor);
      setModelos(res.models.map((m) => m.id).sort());
      if (!res.models.length) {
        setError(activo?.local
          ? 'Ollama responde pero no tiene ningún modelo descargado. Usa "ollama pull <modelo>".'
          : 'El proveedor no devolvió ningún modelo.');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCargandoModelos(false);
    }
  };

  if (!activo) return null;

  const listoParaUsar = !activo.necesitaClave || estadoClave.configured;

  return (
    <>
      <h3 style={{ fontSize: 13, margin: '0 0 10px' }}>Servicio de IA</h3>

      <div className="field">
        <label>Proveedor</label>
        <select
          value={settings.proveedor}
          onChange={(e) => void saveSettings({ proveedor: e.target.value })}
        >
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
              {p.necesitaClave ? (claves[p.id]?.configured ? ' — con clave' : ' — sin clave') : ' — sin clave'}
            </option>
          ))}
        </select>
        <p className="hint">{activo.nota}</p>
        {activo.local && (
          <p className="hint" style={{ color: 'var(--ok)' }}>
            <Icon name="check" size={12} /> Con Ollama, tu código <strong>no sale de este equipo</strong> en ningún
            momento y la aplicación funciona sin conexión.
          </p>
        )}
      </div>

      {activo.local && (
        <div className="field">
          <label>Dirección de Ollama</label>
          <input
            type="text"
            value={settings.ollamaUrl}
            placeholder="http://localhost:11434/v1"
            onChange={(e) => void saveSettings({ ollamaUrl: e.target.value })}
          />
          <p className="hint">
            Cámbiala solo si tienes Ollama en otro puerto o en otra máquina de tu red. Debe terminar en
            <code> /v1</code>.
          </p>
        </div>
      )}

      {activo.necesitaClave && (
        <div className="field">
          <label>API key de {activo.nombre}</label>
          {estadoClave.configured ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="tag ok"><Icon name="check" size={11} /> Hay una clave configurada</span>
              <button className="btn sm danger" onClick={() => void clearApiKey(activo.id)}>
                Eliminar clave guardada
              </button>
            </div>
          ) : (
            <p className="hint">
              No hay ninguna clave de {activo.nombre}. Consíguela en <code>{activo.donde}</code>.
            </p>
          )}

          <input
            type="password"
            placeholder={`Clave de ${activo.nombre}`}
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            autoComplete="off"
          />
          <button
            className="btn primary"
            disabled={clave.trim().length < 20}
            onClick={async () => { await saveApiKey(clave.trim(), activo.id); setClave(''); }}
          >
            Guardar clave en el backend
          </button>
          <p className="hint">
            La clave se envía al backend local y se guarda en <code>secrets.json</code>. No se devuelve nunca a la
            interfaz, no se escribe en la consola y no viaja al navegador en ninguna respuesta. También puedes usar
            la variable <code>{activo.variableEntorno}</code> del archivo <code>.env</code>.
          </p>
        </div>
      )}

      <div className="field">
        <label>Modelo</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            placeholder={activo.modeloPorDefecto || 'Elige uno de la lista'}
            value={modeloElegido}
            onChange={(e) => void saveSettings({
              modelos: { ...settings.modelos, [settings.proveedor]: e.target.value },
            })}
          />
          <button className="btn outline" onClick={() => void cargarModelos()} disabled={cargandoModelos || !listoParaUsar}>
            {cargandoModelos ? <span className="spinner" /> : <Icon name="refresh" size={13} />} Consultar
          </button>
        </div>
        {modelos.length > 0 && (
          <select
            value={modeloElegido}
            onChange={(e) => void saveSettings({
              modelos: { ...settings.modelos, [settings.proveedor]: e.target.value },
            })}
          >
            <option value="">{activo.modeloPorDefecto ? `(usar ${activo.modeloPorDefecto})` : '(ninguno elegido)'}</option>
            {modelos.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
        <p className="hint">
          {activo.local
            ? 'Son los modelos que ya has descargado con "ollama pull". Consultar te dice cuáles hay ahora mismo.'
            : 'Los identificadores cambian con el tiempo: usa "Consultar" para ver los que tu cuenta tiene disponibles ahora.'}
          {' '}Cada proveedor recuerda su propio modelo.
        </p>
      </div>

      <div className="field">
        <button className="btn outline" disabled={probando || !listoParaUsar} onClick={() => void probar()}>
          {probando ? <span className="spinner" /> : <Icon name="check" size={12} />} Probar la conexión
        </button>
        <p className="hint">
          Llama de verdad al servicio. Saber que «hay una clave» no garantiza que sirva.
        </p>

        {prueba && (
          <div className="review-banner" style={{ marginTop: 8, borderColor: prueba.ok ? 'var(--ok)' : 'var(--bad)' }}>
            {prueba.message}
            {prueba.source && prueba.source !== 'no hace falta' && (
              <div className="hint" style={{ marginTop: 4 }}>
                Origen de la clave en uso: <strong>{prueba.source}</strong>.
              </div>
            )}
            {prueba.source === 'variable del sistema' && (
              <div className="hint" style={{ marginTop: 4, color: 'var(--warn)' }}>
                Cuidado: esa clave no es de la aplicación, viene del entorno de tu equipo. Si guardas aquí la tuya,
                tendrá prioridad sobre ella.
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
