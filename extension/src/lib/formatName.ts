/**
 * Copia del util de la app (`src/lib/formatName.ts`) — fuente de verdad allá.
 * La extensión es un build Vite independiente sin alias `@/`, así que no puede
 * importar de la app raíz; duplicamos este util puro igual que `firebaseConfig`.
 * Mantener ambas copias en sync ante cambios de comportamiento.
 *
 * Formatea un nombre a title-case simple: capitaliza la primera letra de cada
 * palabra (separadas por espacio o guion) y pasa el resto a minúscula.
 * Idempotente. Devuelve '' para entradas nulas/vacías.
 */
export function formatName(name: string | null | undefined): string {
  if (!name) return '';

  return name.trim().replace(/\s+/g, ' ').split(' ').map(capitalizeSegment).join(' ');
}

function capitalizeSegment(segment: string): string {
  return segment.split('-').map(capitalizeWord).join('-');
}

function capitalizeWord(word: string): string {
  if (!word) return word;
  return word.slice(0, 1).toLocaleUpperCase('es') + word.slice(1).toLocaleLowerCase('es');
}
