import * as admin from 'firebase-admin';

admin.initializeApp();

export { processInboxItem } from './inbox/processInboxItem';
