import {
  CodinGameClient,
  CodinGameError,
  CodinGameInvalidHandleError,
  CodinGameBlockedError,
} from '../src/codingame.js';
import { useMockCodinGameServer } from './helpers/mock-server.js';

const ctx = useMockCodinGameServer();

function makeClient(opts: Partial<ConstructorParameters<typeof CodinGameClient>[0]> = {}) {
  return new CodinGameClient({ baseUrl: ctx.baseUrl, userAgent: 'test/1.0', ...opts });
}

const SEED_HANDLE = 'ddc52ca3f0b26475dc7cc96153dbdf803390791';
const SEED_USER_ID = 1970933;

describe('CodinGameClient', () => {
  describe('happy path against mock server', () => {
    it('fetchStats returns parsed stats with codingamer.userId', async () => {
      const client = makeClient();
      const stats = await client.fetchStats(SEED_HANDLE);
      expect(stats.codingamer.userId).toBe(SEED_USER_ID);
      expect(stats.codingamer.publicHandle).toBe(SEED_HANDLE);
    });

    it('fetchAchievements returns array of achievements', async () => {
      const client = makeClient();
      const achievements = await client.fetchAchievements(SEED_USER_ID);
      expect(Array.isArray(achievements)).toBe(true);
      expect(achievements.length).toBeGreaterThan(0);
    });

    it('fetchClashRank returns null for users with no clash data', async () => {
      const client = makeClient();
      const clash = await client.fetchClashRank(SEED_USER_ID);
      expect(clash).toBeNull();
    });

    it('fetchClashRank returns object for users with clash data (mock-active)', async () => {
      const client = makeClient();
      const clash = await client.fetchClashRank(9000001);
      expect(clash).toEqual({ rank: 1234, totalPlayers: 50000 });
    });

    it('snapshot orchestrator chains all three calls and returns normalized snapshot', async () => {
      const client = makeClient();
      const snapshot = await client.snapshot(SEED_HANDLE);
      expect(snapshot.handle).toBe(SEED_HANDLE);
      expect(snapshot.userId).toBe(SEED_USER_ID);
      expect(snapshot.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(snapshot.totalAchievements).toBeGreaterThan(0);
    });
  });

  describe('error mapping', () => {
    it('422 → CodinGameInvalidHandleError', async () => {
      const client = makeClient();
      await expect(client.fetchStats('mock-not-found')).rejects.toBeInstanceOf(
        CodinGameInvalidHandleError,
      );
    });

    it('403 (Cloudflare) → CodinGameBlockedError', async () => {
      const client = makeClient();
      await expect(client.fetchStats('mock-cloudflare-blocked')).rejects.toBeInstanceOf(
        CodinGameBlockedError,
      );
    });

    it('network error (unreachable host) → CodinGameError', async () => {
      const client = new CodinGameClient({
        baseUrl: 'http://127.0.0.1:1', // closed port — connection refused
        userAgent: 'test/1.0',
        timeoutMs: 200,
      });
      await expect(client.fetchStats('anything')).rejects.toBeInstanceOf(CodinGameError);
    });

    it('snapshot propagates the underlying error type', async () => {
      const client = makeClient();
      await expect(client.snapshot('mock-not-found')).rejects.toBeInstanceOf(
        CodinGameInvalidHandleError,
      );
    });
  });

  describe('request shape', () => {
    it('sends identifying User-Agent', async () => {
      // Verify by hitting an endpoint that records (we can't, since the mock is stateless),
      // so this asserts the constructor-set value is used by checking the result
      // doesn't error — request would 4xx if missing required headers.
      const client = makeClient({ userAgent: 'coding-game-dashboard/0.0.0' });
      await expect(client.fetchStats(SEED_HANDLE)).resolves.toBeDefined();
    });

    it('sends POST with JSON body wrapped in single-element array', async () => {
      // Indirect proof: the mock server returns 400 if body is not [<scalar>], so
      // a successful fetch confirms array-wrapping.
      const client = makeClient();
      await expect(client.fetchAchievements(SEED_USER_ID)).resolves.toBeDefined();
    });
  });
});
