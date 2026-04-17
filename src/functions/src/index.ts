import * as admin from 'firebase-admin';

admin.initializeApp();

export { processInboxItem } from './inbox/processInboxItem';
export { autoTagNote } from './notes/autoTagNote';
export { generateEmbedding } from './embeddings/generateEmbedding';
export { embedQuery } from './search/embedQuery';
