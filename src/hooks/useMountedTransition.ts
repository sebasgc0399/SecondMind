import { useEffect, useState } from 'react';

interface UseMountedTransitionResult {
  shouldRender: boolean;
  isExiting: boolean;
}

interface InternalState {
  shouldRender: boolean;
  isExiting: boolean;
  prevVisible: boolean;
}

// Hook que retarda el unmount de un componente para permitir una
// animación de salida (animate-out slide-out-to-X). El consumer renderiza
// el componente mientras `shouldRender` es true; cuando `visible` flippea
// de true → false, `isExiting` se vuelve true durante `durationMs` para
// que el consumer aplique la clase animate-out. Pasado ese tiempo,
// `shouldRender` pasa a false y el componente se desmonta del árbol.
//
// Skip-initial gratis: en mount inicial state.prevVisible === visible
// (inicializados igual en useState), la rama de update durante render no
// corre. Sin necesidad de useRef.
//
// Pre-paint timing: el setState durante render ocurre en el mismo ciclo
// que el paint resultante, sin desfase con animate-in del entrante en
// swaps simétricos como sidebar↔TopBar (F33.1).
//
// Patrón canónico del repo para hooks reutilizables que detectan cambios
// de prop: ver `useExpandThenCollapse.ts:19-38`. Rationale completo de
// preferencia sobre `useRef + isInitialMount` en SPEC F33 D7.
export default function useMountedTransition(
  visible: boolean,
  durationMs: number,
): UseMountedTransitionResult {
  const [state, setState] = useState<InternalState>({
    shouldRender: visible,
    isExiting: false,
    prevVisible: visible,
  });

  if (state.prevVisible !== visible) {
    setState({
      shouldRender: true,
      isExiting: !visible,
      prevVisible: visible,
    });
  }

  useEffect(() => {
    if (!state.isExiting) return;
    const id = window.setTimeout(() => {
      setState((prev) =>
        prev.isExiting
          ? { shouldRender: false, isExiting: false, prevVisible: prev.prevVisible }
          : prev,
      );
    }, durationMs);
    return () => window.clearTimeout(id);
  }, [state.isExiting, durationMs]);

  return { shouldRender: state.shouldRender, isExiting: state.isExiting };
}
