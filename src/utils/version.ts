declare global {
  const __APP_VERSION__: string | undefined;
}

export const VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.1.3';
