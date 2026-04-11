import { createContext, useContext } from 'react';

export interface QuickCaptureContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  save: (rawContent: string) => void;
}

export const QuickCaptureContext = createContext<QuickCaptureContextValue | null>(null);

export default function useQuickCapture(): QuickCaptureContextValue {
  const context = useContext(QuickCaptureContext);
  if (!context) {
    throw new Error('useQuickCapture must be used within a QuickCaptureProvider');
  }
  return context;
}
