import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { loadAllFixtures, type Fixture } from './fixtures.js';

export interface AppOptions {
  /** Delay applied for the `mock-slow` handle. Default 30_000 ms (matches a real-world worst case). */
  slowDelayMs?: number;
}

const STATS_PATH = '/services/CodinGamer/findCodingamePointsStatsByHandle';
const ACHIEVE_PATH = '/services/Achievement/findByCodingamerId';
const CLASH_PATH = '/services/ClashOfCode/getClashRankByCodinGamerId';

const INVALID = { id: 422, message: 'INVALID_PARAMETERS' };
const BAD_REQUEST = { id: 400, message: 'BAD_REQUEST' };

export function createApp(options: AppOptions = {}): Express {
  const slowDelayMs = options.slowDelayMs ?? 30_000;
  const fixtures = loadAllFixtures();
  const byHandle = new Map<string, Fixture>(fixtures.map((f) => [f.handle, f]));
  const byUserId = new Map<number, Fixture>(fixtures.map((f) => [f.userId, f]));
  // mock-slow returns mock-active's payload so the snapshot looks "successful but late"
  const slowFallback = byHandle.get('mock-active') ?? fixtures[0];

  const app = express();
  app.use(express.json({ strict: true }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post(STATS_PATH, async (req, res) => {
    const handle = firstString(req.body);
    if (handle === null) {
      res.status(400).json(BAD_REQUEST);
      return;
    }
    if (handle === 'mock-not-found') {
      res.status(422).json(INVALID);
      return;
    }
    if (handle === 'mock-cloudflare-blocked') {
      res
        .status(403)
        .type('html')
        .send(
          '<!DOCTYPE html><html><head><title>Just a moment...</title></head>' +
            '<body><h1>Cloudflare</h1><p>Sorry, you have been blocked.</p></body></html>',
        );
      return;
    }
    if (handle === 'mock-slow') {
      await new Promise((resolve) => setTimeout(resolve, slowDelayMs));
      if (slowFallback) {
        res.status(200).json(slowFallback.stats);
      } else {
        res.status(200).json(null);
      }
      return;
    }
    const fixture = byHandle.get(handle);
    if (!fixture) {
      res.status(422).json(INVALID);
      return;
    }
    res.status(200).json(fixture.stats);
  });

  app.post(ACHIEVE_PATH, (req, res) => {
    const userId = firstNumber(req.body);
    if (userId === null) {
      res.status(400).json(BAD_REQUEST);
      return;
    }
    const fixture = byUserId.get(userId);
    if (!fixture) {
      res.status(422).json(INVALID);
      return;
    }
    res.status(200).json(fixture.achievements);
  });

  app.post(CLASH_PATH, (req, res) => {
    const userId = firstNumber(req.body);
    if (userId === null) {
      res.status(400).json(BAD_REQUEST);
      return;
    }
    const fixture = byUserId.get(userId);
    if (!fixture) {
      res.status(422).json(INVALID);
      return;
    }
    res.status(200).json(fixture.clashRank);
  });

  // Body-parser errors land here.
  app.use((err: Error & { status?: number }, _req: Request, res: Response, next: NextFunction) => {
    if (err && err.status && err.status >= 400 && err.status < 500) {
      res.status(400).json(BAD_REQUEST);
      return;
    }
    next(err);
  });

  return app;
}

function firstString(body: unknown): string | null {
  return Array.isArray(body) && typeof body[0] === 'string' ? body[0] : null;
}

function firstNumber(body: unknown): number | null {
  return Array.isArray(body) && typeof body[0] === 'number' ? body[0] : null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 4000);
  createApp().listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`mock-codingame listening on :${port}`);
  });
}
