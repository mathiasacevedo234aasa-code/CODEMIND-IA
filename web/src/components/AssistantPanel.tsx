import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../state/useStore';
import { api } from '../lib/api';
import { Icon } from './Icon';

type Mode = 'comprehension' | 'context' | 'technical' | 'documentation';

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'comprehension', label: 'Comprension', hint: 'Preguntas sobre el codigo abierto o seleccionado. No lo modifica.' },
  { id: 'context', label: 'Contexto', hint: 'Objetivo, arquitectura, progreso y decisiones registradas del proyecto.' },
  { id: 'technical', label: 'Consulta tecnica', hint: 'Dudas generales de HTML, CSS, JavaScript, TypeScript y frameworks.' },
  { id: 'documentation', label: 'Documentacion', hint: 'Para documentar una funcion usa el boton del panel de funciones.' },
];

interface Message { who: 'user' | 'ai'; text: string; model?: string }

export function AssistantPanel() {
  const project = useStore((s) => s.project);
  const files = useStore((s) => s.files);
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const apiKeyConfigured = useStore((s) => s.apiKeyConfigured);
  const setError = useStore((s) => s.setError);
  const symbolsFn = useStore((s) => s.symbols);
  const analysis = useStore((s) => s.analysis);
  const sources = useStore((s) => s.sources);
  const statusOf = useStore((s) => s.statusOf);
  const pendingAsk = useStore((s) => s.pendingAsk);
  const clearPendingAsk = useStore((s) => s.clearPendingAsk);

  const [mode, setMode] = useState<Mode>('comprehension');
  const [includeFile, setIncludeFile] = useState(true);
  /** Archivos extra que el usuario quiere que la IA tenga delante. */
  const [extras, setExtras] = useState<Set<string>>(new Set());
  const [eligiendoArchivos, setEligiendoArchivos] = useState(false);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);

  // Solo se ofrece como contexto el archivo de codigo abierto, no una pestana web.
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activePath = activeTab?.kind === 'file' ? activeTab.path : null;
  const active = activePath ? { path: activePath, content: files[activePath]?.content ?? '' } : undefined;

  /**
   * Inventario real de funciones detectadas con su estado de documentacion.
   * Sin esto el asistente no puede responder "que me falta por documentar"
   * sin inventarselo, y preferimos darle hechos antes que dejarle suponer.
   */
  const inventory = useMemo(() => {
    const list = symbolsFn();
    if (!list.length) return '';
    const lines = list.map((f) => `- ${f.qualifiedName} (${f.filePath}:${f.line}, ${f.kind}) — ${statusOf(f)}`);
    return `Funciones detectadas en el codigo actual (${list.length}), con su estado de documentacion:\n${lines.join('\n')}`;
  }, [symbolsFn, analysis, statusOf]);

  /**
   * Envia una consulta. `contextoDirecto` permite lanzarla desde fuera (por
   * ejemplo "explicar esta seleccion") sin depender del archivo abierto.
   */
  const enviar = async (texto: string, contextoDirecto?: string) => {
    if (!texto.trim() || busy) return;
    setMessages((m) => [...m, { who: 'user', text: texto }]);
    setBusy(true);
    try {
      const parts: string[] = [];
      if (contextoDirecto) {
        // Viene del editor con su propio contexto: no se mezcla con el archivo
        // abierto, que podría ser otro distinto del que el usuario seleccionó.
        parts.push(contextoDirecto);
      } else {
        if (mode !== 'technical' && inventory) parts.push(inventory);
        if (includeFile && active && mode !== 'technical') {
          parts.push(`Archivo actualmente abierto (${active.path}):\n\`\`\`\n${active.content.slice(0, 12000)}\n\`\`\``);
        }
      }
      const contextText = parts.join('\n\n');
      const res = await api.chat({
        projectId: project?.id,
        mode: contextoDirecto ? 'comprehension' : mode,
        question: texto,
        contextText,
      });
      setMessages((m) => [...m, { who: 'ai', text: res.answer, model: res.model }]);
    } catch (err) {
      setError((err as Error).message);
      setMessages((m) => [...m, { who: 'ai', text: `No se pudo obtener respuesta: ${(err as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  };

  const send = () => {
    const texto = question.trim();
    setQuestion('');
    void enviar(texto);
  };

  // Peticiones que llegan desde el editor ("explicar esta seleccion").
  const atendiendo = useRef(false);
  useEffect(() => {
    if (!pendingAsk || atendiendo.current) return;
    atendiendo.current = true;
    const { question: q, contextText } = pendingAsk;
    clearPendingAsk();
    void enviar(q, contextText).finally(() => { atendiendo.current = false; });
    // enviar depende de estado que cambia en cada pulsacion; solo interesa
    // reaccionar a la llegada de una peticion nueva.
  }, [pendingAsk]); // eslint-disable-line react-hooks/exhaustive-deps

  const chatRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const box = chatRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [messages, busy]);

  return (
    <div className="chat">
      <div className="chat-log" ref={chatRef}>
        {messages.length === 0 && (
          <div className="empty" style={{ height: 'auto', paddingTop: 30 }}>
            <Icon name="brain" size={22} />
            <h3>Asistente de CodeMind</h3>
            <p>
              Pregunta por tu propio codigo o por el estado del proyecto. El asistente explica y documenta;
              no corrige, no reescribe y no toca tus archivos.
            </p>
            <p className="hint">
              Ejemplos: "Que estoy construyendo en este proyecto?", "Para que sirve calcularTotal?",
              "Que funciones me faltan por documentar?"
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.who}`}>
            <div className="who">{m.who === 'user' ? 'Tu' : `Asistente${m.model ? ` · ${m.model}` : ''}`}</div>
            {m.text}
          </div>
        ))}
        {busy && <div className="msg ai"><span className="spinner" /> Consultando a Groq...</div>}
      </div>

      <div className="chat-input">
        <div className="mode-row">
          {MODES.map((m) => (
            <button
              key={m.id}
              className={`mode-chip ${mode === m.id ? 'active' : ''}`}
              onClick={() => setMode(m.id)}
              title={m.hint}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="hint">{MODES.find((m) => m.id === mode)?.hint}</p>
        {mode !== 'technical' && (
          <div className="extras-box">
            <button className="btn sm outline" onClick={() => setEligiendoArchivos((v) => !v)}>
              <Icon name="file" size={12} /> Añadir archivos al contexto
              {extras.size > 0 && <span className="tag info">{extras.size}</span>}
            </button>
            {eligiendoArchivos && (
              <div className="extras-lista">
                {Object.keys(sources).sort().map((ruta) => (
                  <label key={ruta} className="extras-item" title={ruta}>
                    <input
                      type="checkbox"
                      checked={extras.has(ruta)}
                      onChange={(e) => {
                        setExtras((previo) => {
                          const siguiente = new Set(previo);
                          if (e.target.checked) siguiente.add(ruta);
                          else siguiente.delete(ruta);
                          return siguiente;
                        });
                      }}
                    />
                    <span>{ruta}</span>
                  </label>
                ))}
                {Object.keys(sources).length === 0 && <p className="hint">Todavía no se ha analizado ningún archivo.</p>}
              </div>
            )}
          </div>
        )}
        {active && mode !== 'technical' && (
          <label className="hint" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={includeFile}
              onChange={(e) => setIncludeFile(e.target.checked)}
            />
            Enviar el contenido de {active.path} como contexto
          </label>
        )}
        <textarea
          placeholder={apiKeyConfigured ? 'Escribe tu pregunta...' : 'Configura la API key de Groq para usar el asistente'}
          value={question}
          disabled={!apiKeyConfigured}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send();
          }}
          style={{ minHeight: 60 }}
        />
        <button className="btn primary" onClick={send} disabled={busy || !question.trim() || !apiKeyConfigured}>
          {busy ? <span className="spinner" /> : <Icon name="brain" size={13} />} Preguntar (Ctrl+Enter)
        </button>
      </div>
    </div>
  );
}
