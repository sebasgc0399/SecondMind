import { createContext, useContext } from 'react';

export interface CommandPaletteContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

export default function useCommandPalette(): CommandPaletteContextValue {
  const context = useContext(CommandPaletteContext);
  if (!context) throw new Error('useCommandPalette must be used within a CommandPaletteProvider');
  return context;
}
