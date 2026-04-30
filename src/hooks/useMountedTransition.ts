import { useEffect, useState } from 'react';

interface UseMountedTransitionResult {
  shouldRender: boolean;
  isExiting: boolean;
  justMounted: boolean;
}

interface InternalState {
  shouldRender: boolean;
  isExiting: boolean;
  justMounted: boolean;
  prevVisible: boolean;
}

// Hook que retarda el unmount de un componente para permitir una
// animación de salida (animate-out slide-out-to-X). El consumer renderiza
// el componente mientras `shouldRender` es true; cuando `visible` flippea
// de true → false, `isExiting` se vuelve true durante `durationMs` para
// que el consumer aplique la clase animate-out. Pasado ese tiempo,
// `shouldRender` pasa a false y el componente se desmonta del árbol.
//
// `justMounted` es true durante `durationMs` después de un mount real
// (mount inicial con visible=true Y re-mount tras exit completado). Es
// false durante toggles rápidos donde `shouldRender` se mantuvo true
// (saliente que no llegó a desmontarse). Permite al consumer condicionar
// `animate-in` solo a re-mounts reales y evitar el blip de slide-in
// sobre componentes ya visibles (F35.1).
//
// Lifetime de `durationMs` (no 1 render): el flag se persiste en state
// con timer matching la duración de la animación. Razón: si fuera
// 1-render-only (vía useRef + useEffect post-paint), un re-render del
// parent mid-animación leería justMounted=false y removería la clase
// animate-in en pleno vuelo, causando snap visual a translateX(0).
// Persistir el flag asegura que la clase se mantenga durante toda la
// animación incluso ante re-renders no relacionados. Ver SPEC F35 D1.
//
// Skip-initial gratis del setState durante render: en mount inicial
// state.prevVisible === visible (inicializados igual en useState), la
// rama de update no corre.
//
// Pre-paint timing: el setState durante render ocurre en el mismo ciclo
// que el paint resultante, sin desfase con animate-in del entrante en
// swaps simétricos como sidebar↔TopBar (F33.1).
//
// Patrón canónico del state core: ver `useExpandThenCollapse.ts:19-38`.
export default function useMountedTransition(
  visible: boolean,
  durationMs: number,
): UseMountedTransitionResult {
  const [state, setState] = useState<InternalState>({
    shouldRender: visible,
    isExiting: false,
    justMounted: visible,
    prevVisible: visible,
  });

  if (state.prevVisible !== visible) {
    // isRealMount: shouldRender flippea de false → true (re-mount tras
    // unmount completo). Si shouldRender ya estaba true (fast toggle
    // durante exit), NO es mount real y justMounted permanece false.
    const isRealMount = visible && !state.shouldRender;
    setState({
      shouldRender: true,
      isExiting: !visible,
      justMounted: isRealMount,
      prevVisible: visible,
    });
  }

  useEffect(() => {
    if (!state.isExiting) return;
    const id = window.setTimeout(() => {
      setState((prev) =>
        prev.isExiting ? { ...prev, shouldRender: false, isExiting: false } : prev,
      );
    }, durationMs);
    return () => window.clearTimeout(id);
  }, [state.isExiting, durationMs]);

  useEffect(() => {
    if (!state.justMounted) return;
    const id = window.setTimeout(() => {
      setState((prev) => (prev.justMounted ? { ...prev, justMounted: false } : prev));
    }, durationMs);
    return () => window.clearTimeout(id);
  }, [state.justMounted, durationMs]);

  return {
    shouldRender: state.shouldRender,
    isExiting: state.isExiting,
    justMounted: state.justMounted,
  };
}
