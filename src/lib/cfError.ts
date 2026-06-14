import type { TFunction } from 'i18next';

// SPEC-58 F3.2 — mapeador único de errores de Cloud Functions callables a copy
// localizado. Lee el SLUG de err.details.code (lo pone appError server-side) con
// fallback a err.code (grpc del SDK, o shapes sin details). El switch usa keys
// LITERALES de errors.* con su defaultValue (copy es) inline → el extractor i18next
// las ve como literales (no se purgan en F4) y siembra el copy. Convive con
// authErrors.ts (mapAuthError/mapActionError), que maneja auth/* del SDK + los 2
// sintéticos de useAuth: esos NO pasan por acá. Cualquier slug desconocido o
// ausente cae a errors.default — nunca una key cruda en pantalla.
export interface CfErrorDetails {
  code?: string;
  maxUsers?: number;
  current?: number;
}

export function mapCfError(err: unknown, t: TFunction): string {
  const e = err as { code?: string; details?: CfErrorDetails } | null;
  const code = e?.details?.code ?? e?.code;
  switch (code) {
    case 'beta-full': {
      const max = e?.details?.maxUsers;
      return max != null
        ? t(
            'errors.betaFull',
            'Beta llena ({{max}}). Subí el límite o revocá un miembro antes de aprobar.',
            { max },
          )
        : t(
            'errors.betaFullNoMax',
            'Beta llena. Subí el límite o revocá un miembro antes de aprobar.',
          );
    }
    case 'beta-unauthorized':
      return t(
        'errors.betaUnauthorized',
        'Tu cuenta todavía no tiene acceso a la beta. Podés solicitarlo más abajo.',
      );
    case 'rate-limited':
      return t('errors.rateLimited', 'Demasiados intentos. Probá de nuevo más tarde.');
    case 'admin-unauthenticated':
    case 'verified-unauthenticated':
    case 'check-access-unauthenticated':
      return t('errors.unauthenticated', 'Tenés que iniciar sesión.');
    case 'admin-unauthorized':
      return t('errors.adminUnauthorized', 'No autorizado.');
    case 'email-unverified':
      return t('errors.emailUnverified', 'Verificá tu email para continuar.');
    case 'access-request-not-found':
    case 'access-request-not-found-approve':
      return t('errors.requestNotFound', 'Solicitud no encontrada.');
    case 'access-request-invalid-id':
    case 'access-request-invalid-action':
    case 'revoke-access-invalid-email':
      return t('errors.invalidInput', 'Datos inválidos. Probá de nuevo.');
    case 'submit-access-request-invalid-email':
    case 'submit-access-request-invalid-email-format':
      return t('errors.submitInvalidEmail', 'Revisá el email ingresado.');
    case 'submit-access-request-invalid-motivo-type':
    case 'submit-access-request-motivo-too-long':
      return t('errors.submitInvalidMotivo', 'El motivo no es válido.');
    case 'save-key-invalid':
      return t('errors.saveKeyInvalid', 'La API key es inválida.');
    case 'save-key-required':
      return t('errors.saveKeyRequired', 'La API key es requerida.');
    case 'save-key-invalid-provider':
    case 'delete-key-invalid-provider':
      return t('errors.invalidProvider', 'Proveedor no soportado.');
    case 'save-key-validation-unavailable':
      return t(
        'errors.saveKeyUnavailable',
        'No pudimos validar la key ahora. Probá de nuevo en un momento.',
      );
    case 'process-access-request-failed':
    case 'revoke-access-failed':
    case 'submit-access-request-failed':
    case 'save-key-failed':
    case 'delete-key-failed':
      return t('errors.operationFailed', 'No se pudo completar la operación. Probá de nuevo.');
    // embed-query-* (consumidor silencioso useHybridSearch) y cualquier slug
    // desconocido o ausente → copy genérico. Nunca devuelve la key cruda.
    default:
      return t('errors.default', 'Algo salió mal. Intentá de nuevo.');
  }
}
