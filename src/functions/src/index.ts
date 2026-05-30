import * as admin from 'firebase-admin';

admin.initializeApp();

export { processInboxItem } from './inbox/processInboxItem';
export { autoTagNote } from './notes/autoTagNote';
export { onNoteDeleted } from './notes/onNoteDeleted';
export { autoPurgeTrash } from './notes/autoPurgeTrash';
export { generateEmbedding } from './embeddings/generateEmbedding';
export { embedQuery } from './search/embedQuery';
export { saveApiKey } from './settings/saveApiKey';
export { deleteApiKey } from './settings/deleteApiKey';
export { checkAllowlist } from './auth/checkAllowlist';
export { onUserCreated, onUserDeleted } from './auth/userCountTriggers';
