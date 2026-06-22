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
export { checkMyAccess } from './auth/checkMyAccess';
export { submitAccessRequest } from './access/submitAccessRequest';
export { listAccessRequests } from './access/listAccessRequests';
export { processAccessRequest } from './access/processAccessRequest';
export { listAllowlistMembers } from './access/listAllowlistMembers';
export { revokeAccess } from './access/revokeAccess';
export { deleteAccount } from './account/deleteAccount';
export { sendVerificationEmail } from './email/sendVerificationEmail';
export { sendResetEmail } from './email/sendResetEmail';
