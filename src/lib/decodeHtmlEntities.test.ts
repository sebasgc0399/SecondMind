import { describe, expect, it } from 'vitest';
import { decodeHtmlEntities } from '@/lib/decodeHtmlEntities';

describe('decodeHtmlEntities', () => {
  it('decodifica numéricas decimales', () => {
    expect(decodeHtmlEntities('Hola &#34;mundo&#34;')).toBe('Hola "mundo"');
    expect(decodeHtmlEntities('it&#39;s')).toBe("it's");
  });

  it('decodifica hex en minúscula y mayúscula', () => {
    expect(decodeHtmlEntities('&#x22;a&#X22;')).toBe('"a"');
    expect(decodeHtmlEntities('&#x1F600;')).toBe('\u{1F600}');
  });

  it('decodifica las nombradas', () => {
    expect(decodeHtmlEntities('&quot;a&quot; &amp; &lt;b&gt; &apos;c&apos;')).toBe(
      '"a" & <b> \'c\'',
    );
    expect(decodeHtmlEntities('a&nbsp;b')).toBe('a b');
  });

  it('decodifica una sola pasada (no recursivo)', () => {
    expect(decodeHtmlEntities('&amp;#34;')).toBe('&#34;');
    expect(decodeHtmlEntities('&amp;amp;')).toBe('&amp;');
  });

  it('deja intactas las entidades inválidas o fuera de rango', () => {
    for (const s of [
      '&#0;',
      '&#xFFFFFFFF;',
      '&#1114112;',
      '&#xD800;',
      '&foo;',
      '&amp',
      '&#;',
      '&#xZZ;',
    ]) {
      expect(decodeHtmlEntities(s)).toBe(s);
    }
  });

  it('es identidad sin entidades', () => {
    for (const s of ['', 'Hola mundo', 'a & b < c', 'AT&T; cosa', 'áéí ñ 日本 😀']) {
      expect(decodeHtmlEntities(s)).toBe(s);
    }
  });
});
