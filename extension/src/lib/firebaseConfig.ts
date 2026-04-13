import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth/web-extension';
import { getFirestore } from 'firebase/firestore/lite';

const app = initializeApp({
  apiKey: 'AIzaSyDDrCcSzwQl-2ZTbmzKqDEhtpsAzexDoHo',
  authDomain: 'secondmindv1.firebaseapp.com',
  projectId: 'secondmindv1',
  storageBucket: 'secondmindv1.firebasestorage.app',
  messagingSenderId: '39583209123',
  appId: '1:39583209123:web:86566646c1ca19af7f5116',
});

export const auth = getAuth(app);
export const db = getFirestore(app);
