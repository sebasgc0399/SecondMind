import { createContext, useContext } from 'react';

export interface StoreHydrationValue {
  isHydrating: boolean;
}

// Default seguro: skeleton hasta que haya Provider. Consumidores fuera del
// Provider (tests, rutas no envueltas como /login o /capture) no crashean.
export const StoreHydrationContext = createContext<StoreHydrationValue>({ isHydrating: true });

export function useStoreHydration(): StoreHydrationValue {
  return useContext(StoreHydrationContext);
}
