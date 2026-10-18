/** Qué archivos se ven (no se editan) dentro del editor. */
const TIPOS: Record<string, 'imagen' | 'pdf' | 'fuente' | 'video' | 'audio'> = {
  png: 'imagen', jpg: 'imagen', jpeg: 'imagen', gif: 'imagen', webp: 'imagen', svg: 'imagen', ico: 'imagen', bmp: 'imagen', avif: 'imagen',
  pdf: 'pdf',
  woff: 'fuente', woff2: 'fuente', ttf: 'fuente', otf: 'fuente',
  mp4: 'video', webm: 'video',
  mp3: 'audio', wav: 'audio', ogg: 'audio',
};

export const tipoMedio = (ruta: string) => TIPOS[ruta.split('.').pop()?.toLowerCase() ?? ''] ?? null;
export const urlRaw = (projectId: string, ruta: string) => `/api/projects/${projectId}/raw?path=${encodeURIComponent(ruta)}`;
