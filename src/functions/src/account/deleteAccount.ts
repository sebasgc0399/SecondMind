import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getFirestore, FieldPath } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { appError } from '../lib/appError';
import { sanitizeError } from '../lib/sanitizeError';
import { isReauthExpired } from './reauthGate';

// SPEC-64 F1 — Borrado de cuenta TOTAL e irreversible (self-service).
//
// SELF-SERVICE, NO admin-only: el único gate de autorización es auth + reauth
// reciente (D3). NO usar requireAdmin/adminEmail — copiar eso del molde
// revokeAccess.ts rechazaría a todo usuario normal. El callable es obligatorio
// porque userSecrets/ es deny-all al cliente: solo el Admin SDK puede borrar el
// ciphertext de la key BYOK (bypassa las security rules).
//
// Wipe idempotente y re-ejecutable (puede fallar a mitad y re-correrse): cada
// paso es delete/recursiveDelete (no-op sobre lo ya borrado). NO es
// transaccional (cruza Firestore + Auth); la estrategia es idempotencia +
// reintento del usuario, no rollback. admin.auth().deleteUser ÚLTIMO: si un
// paso previo falla, el token sigue válido para reintentar; borrar Auth revoca
// el token (cierra sesión de facto).
//
// CAVEAT del reintento (documentado en el SPEC): si W6 falla DESPUÉS de W3, el
// allowlist/{email} ya se borró → el gate de la app rechaza el login → el usuario
// NO puede auto-reintentar. La recuperación ahí es por SOPORTE (borrar el Auth
// huérfano a mano), no auto-servicio. Por eso W6 reintenta ante errores
// transitorios: minimiza dejar el email (PII) huérfano en Auth.
//
// D7: recursiveDelete(users/{uid}) dispara onNoteDeleted por nota — redundante
// pero idempotente (queries dan sets vacíos), asíncrono y fuera del path
// crítico (el callable retorna apenas recursiveDelete completa). Se deja correr
// en v1.

const BATCH_LIMIT = 500; // límite de ops por WriteBatch (Firestore)
// Cota superior (exclusiva) del range query de rateLimits sobre documentId(): U+FFFF
// cubre todo el sufijo tras "{uid}__". String.fromCharCode evita un char no-ASCII literal.
const UID_RANGE_END = String.fromCharCode(0xffff);
const DELETE_USER_MAX_ATTEMPTS = 3; // W6: reintentos ante error transitorio de Auth

// Handler exportado SEPARADO del wrapper onCall para poder invocarlo directo en
// tests con un CallableRequest fabricado: el camino de RECHAZO del gate de reauth
// (auth_time viejo → reauth-required, SIN tocar Firestore) no es reproducible por
// wire porque el Auth emulator solo emite tokens frescos.
export async function deleteAccountHandler(request: CallableRequest<void>): Promise<{ ok: true }> {
  // P0 — auth (self-service). NO requireAdmin, NO secret de admin.
  if (!request.auth) {
    throw appError('delete-account-unauthenticated', 'unauthenticated', 'Login requerido');
  }
  const { uid, token } = request.auth;
  const rawEmail = typeof token.email === 'string' ? token.email : undefined;
  const email = rawEmail?.trim().toLowerCase();

  // P1 — gate de reauth server-enforced. auth_time es number (Unix seconds) en el
  // token decodificado del Admin SDK. Sin reauth reciente: rechaza ANTES de cualquier
  // I/O (nada se borra). El cliente debe forzar getIdToken(true) tras reautenticar
  // para que el auth_time fresco viaje en el token (si no, rechazo espurio).
  const authTime = Number(token.auth_time);
  if (isReauthExpired(authTime, Date.now())) {
    throw appError('reauth-required', 'failed-precondition', 'Reautenticación requerida');
  }

  const db = getFirestore();

  try {
    // W1 — users/{uid}/** completo. users/{uid} es un DOC FANTASMA (no existe como
    // documento, solo cuelga subcolecciones); recursiveDelete borra los hijos igual.
    // Es el paso más caro → motiva timeoutSeconds: 300.
    await db.recursiveDelete(db.doc(`users/${uid}`));

    // W2 — userSecrets/{uid}/** (ciphertext de la key BYOK).
    await db.recursiveDelete(db.doc(`userSecrets/${uid}`));

    // W3/W4 — allowlist + accessRequests (keys = email normalizado).
    // Guard: si el token no trae email, saltar (evita borrar allowlist/undefined).
    if (email) {
      await db.collection('allowlist').doc(email).delete();
      await db.collection('accessRequests').doc(email).delete();
    }

    // W5 — rateLimits/ del uid. Sin campo uid: el uid va embebido en el docId
    // (`{uid}__{key}__{window}__{slot}`), así que se borra por range query sobre
    // documentId() (FieldPath, no FieldValue); la cota superior UID_RANGE_END
    // (U+FFFF) cubre todo el espacio de docIds del uid.
    //
    // SEGURIDAD DEL BOUND (suposición explícita): que el rango `[uid__ … uid__ + U+FFFF)`
    // NO barra rateLimits de otro usuario depende de que los UIDs de Firebase Auth sean
    // longitud-fija (28 chars) alfanuméricos SIN underscore → ningún uid es prefijo de
    // otro, y el char inmediato tras `{uid}` nunca es `_`. Si alguna vez se introducen
    // custom UIDs (con `_`, o longitud variable), este bound podría capturar docs de
    // OTRO uid y borrarlos en silencio. Revisar este query ANTES de habilitar custom UIDs.
    const rateLimitsSnap = await db
      .collection('rateLimits')
      .where(FieldPath.documentId(), '>=', `${uid}__`)
      .where(FieldPath.documentId(), '<', `${uid}__${UID_RANGE_END}`)
      .get();
    for (let i = 0; i < rateLimitsSnap.docs.length; i += BATCH_LIMIT) {
      const batch = db.batch();
      rateLimitsSnap.docs.slice(i, i + BATCH_LIMIT).forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }

    // W6 — Auth user, ÚLTIMO. Retry ante errores transitorios (hasta 3 intentos): un
    // huérfano dejaría el EMAIL en Auth —la PII que el borrado total promete eliminar—,
    // así que vale reintentar ante un blip transitorio antes de rendirse con
    // delete-account-failed. deleteUser es idempotente; `user-not-found` = éxito
    // idempotente (ya borrado en un intento previo): el efecto deseado ya ocurrió.
    let lastAuthError: unknown;
    for (let attempt = 1; attempt <= DELETE_USER_MAX_ATTEMPTS; attempt++) {
      try {
        await getAuth().deleteUser(uid);
        lastAuthError = undefined;
        break;
      } catch (authError) {
        if ((authError as { code?: string })?.code === 'auth/user-not-found') {
          lastAuthError = undefined;
          break;
        }
        lastAuthError = authError;
        if (attempt < DELETE_USER_MAX_ATTEMPTS) {
          // Backoff lineal corto (300ms, 600ms) entre reintentos transitorios.
          await new Promise((resolve) => {
            setTimeout(resolve, 300 * attempt);
          });
        }
      }
    }
    if (lastAuthError) throw lastAuthError;

    logger.info('deleteAccount: ok', { uid, rateLimitsDeleted: rateLimitsSnap.size });
    return { ok: true };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    const { code, message } = sanitizeError(error);
    logger.error('deleteAccount: failed', { uid, code, message });
    throw appError('delete-account-failed', 'internal', 'No se pudo borrar la cuenta');
  }
}

export const deleteAccount = onCall<void, Promise<{ ok: true }>>(
  {
    timeoutSeconds: 300, // recursiveDelete de cuentas grandes puede tardar
    region: 'us-central1',
    maxInstances: 3, // acota borrados de cuenta concurrentes (NO la tormenta D7)
  },
  deleteAccountHandler,
);
