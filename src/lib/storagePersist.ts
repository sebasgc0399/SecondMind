let requested = false;

/**
 * Pide al browser marcar el origin como "persistent" para que su storage
 * (IndexedDB — incluida la cache de Firestore de SPEC-56) no sea elegible para
 * la eviction LRU bajo presión de almacenamiento. Best-effort e idempotente: si
 * el browser no expone la API o niega el pedido, es un no-op silencioso (la cache
 * sigue funcionando, solo queda evictable). Loggea el retorno con prefijo
 * `[storage:persist]` para poder leerlo en el QA (consola web/Tauri, logcat
 * Android — gate F7). No bloquea el boot: invocar con `void` desde main.tsx.
 */
export async function requestPersistentStorage(): Promise<void> {
  if (requested) return;
  requested = true;
  if (!navigator.storage?.persist) return;
  try {
    const granted = await navigator.storage.persist();
    console.info(`[storage:persist] granted=${granted}`);
  } catch (error) {
    console.warn('[storage:persist] failed', error);
  }
}
