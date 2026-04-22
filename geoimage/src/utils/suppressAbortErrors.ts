let isListenerAttached = false;

/**
 * Safely suppresses Deck.gl's uncaught AbortErrors at the library level.
 * 
 * This prevents consumers of deck.gl-geotiff from needing to add boilerplate
 * to their application roots to suppress expected AbortErrors during tile pruning.
 * 
 * The listener is attached only once and only in browser environments, making
 * this function idempotent and safe to call from multiple places.
 */
export function suppressGlobalAbortErrors(): void {
  // Ensure we are in a browser environment and haven't already attached the listener
  if (typeof window !== 'undefined' && !isListenerAttached) {
    window.addEventListener('unhandledrejection', (event) => {
      // Strictly target standard AbortErrors from tile cancellation
      // These are expected during viewport changes and represent normal control flow,
      // not application errors
      if (event.reason && event.reason.name === 'AbortError') {
        // Prevent the browser from logging it to the console
        event.preventDefault();
      }
    });

    isListenerAttached = true;
  }
}
