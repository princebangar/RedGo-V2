// User-facing text for a request that got no response (no internet vs server unreachable).
export const getNetworkErrorMessage = () =>
  typeof navigator !== "undefined" && navigator.onLine === false
    ? "No internet connection. Please check your connection and try again."
    : "Could not reach the server. Please try again in a moment."
