interface EnvironmentBadgeProps {
  projectId: string;
}

// SPEC-69 T4 — chip fijo que marca el modo emulador para no confundir entornos. Solo se
// monta con `isEmulatorMode` (dev server); en producción no existe. Texto sin i18n a
// propósito: es una etiqueta técnica de desarrollo, no UI de usuario (E0-T4-c).
// `pointer-events-none` para no tapar clicks del header que queda debajo.
export default function EnvironmentBadge({ projectId }: EnvironmentBadgeProps) {
  return (
    <div
      role="status"
      aria-label={`Entorno: emulador (${projectId})`}
      data-testid="environment-badge"
      className="pointer-events-none fixed left-1/2 z-[60] -translate-x-1/2 select-none rounded-full border border-destructive bg-background/90 px-2.5 py-0.5 text-[10px] font-semibold tracking-wide text-destructive shadow-sm backdrop-blur-sm top-[calc(var(--sai-top)+0.25rem)]"
    >
      EMULADOR · {projectId}
    </div>
  );
}
