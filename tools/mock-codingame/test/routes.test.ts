import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { createApp } from '../src/server.js';

const __filename = fileURLToPath(import.meta.url);
const FIXTURES = join(dirname(__filename), '..', 'fixtures');

function loadJson(scenario: string, name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, scenario, `${name}.json`), 'utf-8'));
}

const SEED_HANDLE = 'ddc52ca3f0b26475dc7cc96153dbdf803390791';
const SEED_USER_ID = 1970933;

const STATS_PATH = '/services/CodinGamer/findCodingamePointsStatsByHandle';
const ACHIEVE_PATH = '/services/Achievement/findByCodingamerId';
const CLASH_PATH = '/services/ClashOfCode/getClashRankByCodinGamerId';

describe('mock-codingame routes', () => {
  describe('seed handle (real captured fixture)', () => {
    it('stats: POST returns the seed stats fixture verbatim', async () => {
      const expected = loadJson('seed', 'stats');
      const res = await request(createApp()).post(STATS_PATH).send([SEED_HANDLE]);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(expected);
    });

    it('achievements: POST with seed userId returns the seed fixture verbatim', async () => {
      const expected = loadJson('seed', 'achievements');
      const res = await request(createApp()).post(ACHIEVE_PATH).send([SEED_USER_ID]);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(expected);
    });

    it('clash: POST with seed userId returns null (seed has no clash rank)', async () => {
      const res = await request(createApp()).post(CLASH_PATH).send([SEED_USER_ID]);
      expect(res.status).toBe(200);
      expect(res.body).toBeNull();
    });
  });

  describe('mock-active scenario', () => {
    it('stats: returns the mock-active fixture', async () => {
      const expected = loadJson('mock-active', 'stats');
      const res = await request(createApp()).post(STATS_PATH).send(['mock-active']);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(expected);
    });

    it('achievements: by mock-active userId returns 5 items at varied levels', async () => {
      const res = await request(createApp()).post(ACHIEVE_PATH).send([9000001]);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(5);
      const levels = (res.body as Array<{ level: string }>).map((a) => a.level);
      expect(new Set(levels)).toEqual(new Set(['BRONZE', 'SILVER', 'GOLD', 'PLATINUM']));
    });

    it('clash: by mock-active userId returns rank/totalPlayers shape', async () => {
      const res = await request(createApp()).post(CLASH_PATH).send([9000001]);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ rank: 1234, totalPlayers: 50000 });
    });
  });

  describe('mock-empty scenario', () => {
    it('stats: returns level 1, xp 0, very high rank', async () => {
      const res = await request(createApp()).post(STATS_PATH).send(['mock-empty']);
      expect(res.status).toBe(200);
      expect(res.body.codingamer.level).toBe(1);
      expect(res.body.codingamer.xp).toBe(0);
      expect(res.body.codingamer.rank).toBe(999999);
    });

    it('achievements: returns empty array', async () => {
      const res = await request(createApp()).post(ACHIEVE_PATH).send([9000002]);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('clash: returns null', async () => {
      const res = await request(createApp()).post(CLASH_PATH).send([9000002]);
      expect(res.status).toBe(200);
      expect(res.body).toBeNull();
    });
  });

  describe('error scenarios', () => {
    it('mock-not-found: stats returns 422 with INVALID_PARAMETERS-shaped body', async () => {
      const res = await request(createApp()).post(STATS_PATH).send(['mock-not-found']);
      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({ id: 422 });
    });

    it('mock-cloudflare-blocked: stats returns 403 with HTML body', async () => {
      const res = await request(createApp()).post(STATS_PATH).send(['mock-cloudflare-blocked']);
      expect(res.status).toBe(403);
      expect(res.headers['content-type']).toMatch(/text\/html/);
      expect(res.text.toLowerCase()).toContain('cloudflare');
    });

    it('unknown handle: stats returns 422 (mirrors real CodinGame)', async () => {
      const res = await request(createApp()).post(STATS_PATH).send(['nonexistent-handle-xyz']);
      expect(res.status).toBe(422);
    });

    it('unknown userId: achievements returns 422', async () => {
      const res = await request(createApp()).post(ACHIEVE_PATH).send([99999999]);
      expect(res.status).toBe(422);
    });

    it('malformed body (not an array): returns 400', async () => {
      const res = await request(createApp())
        .post(STATS_PATH)
        .set('Content-Type', 'application/json')
        .send('"not-an-array"');
      expect(res.status).toBe(400);
    });
  });

  describe('mock-slow scenario', () => {
    it('honors a configurable delay (50ms test override) before responding', async () => {
      const app = createApp({ slowDelayMs: 50 });
      const start = Date.now();
      const res = await request(app).post(STATS_PATH).send(['mock-slow']);
      const elapsed = Date.now() - start;
      expect(res.status).toBe(200);
      expect(elapsed).toBeGreaterThanOrEqual(45);
    });
  });
});
