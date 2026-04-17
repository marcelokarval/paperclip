import type { Request, RequestHandler } from "express";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const DEFAULT_DEV_ORIGINS = [
  "http://localhost:3100",
  "http://127.0.0.1:3100",
];

type BoardMutationGuardOptions = {
  trustedOrigins?: string[];
};

function parseOrigin(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`.toLowerCase();
  } catch {
    return null;
  }
}

function isTrustedBoardMutationRequest(req: Request, allowedOrigins: Set<string>) {
  const origin = parseOrigin(req.header("origin"));
  if (origin && allowedOrigins.has(origin)) return true;

  const refererOrigin = parseOrigin(req.header("referer"));
  if (refererOrigin && allowedOrigins.has(refererOrigin)) return true;

  return false;
}

export function boardMutationGuard(options: BoardMutationGuardOptions = {}): RequestHandler {
  const allowedOrigins = new Set(
    (options.trustedOrigins ?? DEFAULT_DEV_ORIGINS)
      .map((value) => parseOrigin(value))
      .filter((value): value is string => value !== null),
  );

  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method.toUpperCase())) {
      next();
      return;
    }

    if (req.actor.type !== "board") {
      next();
      return;
    }

    // Local-trusted mode and board bearer keys are not browser-session requests.
    // In these modes, origin/referer headers can be absent; do not block those mutations.
    if (req.actor.source === "local_implicit" || req.actor.source === "board_key") {
      next();
      return;
    }

    if (!isTrustedBoardMutationRequest(req, allowedOrigins)) {
      res.status(403).json({ error: "Board mutation requires trusted browser origin" });
      return;
    }

    next();
  };
}
