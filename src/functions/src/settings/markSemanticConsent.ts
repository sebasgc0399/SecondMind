import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { requireVerified } from '../lib/requireVerified';
import { assertAllowlisted } from '../lib/assertAllowlisted';
import { sanitizeError } from '../lib/sanitizeError';
import { appError } from '../lib/appError';
import {
  SEMANTIC_NOTICE_VERSION,
  SEMANTIC_CONSENT_SCOPE,
  SEMANTIC_CONSENT_MECHANISM,
} from '../lib/semanticNoticeVersion';
import { consentSummaryRef, consentEventsRef } from '../lib/consentLog';

interface MarkSemanticConsentRequest {
  // Locale del aviso §7.1 que el usuario vio (lo sabe el cliente). Evidencia.
  locale: string;
  // Versión de la app que mostró el aviso (best-effort, getRunningVersion). Evidencia.
  appVersion?: string;
}

interface MarkSemanticConsentResponse {
  ok: true;
  acknowledgedAt: number;
}

// SPEC consent server-authoritative (Opción 3) — registra el reconocimiento
// afirmativo (§7.1) SERVER-SIDE. Reemplaza al setDoc client-side: el gate de egreso
// no puede confiar en nada client-writable, así que la PRUEBA del consentimiento la
// mintea el server en un doc deny-all que solo él lee.
//
// Molde deleteApiKey (Firestore-only, sin secret) + catch de saveApiKey (guard de
// HttpsError). requireVerified + assertAllowlisted ANTES del try (sus throws
// propagan directo). Un solo WriteBatch atómico:
//   (a) doc VIVO users/{uid}/settings/semanticSearch — { enabled:true, acknowledgedAt }.
//       acknowledgedAt es NUMBER (Date.now()), NO serverTimestamp(): el modelo
//       cliente es number|null y el gate del cliente lee este campo para D6.
//   (b) doc RESUMEN consentLog/{uid} (deny-all) — el ack-proof que el gate de egreso
//       lee. NO forjable (el cliente no puede escribir consentLog/). serverTimestamp.
//   (c) evento consentLog/{uid}/events/{autoId} — evidencia inmutable del cruce.
export const markSemanticConsent = onCall<
  MarkSemanticConsentRequest,
  Promise<MarkSemanticConsentResponse>
>(
  {
    timeoutSeconds: 10,
    region: 'us-central1',
  },
  async (request) => {
    const userId = requireVerified(request);
    await assertAllowlisted(request.auth?.token.email);

    const rawLocale = request.data?.locale;
    if (typeof rawLocale !== 'string' || !rawLocale.trim()) {
      throw appError(
        'mark-consent-invalid-locale',
        'invalid-argument',
        'Locale del aviso requerido',
      );
    }
    const locale = rawLocale.trim().slice(0, 16);
    const rawAppVersion = request.data?.appVersion;
    const appVersion =
      typeof rawAppVersion === 'string' && rawAppVersion.trim()
        ? rawAppVersion.trim().slice(0, 32)
        : null;

    try {
      const now = Date.now();
      const db = admin.firestore();
      const batch = db.batch();

      // (a) Doc VIVO — UX/D6. acknowledgedAt NUMBER (Date.now), NO serverTimestamp:
      // serverTimestamp resolvería a null en el snapshot optimista del cliente y el
      // modelo es number|null. Forjable pero inocuo: el gate NO lo usa como prueba.
      batch.set(
        db.doc(`users/${userId}/settings/semanticSearch`),
        { enabled: true, acknowledgedAt: now },
        { merge: true },
      );

      // (b) Doc RESUMEN deny-all — el ack-proof que el gate de egreso lee. NO
      // forjable. serverTimestamp() canónico (evidencia, nada type-checkea esto).
      batch.set(
        consentSummaryRef(userId),
        {
          uid: userId,
          acknowledgedAt: now,
          noticeVersion: SEMANTIC_NOTICE_VERSION,
          scope: SEMANTIC_CONSENT_SCOPE,
          mechanism: SEMANTIC_CONSENT_MECHANISM,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      // (c) Evento append-only — evidencia inmutable del reconocimiento. Sin
      // contenido de notas ni nada sensible: solo metadata del consentimiento.
      batch.set(consentEventsRef(userId).doc(), {
        uid: userId,
        action: 'acknowledged',
        noticeVersion: SEMANTIC_NOTICE_VERSION,
        scope: SEMANTIC_CONSENT_SCOPE,
        mechanism: SEMANTIC_CONSENT_MECHANISM,
        locale,
        appVersion,
        recordedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await batch.commit();

      logger.info('markSemanticConsent: ok', { userId, noticeVersion: SEMANTIC_NOTICE_VERSION });
      return { ok: true, acknowledgedAt: now };
    } catch (error) {
      // Re-lanzar HttpsError ya mapeados sin degradarlos a 'internal'.
      if (error instanceof HttpsError) throw error;
      const { code, message } = sanitizeError(error);
      logger.error('markSemanticConsent: failed', { userId, code, message });
      throw appError('mark-consent-failed', 'internal', 'No se pudo registrar el consentimiento');
    }
  },
);
