import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';

// v1 Auth triggers (deprecated path pero funcional en firebase-functions v7.2.5).
// v2 `beforeUserCreated` requeriría upgrade a Identity Platform (pago) — no
// justificado para single-user beta. Race aceptada y documentada en SPEC F6.
// Path canónico de bypass de TinyBase para counter global, ver
// `src/hooks/useSignupCapacity.ts`.

const APP_CONFIG_PATH = 'config/app';

export const onUserCreated = functions
  .region('us-central1')
  .auth.user()
  .onCreate(async (user) => {
    logger.info('User created, incrementing config/app.userCount', { uid: user.uid });
    await admin
      .firestore()
      .doc(APP_CONFIG_PATH)
      .set({ userCount: admin.firestore.FieldValue.increment(1) }, { merge: true });
  });

export const onUserDeleted = functions
  .region('us-central1')
  .auth.user()
  .onDelete(async (user) => {
    logger.info('User deleted, decrementing config/app.userCount', { uid: user.uid });
    await admin
      .firestore()
      .doc(APP_CONFIG_PATH)
      .set({ userCount: admin.firestore.FieldValue.increment(-1) }, { merge: true });
  });
