import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Wraps an async Express handler (route or middleware) so a rejected
 * promise reaches Express's error-handling middleware via `next(err)`
 * instead of becoming an unhandled rejection.
 *
 * Confirmed live 2026-09-10: every route/middleware in this server is
 * `async (req, res) => {...}` with no try/catch, and Express 4 (what this
 * app is on) does NOT automatically forward a rejected async handler's
 * promise anywhere — that's an Express 5 behavior change, not this
 * version's. A single transient failure (a Neon compute cold-start
 * timing out mid-query, confirmed the actual trigger that night) became
 * an unhandled rejection, which Node treats as fatal by default and
 * crashed the ENTIRE process — every other in-flight and future request
 * died with it, not just the one that hit the DB hiccup. This wrapper is
 * the standard Express fix: catch the rejection, hand it to `next`, so
 * index.ts's error-handling middleware can turn it into a clean 500 for
 * just that one request instead of taking the whole server down.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
