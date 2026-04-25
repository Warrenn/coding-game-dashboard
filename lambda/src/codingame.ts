// Thin wrapper around the three verified CodinGame /services/* endpoints.
// All methods are read-only against the public profile of a single handle.
// User-Agent identifies us so CodinGame ops can contact us if needed.
import {
  CodinGameAchievementsSchema,
  CodinGameClashRankSchema,
  CodinGameStatsSchema,
  type CodinGameAchievement,
  type CodinGameClashRank,
  type CodinGameStats,
  type Snapshot,
} from '@cgd/shared';
import { normalize } from './normalize.js';

export class CodinGameError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'CodinGameError';
  }
}

export class CodinGameInvalidHandleError extends CodinGameError {
  constructor(handle: string) {
    super(`CodinGame returned 422 for handle "${handle}" (invalid or private profile)`);
    this.name = 'CodinGameInvalidHandleError';
  }
}

export class CodinGameBlockedError extends CodinGameError {
  constructor() {
    super('CodinGame returned 403 (Cloudflare block — back off)');
    this.name = 'CodinGameBlockedError';
  }
}

export interface CodinGameClientOptions {
  baseUrl: string;
  userAgent: string;
  timeoutMs?: number;
  /** Override clock for deterministic snapshot timestamps in tests. */
  now?: () => Date;
}

const STATS_PATH = '/services/CodinGamer/findCodingamePointsStatsByHandle';
const ACHIEVE_PATH = '/services/Achievement/findByCodingamerId';
const CLASH_PATH = '/services/ClashOfCode/getClashRankByCodinGamerId';

export class CodinGameClient {
  private readonly baseUrl: string;
  private readonly userAgent: string;
  private readonly timeoutMs: number;
  private readonly now: () => Date;

  constructor(opts: CodinGameClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.userAgent = opts.userAgent;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.now = opts.now ?? (() => new Date());
  }

  async fetchStats(handle: string): Promise<CodinGameStats> {
    const raw = await this.post(STATS_PATH, [handle], { handleArg: handle });
    return CodinGameStatsSchema.parse(raw);
  }

  async fetchAchievements(userId: number): Promise<CodinGameAchievement[]> {
    const raw = await this.post(ACHIEVE_PATH, [userId]);
    return CodinGameAchievementsSchema.parse(raw);
  }

  async fetchClashRank(userId: number): Promise<CodinGameClashRank> {
    const raw = await this.post(CLASH_PATH, [userId]);
    return CodinGameClashRankSchema.parse(raw);
  }

  /** Orchestrate handle → stats → achievements + clash → normalized Snapshot. */
  async snapshot(handle: string): Promise<Snapshot> {
    const stats = await this.fetchStats(handle);
    const userId = stats.codingamer.userId;
    const [achievements, clashRank] = await Promise.all([
      this.fetchAchievements(userId),
      this.fetchClashRank(userId),
    ]);
    return normalize({
      stats,
      achievements,
      clashRank,
      fetchedAt: this.now().toISOString(),
    });
  }

  private async post(
    path: string,
    body: unknown,
    ctx: { handleArg?: string } = {},
  ): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': this.userAgent,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      throw new CodinGameError(`fetch failed: ${path}`, err);
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 422) {
      throw new CodinGameInvalidHandleError(ctx.handleArg ?? '<unknown>');
    }
    if (response.status === 403) {
      throw new CodinGameBlockedError();
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new CodinGameError(`${path} returned ${response.status}: ${text.slice(0, 200)}`);
    }

    try {
      return await response.json();
    } catch (err) {
      throw new CodinGameError(`${path} returned non-JSON`, err);
    }
  }
}
