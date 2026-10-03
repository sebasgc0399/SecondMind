const NAMED_ENTITIES: Record<string, string> = {
  quot: '"',
  amp: '&',
  lt: '<',
  gt: '>',
  apos: "'",
  nbsp: ' ',
};

const MAX_CODE_POINT = 0x10ffff;

/**
 * Decodifica entidades HTML comunes (numéricas decimales/hex y las nombradas
 * `quot amp lt gt apos nbsp`) en UNA sola pasada: `&amp;#34;` -> `&#34;`.
 * Sin `DOMParser` (los tests corren en node). Entidades inválidas o fuera de
 * rango (`&#0;`, `&#xFFFFFFFF;`, `&foo;`) quedan tal cual.
 *
 * @example
 * decodeHtmlEntities('Hola &#34;mundo&#34;') // 'Hola "mundo"'
 */
export function decodeHtmlEntities(input: string): string {
  return input.replace(
    /&(?:#(\d{1,8})|#[xX]([0-9a-fA-F]{1,8})|([a-zA-Z]+));/g,
    (match, dec, hex, name) => {
      if (name !== undefined) {
        return NAMED_ENTITIES[name] ?? match;
      }
      const codePoint = dec !== undefined ? parseInt(dec, 10) : parseInt(hex, 16);
      if (codePoint === 0 || codePoint > MAX_CODE_POINT) return match;
      // Surrogates sueltos no son caracteres válidos.
      if (codePoint >= 0xd800 && codePoint <= 0xdfff) return match;
      return String.fromCodePoint(codePoint);
    },
  );
}
