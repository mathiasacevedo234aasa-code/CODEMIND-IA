import { Router } from 'express';
import {
  readSettings,
  writeSettings,
  DEFAULT_SETTINGS,
  getApiKey,
  setStoredApiKey,
  clearStoredApiKey,
} from '../services/store.js';
import { DEFAULT_MODEL } from '../env.js';

const router = Router();

/** Nunca devuelve la clave: solo si existe y de donde procede. */
router.get('/', async (_req, res, next) => {
  try {
    const settings = await readSettings();
    const { key, source } = await getApiKey();
    res.json({
      // La fusion tiene que entrar en "editor": con una superficial, unos
      // ajustes guardados antes de anadir una preferencia nueva la dejarian
      // sin valor, y la interfaz mostraria campos vacios.
      settings: { ...DEFAULT_SETTINGS, ...settings, editor: { ...DEFAULT_SETTINGS.editor, ...(settings.editor ?? {}) } },
      defaultModel: DEFAULT_MODEL,
      apiKey: { configured: Boolean(key), source },
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
    await writeSettings(next_);
    res.json({ settings: next_ });
  } catch (err) {
    next(err);
  }
});

router.put('/api-key', async (req, res, next) => {
  try {
    const key = req.body?.apiKey;
    if (typeof key !== 'string' || key.trim().length < 20) {
      return res.status(400).json({ error: 'La API key no tiene un formato valido.' });
    }
    await setStoredApiKey(key.trim());
    res.json({ apiKey: { configured: true, source: 'stored' } });
  } catch (err) {
    next(err);
  }
});

router.delete('/api-key', async (_req, res, next) => {
  try {
    await clearStoredApiKey();
    const { key, source } = await getApiKey();
    res.json({ apiKey: { configured: Boolean(key), source } });
  } catch (err) {
    next(err);
  }
});

export default router;
