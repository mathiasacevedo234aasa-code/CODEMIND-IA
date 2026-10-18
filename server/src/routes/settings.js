import { Router } from 'express';
import {
  readSettings,
  writeSettings,
  DEFAULT_SETTINGS,
  getApiKey,
  setStoredApiKey,
  clearStoredApiKey,
} from '../services/store.js';
import { descriptor, listaProveedores } from '../services/proveedores.js';

const router = Router();

/** Nunca devuelve la clave: solo si existe y de donde procede. */
router.get('/', async (_req, res, next) => {
  try {
    const settings = await readSettings();
    const proveedor = settings.proveedor || DEFAULT_SETTINGS.proveedor;
    // El estado de TODOS los proveedores, no solo el activo: asi la interfaz
    // puede decir cuales estan listos sin preguntar uno por uno.
    const claves = {};
    for (const p of listaProveedores()) {
      if (!p.necesitaClave) { claves[p.id] = { configured: true, source: 'no hace falta' }; continue; }
      const { key, source } = await getApiKey(p.id);
      claves[p.id] = { configured: Boolean(key), source };
    }
    const { key, source } = await getApiKey(proveedor);
    res.json({
      // La fusion tiene que entrar en "editor": con una superficial, unos
      // ajustes guardados antes de anadir una preferencia nueva la dejarian
      // sin valor, y la interfaz mostraria campos vacios.
      settings: { ...DEFAULT_SETTINGS, ...settings, editor: { ...DEFAULT_SETTINGS.editor, ...(settings.editor ?? {}) } },
      proveedores: listaProveedores(),
      defaultModel: descriptor(proveedor).modeloPorDefecto,
      apiKey: { configured: Boolean(key), source },
      claves,
    });
  } catch (err) {
    next(err);
  }
});

router.put('/', async (req, res, next) => {
  try {
    const current = await readSettings();
    const incoming = req.body?.settings ?? {};
    const next_ = {
      ...DEFAULT_SETTINGS,
      ...current,
      ...incoming,
      editor: { ...DEFAULT_SETTINGS.editor, ...(current.editor ?? {}), ...(incoming.editor ?? {}) },
    };
    if (typeof next_.temperature === 'number') next_.temperature = Math.min(2, Math.max(0, next_.temperature));
    if (typeof next_.maxTokens === 'number') next_.maxTokens = Math.min(8192, Math.max(256, Math.round(next_.maxTokens)));
    // Un proveedor desconocido dejaria la aplicacion sin poder llamar a nadie.
    descriptor(next_.proveedor);
    if (!['es', 'en'].includes(next_.idioma)) next_.idioma = 'es';
    // Modelo por tarea: un proveedor que no existe se descarta en vez de
    // dejar una tarea sin poder llamar a nadie.
    const porTarea = {};
    for (const [tarea, v] of Object.entries(next_.modelosPorTarea ?? {})) {
      if (!v?.proveedor) continue;
      try { descriptor(v.proveedor); porTarea[tarea] = { proveedor: v.proveedor, modelo: String(v.modelo ?? '').trim() }; } catch { /* se ignora */ }
    }
    next_.modelosPorTarea = porTarea;
    next_.limiteGasto = Math.max(0, Number(next_.limiteGasto) || 0);
    next_.prompts = (Array.isArray(next_.prompts) ? next_.prompts : [])
      .filter((p) => p?.nombre && p?.texto)
      .slice(0, 100)
      .map((p) => ({ nombre: String(p.nombre).slice(0, 80), texto: String(p.texto).slice(0, 4000) }));
    next_.modelos = { ...(current.modelos ?? {}), ...(incoming.modelos ?? {}) };
    await writeSettings(next_);
    res.json({ settings: next_ });
  } catch (err) {
    next(err);
  }
});

router.put('/api-key', async (req, res, next) => {
  try {
    const { apiKey: key, proveedor = 'groq' } = req.body ?? {};
    const p = descriptor(proveedor);
    if (!p.necesitaClave) {
      return res.status(400).json({ error: `${p.nombre} no usa ninguna API key.` });
    }
    if (typeof key !== 'string' || key.trim().length < 20) {
      return res.status(400).json({ error: 'La API key no tiene un formato valido.' });
    }
    await setStoredApiKey(proveedor, key.trim());
    res.json({ apiKey: { configured: true, source: 'guardada' }, proveedor });
  } catch (err) {
    next(err);
  }
});

router.delete('/api-key', async (req, res, next) => {
  try {
    const proveedor = req.query.proveedor || 'groq';
    descriptor(proveedor);
    await clearStoredApiKey(proveedor);
    const { key, source } = await getApiKey(proveedor);
    res.json({ apiKey: { configured: Boolean(key), source }, proveedor });
  } catch (err) {
    next(err);
  }
});

export default router;
