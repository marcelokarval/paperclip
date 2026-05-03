const SILENCED_SUCCESS_METHODS = new Set(["GET", "HEAD"]);

const SILENCED_SUCCESS_API_PATHS = [
  /^\/api\/health(?:\/|$)/,
  /^\/api\/companies\/[^/]+\/activity(?:\/|$)/,
  /^\/api\/companies\/[^/]+\/dashboard(?:\/|$)/,
  /^\/api\/companies\/[^/]+\/heartbeat-runs(?:\/|$)/,
  /^\/api\/companies\/[^/]+\/issues(?:\/|$)/,
  /^\/api\/companies\/[^/]+\/live-runs(?:\/|$)/,
  /^\/api\/companies\/[^/]+\/sidebar-badges(?:\/|$)/,
  /^\/api\/heartbeat-runs\/[^/]+\/log(?:\/|$)/,
];

const SILENCED_SUCCESS_STATIC_PREFIXES = [
  "/@fs/",
  "/@id/",
  "/@react-refresh",
  "/@vite/",
  "/_plugins/",
  "/assets/",
  "/node_modules/",
  "/src/",
];

const SILENCED_SUCCESS_STATIC_PATHS = new Set([
  "/favicon.ico",
  "/site.webmanifest",
]);

const SENSITIVE_QUERY_PARAM_RE = /(?:^|[-_])(api[-_]?key|authorization|auth|bearer|cookie|credential|current[-_]?password|new[-_]?password|password|private[-_]?key|refresh[-_]?token|secret|token)(?:$|[-_])/i;

function normalizePath(url: string): string {
  const trimmed = url.trim();
  if (trimmed.length === 0) return "/";
  const pathname = trimmed.split("?")[0]?.trim() ?? "/";
  return pathname.length > 0 ? pathname : "/";
}

export function sanitizeHttpLogUrl(url: string | undefined): string {
  if (!url) return "";
  const trimmed = url.trim();
  if (trimmed.length === 0) return "/";

  const hashIndex = trimmed.indexOf("#");
  const withoutHash = hashIndex >= 0 ? trimmed.slice(0, hashIndex) : trimmed;
  const queryIndex = withoutHash.indexOf("?");
  if (queryIndex < 0) return withoutHash || "/";

  const pathname = withoutHash.slice(0, queryIndex) || "/";
  const rawQuery = withoutHash.slice(queryIndex + 1);
  if (!rawQuery) return pathname;

  const params = new URLSearchParams(rawQuery);
  for (const key of Array.from(params.keys())) {
    if (SENSITIVE_QUERY_PARAM_RE.test(key)) {
      params.set(key, "[REDACTED]");
    }
  }

  const nextQuery = params.toString();
  return nextQuery ? `${pathname}?${nextQuery}` : pathname;
}

export function shouldSilenceHttpSuccessLog(method: string | undefined, url: string | undefined, statusCode: number): boolean {
  if (statusCode >= 400) return false;
  if (statusCode === 304) return true;
  if (!method || !url) return false;
  if (!SILENCED_SUCCESS_METHODS.has(method.toUpperCase())) return false;

  const pathname = normalizePath(url);
  if (SILENCED_SUCCESS_STATIC_PATHS.has(pathname)) return true;
  if (SILENCED_SUCCESS_STATIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
  return SILENCED_SUCCESS_API_PATHS.some((pattern) => pattern.test(pathname));
}
