/**
 * Normalize API / network errors for rider-facing UI.
 * Technical prefixes (e.g. Flutter "Upload/API Failed") stay in the console only.
 */

function tryParseJsonMessage(raw) {
  if (!raw || typeof raw !== "string") return null;
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (parsed && typeof parsed.message === "string" && parsed.message.trim()) {
      return parsed.message.trim();
    }
  } catch {
    /* ignore */
  }
  return null;
}

function isTechnicalErrorText(text) {
  if (!text || typeof text !== "string") return true;
  const t = text.trim();
  if (!t) return true;
  if (/upload\/api\s*failed/i.test(t)) return true;
  if (/^api\s*failed/i.test(t)) return true;
  if (/^request failed with status code/i.test(t)) return true;
  if (t.startsWith("{") && t.includes("}")) return true;
  if (/^\s*<!DOCTYPE/i.test(t) || /^\s*<html/i.test(t)) return true;
  return false;
}

/**
 * @param {unknown} err
 * @param {string} [fallback]
 * @returns {string}
 */
export function getUserFacingApiError(
  err,
  fallback = "Something went wrong. Please try again.",
) {
  const status = err?.response?.status;
  const data = err?.response?.data;

  if (typeof console !== "undefined" && console.error) {
    console.error("[API Error]", {
      status,
      data,
      message: err?.message,
      url: err?.config?.url,
    });
  }

  if (status === 429) {
    const rateMsg =
      (typeof data?.message === "string" && data.message) ||
      (typeof data?.error === "string" && data.error) ||
      null;
    return (
      rateMsg ||
      "Too many requests. Please wait a few minutes and try again."
    );
  }

  let msg =
    (typeof data?.message === "string" && data.message) ||
    (typeof data?.error === "string" && data.error) ||
    null;

  if (!msg && data?.message && typeof data.message === "object") {
    msg = data.message.message || null;
  }

  if (!msg && typeof err?.message === "string") {
    const fromJson = tryParseJsonMessage(err.message);
    if (fromJson) msg = fromJson;
    else if (!isTechnicalErrorText(err.message)) msg = err.message;
  }

  if (msg && isTechnicalErrorText(msg)) {
    const fromJson = tryParseJsonMessage(msg);
    msg = fromJson || null;
  }

  if (!msg || isTechnicalErrorText(msg)) return fallback;
  return msg.trim();
}
