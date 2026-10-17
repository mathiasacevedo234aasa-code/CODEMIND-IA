import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../state/useStore';
import { api, type Conversacion } from '../lib/api';
import { esFalloDelServicio, siguienteProveedor } from '../lib/respaldo';
import { Icon } from './Icon';

type Mode = 'comprehension' | 'context' | 'technical' | 'documentation';

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'comprehension', label: 'Comprension', hint: 'Preguntas sobre el codigo abierto o seleccionado. No lo modifica.' },
  { id: 'context', label: 'Contexto', hint: 'Objetivo, arquitectura, progreso y decisiones registradas del proyecto.' },
  { id: 'technical', label: 'Consulta tecnica', hint: 'Dudas generales de HTML, CSS, JavaScript, TypeScript y frameworks.' },
  { id: 'documentation', label: 'Documentacion', hint: 'Para documentar una funcion usa el boton del panel de funciones.' },
];

interface Message { who: 'user' | 'ai'; text: string; model?: string; escribiendo?: boolean }

export function AssistantPanel() {
  const project = useStore((s) => s.project);
  const files = useStore((s) => s.files);
  const settings = useStore((s) => s.settings);
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
  /** La última pregunta falló por el servicio y hay otro proveedor configurado. */
  const [reintento, setReintento] = useState<{ texto: string; contextoDirecto?: string; proveedor: string; nombre: string } | null>(null);

  // ------------------------------------------------- conversaciones guardadas
  //
  // Varias por proyecto, guardadas en el backend. La activa se guarda entera
  // cada vez que termina una respuesta; una conversación vacía no se guarda.
  const [conversaciones, setConversaciones] = useState<Conversacion[]>([]);
  const [convId, setConvId] = useState<string | null>(null);
  const [verLista, setVerLista] = useState(false);
  const [filtroConv, setFiltroConv] = useState('');
  const mensajesRef = useRef<Message[]>([]);
  mensajesRef.current = messages;
  const convIdRef = useRef<string | null>(null);
  convIdRef.current = convId;

  useEffect(() => {
    if (!project) return;
    setMessages([]);
    setConvId(null);
    api.conversaciones(project.id)
      .then(({ conversaciones: lista }) => {
        setConversaciones(lista);
        // Se retoma la última, que es casi siempre la que se quiere seguir.
        if (lista[0]) {
          setConvId(lista[0].id);
          setMessages(lista[0].mensajes);
        }
      })
      .catch(() => setConversaciones([]));
  }, [project?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const guardarConversacion = async () => {
    if (!project) return;
    const mensajes = mensajesRef.current.filter((m) => !m.escribiendo).map(({ who, text, model }) => ({ who, text, model }));
    if (!mensajes.length) return;
    try {
      const { conversacion } = await api.guardarConversacion(project.id, { id: convIdRef.current ?? undefined, mensajes });
      setConvId(conversacion.id);
      setConversaciones((l) => [conversacion, ...l.filter((c) => c.id !== conversacion.id)]);
    } catch (err) {
      setError(`No se pudo guardar la conversación: ${(err as Error).message}`);
    }
  };

  const nuevaConversacion = () => {
    if (busy) return;
    setMessages([]);
    setConvId(null);
    setVerLista(false);
  };

  const abrirConversacion = (c: Conversacion) => {
    if (busy) return;
    setConvId(c.id);
    setMessages(c.mensajes);
    setVerLista(false);
  };

  const borrarConversacion = async (c: Conversacion) => {
    if (!project || !window.confirm(`¿Borrar la conversación "${c.titulo}"? No se puede deshacer.`)) return;
    try {
      await api.borrarConversacion(project.id, c.id);
      setConversaciones((l) => l.filter((x) => x.id !== c.id));
      if (c.id === convId) { setMessages([]); setConvId(null); }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  // Se guarda cuando termina una respuesta (bien, cortada o con error). Desde
  // un efecto, para leer los mensajes ya pintados y no los de antes.
  const estabaOcupado = useRef(false);
  useEffect(() => {
    if (estabaOcupado.current && !busy) void guardarConversacion();
    estabaOcupado.current = busy;
  }, [busy]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtradas = useMemo(() => {
    const q = filtroConv.trim().toLowerCase();
    if (!q) return conversaciones;
    // Se busca en el título y en todo el texto: "lo que me dijo de calcularTotal".
    return conversaciones.filter((c) =>
      c.titulo.toLowerCase().includes(q) || c.mensajes.some((m) => m.text.toLowerCase().includes(q)));
  }, [conversaciones, filtroConv]);

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

  /** Lo que acompaña a la pregunta: inventario y archivo abierto, según el modo. */
  const construirContexto = () => {
    const parts: string[] = [];
    if (mode !== 'technical' && inventory) parts.push(inventory);
    if (includeFile && active && mode !== 'technical') {
      parts.push(`Archivo actualmente abierto (${active.path}):\n\`\`\`\n${active.content.slice(0, 12000)}\n\`\`\``);
    }
    return parts.join('\n\n');
  };

  /**
   * Tokens y coste ANTES de enviar.
   *
   * Es una estimación (unos 4 caracteres por token, más ~350 de las
   * instrucciones fijas): cada modelo trocea el texto a su manera y contar
   * exacto exigiría su tokenizador. El coste solo se enseña si el usuario
   * ha puesto el precio de su modelo; Ollama es local y no cuesta nada.
   */
  const estimacion = useMemo(() => {
    const previos = messages.slice(-8).reduce((n, m) => n + Math.min(m.text.length, 4000), 0);
    const entrada = Math.round((construirContexto().length + question.length + previos) / 4) + 350;
    const proveedor = settings.proveedor;
    const modelo = settings.modelos?.[proveedor] ?? '';
    const precio = settings.precios?.[`${proveedor}:${modelo}`];
    const salidaMax = settings.maxTokens;
    let coste: string | null = null;
    if (proveedor === 'ollama') coste = 'gratis (local)';
    else if (precio && (precio.entrada || precio.salida)) {
      const min = (entrada * precio.entrada) / 1e6;
      const max = min + (salidaMax * precio.salida) / 1e6;
      const f = (n: number) => (n < 0.01 ? n.toFixed(4) : n.toFixed(3));
      coste = `$${f(min)}–$${f(max)}`;
    }
    return { entrada, salidaMax, coste };
  }, [messages, question, mode, includeFile, active?.path, active?.content, inventory, settings]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Envia una consulta. `contextoDirecto` permite lanzarla desde fuera (por
   * ejemplo "explicar esta seleccion") sin depender del archivo abierto.
   */
  const enviar = async (texto: string, contextoDirecto?: string, proveedor?: string) => {
    if (!texto.trim() || busy) return;
    setReintento(null);
    // Lo anterior de esta conversación, para que las preguntas de seguimiento
    // tengan sentido. Se toma antes de añadir la pregunta nueva.
    const historial = mensajesRef.current.filter((m) => !m.escribiendo).map(({ who, text }) => ({ who, text }));
    setMessages((m) => [...m, { who: 'user', text: texto }]);
    setBusy(true);
    try {
      // Viene del editor con su propio contexto: no se mezcla con el archivo
      // abierto, que podría ser otro distinto del que el usuario seleccionó.
      const contextText = contextoDirecto ?? construirContexto();

      // La respuesta se va escribiendo según llega: el mensaje de la IA se
      // crea vacío y se le van añadiendo trozos. Esperar el texto entero hace
      // que veinte segundos se sientan como un minuto.
      const corte = new AbortController();
      cortarRef.current = corte;
      setMessages((m) => [...m, { who: 'ai', text: '', escribiendo: true }]);
      const anadir = (trozo: string) =>
        setMessages((m) => {
          const copia = m.slice();
          const ultimo = copia[copia.length - 1];
          copia[copia.length - 1] = { ...ultimo, text: ultimo.text + trozo };
          return copia;
        });

      const fin = await api.chatStream({
        projectId: project?.id,
        mode: contextoDirecto ? 'comprehension' : mode,
        question: texto,
        contextText,
        historial,
        proveedor,
      }, anadir, corte.signal);

      setMessages((m) => {
        const copia = m.slice();
        copia[copia.length - 1] = { ...copia[copia.length - 1], model: fin.model, escribiendo: false };
        return copia;
      });
    } catch (err) {
      const cancelado = (err as Error).name === 'AbortError';
      const otro = !cancelado && esFalloDelServicio((err as Error).message) ? siguienteProveedor(proveedor) : null;
      if (otro) setReintento({ texto, contextoDirecto, proveedor: otro.id, nombre: otro.nombre });
      else if (!cancelado) setError((err as Error).message);
      setMessages((m) => {
        const copia = m.slice();
        const ultimo = copia[copia.length - 1];
        // Si ya había llegado parte del texto, se conserva: tirarlo sería peor.
        if (ultimo?.who === 'ai' && ultimo.escribiendo) {
          copia[copia.length - 1] = {
            ...ultimo,
            escribiendo: false,
            text: ultimo.text
              ? `${ultimo.text}${cancelado ? '\n\n[detenido]' : `\n\n[se cortó: ${(err as Error).message}]`}`
              : cancelado ? '[detenido antes de empezar]' : `No se pudo obtener respuesta: ${(err as Error).message}`,
          };
          return copia;
        }
        return [...copia, { who: 'ai', text: `No se pudo obtener respuesta: ${(err as Error).message}` }];
      });
    } finally {
      cortarRef.current = null;
      setBusy(false);
    }
  };

  /** Detiene la respuesta en curso; lo que ya había llegado se queda. */
  const cortarRef = useRef<AbortController | null>(null);
  const detener = () => cortarRef.current?.abort();

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
      <div className="conv-barra">
        <button className="btn sm outline" onClick={() => setVerLista((v) => !v)} title="Conversaciones guardadas de este proyecto">
          <Icon name={verLista ? 'chevronDown' : 'chevronRight'} size={12} />
          <span className="conv-titulo">{conversaciones.find((c) => c.id === convId)?.titulo ?? 'Conversación nueva'}</span>
          {conversaciones.length > 0 && <span className="tag muted">{conversaciones.length}</span>}
        </button>
        <span style={{ flex: 1 }} />
        <button className="btn sm outline" disabled={busy} onClick={nuevaConversacion} title="Empezar otra conversación">
          <Icon name="plus" size={12} /> Nueva
        </button>
      </div>
      {verLista && (
        <div className="conv-lista">
          <input
            autoFocus
            placeholder="Buscar en las conversaciones..."
            value={filtroConv}
            onChange={(e) => setFiltroConv(e.target.value)}
          />
          {filtradas.length === 0 && <p className="hint">{conversaciones.length ? 'Ninguna coincide.' : 'Todavía no hay conversaciones guardadas.'}</p>}
          {filtradas.map((c) => (
            <div key={c.id} className={`conv-fila ${c.id === convId ? 'activa' : ''}`} onClick={() => abrirConversacion(c)}>
              <span className="conv-titulo">{c.titulo}</span>
              <span className="hint">{c.mensajes.length} · {new Date(c.actualizada).toLocaleDateString()}</span>
              <button
                className="btn icon sm"
                title="Borrar esta conversación"
                onClick={(e) => { e.stopPropagation(); void borrarConversacion(c); }}
              >
                <Icon name="close" size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
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
            <div className="who">{m.who === 'user' ? 'Tú' : `Asistente${m.model ? ` · ${m.model}` : ''}`}</div>
            {m.text || (m.escribiendo ? <span className="hint"><span className="spinner" /> Pensando...</span> : '')}
            {m.escribiendo && m.text && <span className="cursor-escribiendo" />}
          </div>
        ))}
        {reintento && !busy && (
          <div className="review-banner" style={{ margin: '0 0 8px' }}>
            Ese proveedor no respondió. Tienes {reintento.nombre} configurado: si quieres, la misma pregunta va allí
            (tu código se enviará a ese servicio).
            <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
              <button
                className="btn sm primary"
                onClick={() => {
                  const r = reintento;
                  // Fuera la pregunta y el fallo: enviar() las vuelve a poner.
                  setMessages((m) => m.slice(0, -2));
                  setReintento(null);
                  setTimeout(() => void enviar(r.texto, r.contextoDirecto, r.proveedor), 0);
                }}
              >
                Reintentar con {reintento.nombre}
              </button>
              <button className="btn sm outline" onClick={() => setReintento(null)}>No</button>
            </div>
          </div>
        )}
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
          placeholder={apiKeyConfigured ? 'Escribe tu pregunta...' : 'Configura el servicio de IA para usar el asistente'}
          value={question}
          disabled={!apiKeyConfigured}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send();
          }}
          style={{ minHeight: 60 }}
        />
        {question.trim() && (
          <p className="hint estimacion" title="Estimación: unos 4 caracteres por token. El coste usa el precio que pusiste para este modelo en Configuración.">
            ≈ {estimacion.entrada.toLocaleString()} tokens de entrada · hasta {estimacion.salidaMax.toLocaleString()} de respuesta
            {' · '}{estimacion.coste ?? 'sin precio configurado para este modelo'}
          </p>
        )}
        {busy ? (
          <button className="btn outline" onClick={detener} title="La parte que ya llegó se conserva">
            <span className="spinner" /> Detener
          </button>
        ) : (
        <button className="btn primary" onClick={send} disabled={!question.trim() || !apiKeyConfigured}>
          <Icon name="brain" size={13} /> Preguntar (Ctrl+Enter)
        </button>
        )}
      </div>
    </div>
  );
}
