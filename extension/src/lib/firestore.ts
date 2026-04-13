import { doc, setDoc } from 'firebase/firestore/lite';
import { db } from './firebaseConfig.ts';

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
  'dclid',
  'msclkid',
  'twclid',
  'igshid',
  'mc_cid',
  'mc_eid',
]);

function cleanUrl(raw: string): string {
  try {
    const url = new URL(raw);
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key) || key.startsWith('utm_')) {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return raw;
  }
}

interface InboxItemData {
  rawContent: string;
  sourceUrl: string;
  sourceTitle: string;
}

export async function saveToInbox(userId: string, data: InboxItemData): Promise<void> {
  const itemId = crypto.randomUUID();
  await setDoc(
    doc(db, 'users', userId, 'inbox', itemId),
    {
      id: itemId,
      rawContent: data.rawContent,
      source: 'web-clip',
      sourceUrl: cleanUrl(data.sourceUrl),
      sourceTitle: data.sourceTitle,
      status: 'pending',
      aiProcessed: false,
      createdAt: Date.now(),
    },
    { merge: true },
  );
}
