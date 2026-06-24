// Nombres de archivo unicos para el export de notas a Markdown (D3, SPEC-67).
// Cada nota se exporta como un `.md`; los nombres deben ser unicos y seguros
// para el filesystem, porque JSZip sobreescribe entradas homonimas en silencio.

export interface ExportNoteRef {
  id: string;
  title: string;
}

// Caracteres invalidos en nombres de archivo (Windows es el mas estricto):
// \ / : * ? " < > | . Los control chars se quitan aparte via \p{Cc}.
// El espacio y el guion SON validos en filenames (Obsidian) y se preservan.
const INVALID_FILENAME_CHARS = /[\\/:*?"<>|]/g;
const MAX_FILENAME_LENGTH = 120;

/**
 * Sanitiza un titulo para usarlo como nombre de archivo legible (NO un slug
 * lowercase-hyphenado: Obsidian/Logseq prefieren nombres con espacios y mayusculas
 * para que `[[Titulo]]` resuelva por nombre de archivo). Solo neutraliza lo que
 * rompe el filesystem. Devuelve '' si no queda nada utilizable.
 */
export function sanitizeTitleForFilename(title: string): string {
  return title
    .replace(INVALID_FILENAME_CHARS, ' ')
    .replace(/\p{Cc}/gu, ' ') // control chars (categoria Unicode Control)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_FILENAME_LENGTH)
    .replace(/[. ]+$/, '') // Windows no permite punto/espacio final
    .trim();
}

/**
 * Construye el mapa `noteId -> basename` (sin extension), garantizando unicidad
 * case-insensitive (Windows/macOS no distinguen mayusculas en nombres de archivo).
 * Colision de titulos -> sufijo con el noteId corto. Titulo vacio -> `Sin-titulo-<id>`.
 */
export function buildFilenameMap(notes: ExportNoteRef[]): Map<string, string> {
  const map = new Map<string, string>();
  const used = new Set<string>(); // basenames ya tomados, lowercased

  for (const note of notes) {
    const shortId = note.id.slice(0, 6);
    const base = sanitizeTitleForFilename(note.title ?? '') || `Sin-titulo-${shortId}`;

    let candidate = base;
    if (used.has(candidate.toLowerCase())) {
      candidate = `${base}-${shortId}`;
      // Colision residual (mismo titulo + mismo prefijo de id): extender el id.
      let n = 8;
      while (used.has(candidate.toLowerCase()) && n <= note.id.length) {
        candidate = `${base}-${note.id.slice(0, n)}`;
        n += 2;
      }
    }

    used.add(candidate.toLowerCase());
    map.set(note.id, candidate);
  }

  return map;
}
