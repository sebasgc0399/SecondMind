import { doc, setDoc } from 'firebase/firestore/lite';
import { db } from './firebaseConfig.ts';

interface InboxItemData {
  rawContent: string;
  sourceUrl: string;
}

export async function saveToInbox(userId: string, data: InboxItemData): Promise<void> {
  const itemId = crypto.randomUUID();
  await setDoc(
    doc(db, 'users', userId, 'inbox', itemId),
    {
      id: itemId,
      rawContent: data.rawContent,
      source: 'web-clip',
      sourceUrl: data.sourceUrl,
      status: 'pending',
      aiProcessed: false,
      createdAt: Date.now(),
    },
    { merge: true },
  );
}
