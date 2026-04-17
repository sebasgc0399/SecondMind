import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase';

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

export async function fetchEmbedding(userId: string, noteId: string): Promise<number[] | null> {
  const snap = await getDoc(doc(db, `users/${userId}/embeddings/${noteId}`));
  if (!snap.exists()) return null;
  const data = snap.data();
  return Array.isArray(data.vector) ? (data.vector as number[]) : null;
}

export async function fetchAllEmbeddings(userId: string): Promise<Map<string, number[]>> {
  const snap = await getDocs(collection(db, `users/${userId}/embeddings`));
  const map = new Map<string, number[]>();
  snap.forEach((docSnap) => {
    const data = docSnap.data();
    if (Array.isArray(data.vector)) {
      map.set(docSnap.id, data.vector as number[]);
    }
  });
  return map;
}

// Cache module-level compartido entre useSimilarNotes y useHybridSearch.
// Se carga una sola vez por sesion; fetches concurrentes se deduplican via
// fetchPromise. Invalidado en logout o cuando cambia el uid.
let cachedUid: string | null = null;
let cachedEmbeddings: Map<string, number[]> | null = null;
let fetchPromise: Promise<Map<string, number[]>> | null = null;

export async function getEmbeddingsCache(userId: string): Promise<Map<string, number[]>> {
  if (cachedUid !== userId) {
    invalidateEmbeddingsCache();
    cachedUid = userId;
  }
  if (cachedEmbeddings) return cachedEmbeddings;
  if (fetchPromise) return fetchPromise;

  fetchPromise = fetchAllEmbeddings(userId).then((map) => {
    cachedEmbeddings = map;
    fetchPromise = null;
    return map;
  });
  return fetchPromise;
}

export function updateEmbeddingInCache(noteId: string, vector: number[]): void {
  if (cachedEmbeddings) {
    cachedEmbeddings.set(noteId, vector);
  }
}

export function invalidateEmbeddingsCache(): void {
  cachedUid = null;
  cachedEmbeddings = null;
  fetchPromise = null;
}

interface EmbedQueryResponse {
  vector: number[];
}

const embedQueryFn = httpsCallable<{ text: string }, EmbedQueryResponse>(functions, 'embedQuery');

export async function embedQueryText(text: string): Promise<number[]> {
  const result = await embedQueryFn({ text });
  return result.data.vector;
}
