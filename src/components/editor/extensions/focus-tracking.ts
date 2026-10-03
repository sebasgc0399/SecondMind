import { Extension, type Editor } from '@tiptap/core';

export interface FocusTrackingStorage {
  hasBeenFocused: boolean;
}

declare module '@tiptap/core' {
  interface Storage {
    focusTracking: FocusTrackingStorage;
  }
}

/**
 * Marca en `editor.storage` si el editor tuvo foco alguna vez. Vive con el
 * editor (no con quien lo consume), así la marca no depende de que un panel
 * estuviera montado cuando el usuario escribió (E2-T2-a).
 */
const FocusTracking = Extension.create<Record<string, never>, FocusTrackingStorage>({
  name: 'focusTracking',

  addStorage() {
    return { hasBeenFocused: false };
  },

  onCreate() {
    if (this.editor.isFocused) this.storage.hasBeenFocused = true;
  },

  onFocus() {
    this.storage.hasBeenFocused = true;
  },
});

export function hasEditorBeenFocused(editor: Editor): boolean {
  // Puede faltar si el editor se creó sin la extensión.
  const storage = editor.storage.focusTracking as FocusTrackingStorage | undefined;
  return storage?.hasBeenFocused === true;
}

export default FocusTracking;
