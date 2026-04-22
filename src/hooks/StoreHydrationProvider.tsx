import type { ReactNode } from 'react';
import { StoreHydrationContext, type StoreHydrationValue } from '@/hooks/useStoreHydration';

export default function StoreHydrationProvider({
  value,
  children,
}: {
  value: StoreHydrationValue;
  children: ReactNode;
}) {
  return <StoreHydrationContext.Provider value={value}>{children}</StoreHydrationContext.Provider>;
}
