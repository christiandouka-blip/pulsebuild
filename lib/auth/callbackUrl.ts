/**
 * Internal post-sign-in destinations only. External and protocol-relative
 * URLs are rejected so Auth.js cannot be used as an open redirect.
 */

export const DEFAULT_POST_SIGN_IN_PATH = "/";

const ALLOWED_EXACT = new Set([
  "/",
  "/projects",
  "/projects/new",
  "/select-organization",
  "/sign-in",
]);

const ALLOWED_PREFIXES = [/^\/projects\/[A-Za-z0-9_-]+$/, /^\/projects\/import\/[A-Za-z0-9_-]+$/];

export function resolveSafeCallbackUrl(raw: unknown): string {
  if (typeof raw !== "string") {
    return DEFAULT_POST_SIGN_IN_PATH;
  }

  let value = raw.trim();
  if (!value) {
    return DEFAULT_POST_SIGN_IN_PATH;
  }

  try {
    value = decodeURIComponent(value);
  } catch {
    return DEFAULT_POST_SIGN_IN_PATH;
  }

  value = value.trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return DEFAULT_POST_SIGN_IN_PATH;
  }
  if (
    value.includes("\\") ||
    value.includes("://") ||
    value.includes("@") ||
    /[\u0000-\u001F\u007F]/.test(value)
  ) {
    return DEFAULT_POST_SIGN_IN_PATH;
  }

  const path = value.split("?")[0]?.split("#")[0] ?? "";
  if (!isAllowedInternalPath(path)) {
    return DEFAULT_POST_SIGN_IN_PATH;
  }
  return path;
}

function isAllowedInternalPath(path: string): boolean {
  if (ALLOWED_EXACT.has(path)) {
    return true;
  }
  return ALLOWED_PREFIXES.some((pattern) => pattern.test(path));
}
