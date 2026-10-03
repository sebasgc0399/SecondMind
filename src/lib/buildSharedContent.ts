import { decodeHtmlEntities } from '@/lib/decodeHtmlEntities';

export interface SharedEventLike {
  title?: string | null;
  texts?: string[] | null;
}

export interface SharedContent {
  content: string;
  sourceUrl?: string;
}

/**
 * Arma el contenido de Quick Capture a partir de un evento de share intent.
 * Devuelve null si no hay texto.
 *
 * Decodifica entidades HTML en el título (Chrome lo toma del `<title>` y llega
 * con `&#34;`) y en el texto cuando NO es una URL. Una URL compartida se deja
 * cruda (E1-T4-a): Chrome la manda sin escapar, y decodificarla podría alterar
 * una query legítima (`?a=1&amp;b=2` literal).
 */
export function buildSharedContent(event: SharedEventLike): SharedContent | null {
  const rawText = event.texts?.[0]?.trim() ?? '';
  if (!rawText) return null;
  if (/^https?:\/\//i.test(rawText)) {
    const title = decodeHtmlEntities(event.title ?? '').trim();
    const content = title && title !== rawText ? `${title}\n${rawText}` : rawText;
    return { content, sourceUrl: rawText };
  }
  return { content: decodeHtmlEntities(rawText) };
}
