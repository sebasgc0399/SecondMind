/**
 * Formatea un nombre a title-case simple: capitaliza la primera letra de cada
 * palabra (separadas por espacio o guion) y pasa el resto a minúscula.
 *
 * El `displayName` que mostramos viene del IdP (Google) o es null (email/pw),
 * así que no lo controlamos al guardar — normalizamos al display. Title-case
 * simple por decisión de producto: cada palabra capitalizada, sin excepciones
 * para partículas ("de", "la", etc.).
 *
 * Idempotente. Devuelve '' para entradas nulas/vacías (el caller decide el
 * fallback con `|| 'Avatar'`, `|| user.email`, etc.).
 *
 * @example
 * formatName('sebastian gutierrez') // 'Sebastian Gutierrez'
 * formatName('MARIA DE LA CRUZ')     // 'Maria De La Cruz'
 * formatName('garcía-lópez')         // 'García-López'
 * formatName(null)                   // ''
 */
export function formatName(name: string | null | undefined): string {
  if (!name) return '';

  return name.trim().replace(/\s+/g, ' ').split(' ').map(capitalizeSegment).join(' ');
}

/** Capitaliza cada parte de un apellido compuesto con guion (garcía-lópez). */
function capitalizeSegment(segment: string): string {
  return segment.split('-').map(capitalizeWord).join('-');
}

function capitalizeWord(word: string): string {
  if (!word) return word;
  return word.slice(0, 1).toLocaleUpperCase('es') + word.slice(1).toLocaleLowerCase('es');
}
