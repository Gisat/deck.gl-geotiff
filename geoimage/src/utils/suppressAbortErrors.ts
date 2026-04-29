let isListenerAttached = false;

/**
 * Suppresses unhandled AbortErrors from deck.gl tile cancellation.
 *
 * NOTE: The library's main entry point installs this handler automatically
 * when the package is imported via its primary build (for example
 * `import '@gisatcz/deckgl-geolib'`). This default prevents console spam during
 * normal tile cancellation (pan/zoom) for the vast majority of consumers.
 *
 * If you need to control installation manually (for example when importing
 * internals or for custom lifecycle control), import and call the exported
 * function yourself:
 *
 *   import { suppressGlobalAbortErrors } from '@gisatcz/deckgl-geolib';
 *   suppressGlobalAbortErrors();
 *
 * Warning: This suppresses ALL unhandled AbortErrors (including from your own
 * code). If you need finer control, implement a custom `unhandledrejection`
 * handler instead.
 *
 * The listener is attached only once and only in browser environments,
 * making this function idempotent and safe to call multiple times.
 */
export function suppressGlobalAbortErrors(): void {
  // Ensure we are in a browser environment and haven't already attached the listener
  if (typeof window !== 'undefined' && !isListenerAttached) {
    window.addEventListener('unhandledrejection', (event) => {
      // Suppress standard AbortErrors from tile cancellation and fetch aborts.
      // These are expected during viewport changes and represent normal control flow,
      // not application errors.
      if (event.reason && event.reason.name === 'AbortError') {
        // Prevent the browser from logging it to the console
        event.preventDefault();
      }
    });

    isListenerAttached = true;
  }
}
