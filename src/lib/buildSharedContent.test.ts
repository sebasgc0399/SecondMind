import { describe, expect, it } from 'vitest';
import { buildSharedContent } from '@/lib/buildSharedContent';

describe('buildSharedContent', () => {
  it('decodifica entidades en el título de una URL compartida', () => {
    expect(
      buildSharedContent({ title: 'Hola &#34;mundo&#34; &amp; más', texts: ['https://a.com/x'] }),
    ).toEqual({ content: 'Hola "mundo" & más\nhttps://a.com/x', sourceUrl: 'https://a.com/x' });
  });

  it('no decodifica la URL: content y sourceUrl quedan crudos (E1-T4-a)', () => {
    const url = 'https://a.com/p?x=1&amp;y=2&#38;z=3';
    expect(buildSharedContent({ title: 'T', texts: [url] })).toEqual({
      content: `T\n${url}`,
      sourceUrl: url,
    });
  });

  it('URL sin título o con título igual a la URL: solo la URL', () => {
    expect(buildSharedContent({ title: '', texts: ['https://a.com'] })).toEqual({
      content: 'https://a.com',
      sourceUrl: 'https://a.com',
    });
    expect(buildSharedContent({ texts: ['https://a.com'] })).toEqual({
      content: 'https://a.com',
      sourceUrl: 'https://a.com',
    });
    expect(buildSharedContent({ title: 'https://a.com', texts: ['https://a.com'] })).toEqual({
      content: 'https://a.com',
      sourceUrl: 'https://a.com',
    });
  });

  it('texto que no es URL: decodifica y no manda sourceUrl', () => {
    const result = buildSharedContent({ title: 'ignorado', texts: ['  Dijo &quot;hola&quot;  '] });
    expect(result).toEqual({ content: 'Dijo "hola"' });
    expect(result).not.toHaveProperty('sourceUrl');
  });

  it('texto sin entidades queda idéntico (trim aparte)', () => {
    expect(buildSharedContent({ texts: ['nota simple & sin entidades'] })).toEqual({
      content: 'nota simple & sin entidades',
    });
  });

  it('sin texto devuelve null', () => {
    expect(buildSharedContent({ title: 'x', texts: [] })).toBeNull();
    expect(buildSharedContent({ title: 'x', texts: ['   '] })).toBeNull();
    expect(buildSharedContent({ title: 'x' })).toBeNull();
  });
});
