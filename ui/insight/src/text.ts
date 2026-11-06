import type Ctrl from "./ctrl";

// Text is supplied by the native translation catalog on the focused site.
export const text = (ctrl: Ctrl, key: string, upstream: string): string =>
  ctrl.env.i18n?.[key] ?? upstream;
