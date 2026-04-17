export const MOBILE_MAX = 767;
export const TABLET_MAX = 1023;

export const MOBILE_QUERY = `(max-width: ${MOBILE_MAX}px)`;
export const TABLET_QUERY = `(min-width: ${MOBILE_MAX + 1}px) and (max-width: ${TABLET_MAX}px)`;
export const DESKTOP_QUERY = `(min-width: ${TABLET_MAX + 1}px)`;

export type Breakpoint = 'mobile' | 'tablet' | 'desktop';
