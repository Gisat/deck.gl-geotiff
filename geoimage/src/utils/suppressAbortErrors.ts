let isListenerAttached = false;

/**
 * Suppresses unhandled AbortErrors from deck.gl tile cancellation.
 * 
 * Call this function from your application root to prevent console spam
 * when tiles are pruned during viewport changes (pan/zoom).
 * 
 * Example usage in your app root:
 *   import { suppressGlobalAbortErrors } from '@gisatcz/deckgl-geolib';
 *   suppressGlobalAbortErrors();
 * 
 * Note: This suppresses ALL unhandled AbortErrors (including from your own code).
 * If you need finer control, implement your own unhandledrejection handler instead.
 * 
 * The listener is attached only once and only in browser environments, making
 * this function idempotent and safe to call from multiple places.
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
