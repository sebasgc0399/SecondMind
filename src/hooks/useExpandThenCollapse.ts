import { useEffect, useState } from 'react';

// Hook genérico de "expand inicial + auto-collapse tras N ms, con re-expand
// cuando triggerKey cambia". Diseñado para indicadores que aparecen brevemente
// en su forma full-text y luego se reducen a un estado compacto.
//
// Uso típico:
//   const expanded = useExpandThenCollapse(isError ? 'error' : 'normal', 3000);
//
// triggerKey debe cambiar SOLO cuando el caller quiere forzar un re-expand
// (ej. transición de severity). Para evitar re-expand en cada notify
// numérico, mapear el estado interno a una key derivada estable.
//
// Reset pattern: state guarda { expanded, key } juntos. Cuando triggerKey
// difiere de state.key, hacemos setState durante render (patrón canónico de
// React: https://react.dev/reference/react/useState#storing-information-from-previous-renders).
// React re-runs el render con el state nuevo SIN un commit intermedio, así
// que no hay flash visual ni render extra perceptible.
export default function useExpandThenCollapse(
  triggerKey: string | number,
  durationMs: number,
): boolean {
  const [state, setState] = useState<{ expanded: boolean; key: string | number }>({
    expanded: true,
    key: triggerKey,
  });

  if (state.key !== triggerKey) {
    setState({ expanded: true, key: triggerKey });
  }

  useEffect(() => {
    const id = setTimeout(() => setState((prev) => ({ ...prev, expanded: false })), durationMs);
    return () => clearTimeout(id);
  }, [triggerKey, durationMs]);

  return state.key === triggerKey ? state.expanded : true;
}
