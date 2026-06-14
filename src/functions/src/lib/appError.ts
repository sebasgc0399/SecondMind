import { HttpsError, type FunctionsErrorCode } from 'firebase-functions/v2/https';

// SPEC-58 F3.2 — construye un HttpsError con un SLUG estable en `details.code`. El
// slug es el contrato con el cliente (mapCfError lo lee de err.details.code para
// resolver el copy localizado); el `grpcCode` se preserva tal cual el sitio lo
// usaba hoy (solo AGREGA details.code) → el SDK lo serializa en el wire y el cliente
// lo expone como err.details. Compatible hacia atrás: clientes/binarios viejos
// siguen leyendo err.code (functions/<grpc>). `extraDetails` lleva payload adicional
// (ej. beta-full → { maxUsers, current }). Retorna un HttpsError real, así que los
// guards `if (error instanceof HttpsError) throw error` (re-throw sin degradar a
// 'internal') siguen funcionando.
export function appError(
  code: string,
  grpcCode: FunctionsErrorCode,
  message: string,
  extraDetails?: Record<string, unknown>,
): HttpsError {
  return new HttpsError(grpcCode, message, { code, ...extraDetails });
}
