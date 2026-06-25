import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { SEMANTIC_NOTICE_VERSION } from './semanticNoticeVersion';

// GOTCHA: usar FieldValue del submódulo modular `firebase-admin/firestore`, NO
// `admin.firestore.FieldValue.serverTimestamp()`. Este último solo está poblado si
// el submódulo firestore ya fue cargado en el grafo de imports; en un TRIGGER con
// grafo magro queda `undefined` → TypeError en runtime (detectado en el emulador:
// la purga del mismo trigger escribía bien pero el serverTimestamp del log tiraba).

// SPEC consent server-authoritative — registro de evidencia del consentimiento de
// búsqueda semántica. Vive en la colección top-level DENY-ALL `consentLog/`
// (patrón userSecrets/allowlist/rateLimits/accessRequests): el cliente NUNCA la
// lee ni escribe; solo el Admin SDK (estas CFs) la toca. Dos piezas bajo el mismo
// prefijo, cubiertas por UNA regla deny-all (match /consentLog/{document=**}):
//
//  - `consentLog/{uid}`            → doc RESUMEN. El gate server-side lee de acá el
//                                    ack-proof (acknowledgedAt:number) NO forjable.
//  - `consentLog/{uid}/events/*`   → log APPEND-ONLY de cambios de estado
//                                    (activó/desactivó/reactivó + el reconocimiento).
//
// El `acknowledgedAt` del doc resumen lo sella SOLO el callable markSemanticConsent
// (primer cruce). Los eventos los escriben el callable (reconocimiento) y el trigger
// onSemanticConsentChanged (transiciones on/off). serverTimestamp() canónico en
// ambos: es evidencia, nada type-checkea ese campo (a diferencia del doc vivo, cuyo
// acknowledgedAt DEBE ser number para el modelo cliente).

export type SemanticConsentAction = 'acknowledged' | 'enabled' | 'disabled';

export function consentSummaryRef(uid: string): admin.firestore.DocumentReference {
  return admin.firestore().doc(`consentLog/${uid}`);
}

export function consentEventsRef(uid: string): admin.firestore.CollectionReference {
  return admin.firestore().collection(`consentLog/${uid}/events`);
}

// Append suelto de un cambio de estado on/off (lo usa el trigger). Un doc nuevo por
// transición → historial inmutable. NO toca el doc resumen: el acknowledgedAt solo
// lo escribe el callable, así D6 (re-activar sin re-reconocer) se mantiene.
export async function appendConsentStateEvent(
  uid: string,
  action: SemanticConsentAction,
): Promise<void> {
  await consentEventsRef(uid).add({
    uid,
    action,
    noticeVersion: SEMANTIC_NOTICE_VERSION,
    recordedAt: FieldValue.serverTimestamp(),
  });
}
