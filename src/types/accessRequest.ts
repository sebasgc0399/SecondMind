export type AccessRequestStatus = 'pending' | 'approved' | 'rejected';

// DTO que viaja del callable listAccessRequests al cliente. createdAt/processedAt
// se serializan a epoch ms en la CF (un Firestore Timestamp no es JSON-serializable
// en la respuesta de un callable). El doc id ES el email normalizado (trim+lowercase),
// por eso `id === email`; se mantienen ambos por claridad del consumidor.
export interface AccessRequest {
  id: string;
  email: string;
  motivo?: string;
  status: AccessRequestStatus;
  createdAt: number | null;
  processedAt?: number | null;
}
