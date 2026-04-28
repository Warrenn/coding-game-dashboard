import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { LedgerStorage } from '../src/storage.js';
import type { DetectedAchievement, Snapshot } from '@cgd/shared';

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
});

function makeStorage(): LedgerStorage {
  const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  return new LedgerStorage('test-table', doc);
}

const FROZEN_TIME = new Date('2026-04-25T12:00:00.000Z').getTime();

const SNAPSHOT: Snapshot = {
  fetchedAt: '2026-04-25T12:00:00.000Z',
  handle: 'h',
  userId: 1,
  pseudo: 'p',
  level: 1,
  xp: 0,
  overallRank: 100,
  clashRank: null,
  clashTotalPlayers: null,
  totalAchievements: 0,
  achievements: [],
};

const DETECTED: DetectedAchievement = {
  achievementKey: 'BADGE#X',
  category: 'BADGE',
  title: 'X',
  level: 'BRONZE',
  detectedAt: '2026-04-25T12:00:00.000Z',
  metadata: {},
};

describe('LedgerStorage', () => {
  describe('getAgreementMeta', () => {
    it('returns null when no item exists', async () => {
      ddbMock.on(GetCommand).resolves({});
      expect(await makeStorage().getAgreementMeta()).toBeNull();
    });

    it('returns parsed agreement when item exists', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: { PK: 'AGREEMENT', SK: 'META', handle: 'abc', currency: 'USD' },
      });
      const meta = await makeStorage().getAgreementMeta();
      expect(meta).toEqual({ handle: 'abc', currency: 'USD', updatedAt: undefined });
    });

    it('queries the AGREEMENT/META key', async () => {
      ddbMock.on(GetCommand).resolves({});
      await makeStorage().getAgreementMeta();
      const call = ddbMock.commandCalls(GetCommand)[0];
      expect(call.args[0].input.Key).toEqual({ PK: 'AGREEMENT', SK: 'META' });
    });
  });

  describe('putSnapshot', () => {
    it('writes to PK=SNAPSHOT/SK=LATEST with no TTL (persists until next refresh)', async () => {
      ddbMock.on(PutCommand).resolves({});
      await makeStorage().putSnapshot(SNAPSHOT);
      const call = ddbMock.commandCalls(PutCommand)[0];
      expect(call.args[0].input.Item?.PK).toBe('SNAPSHOT');
      expect(call.args[0].input.Item?.SK).toBe('LATEST');
      expect(call.args[0].input.Item?.ttl).toBeUndefined();
    });
  });

  describe('putAchievementIfNew', () => {
    it('returns {created: true} when condition succeeds', async () => {
      ddbMock.on(PutCommand).resolves({});
      const result = await makeStorage().putAchievementIfNew(DETECTED);
      expect(result.created).toBe(true);
    });

    it('returns {created: false} on ConditionalCheckFailedException', async () => {
      ddbMock
        .on(PutCommand)
        .rejects(Object.assign(new Error('exists'), { name: 'ConditionalCheckFailedException' }));
      const result = await makeStorage().putAchievementIfNew(DETECTED);
      expect(result.created).toBe(false);
    });

    it('rethrows other errors', async () => {
      ddbMock.on(PutCommand).rejects(new Error('throttled'));
      await expect(makeStorage().putAchievementIfNew(DETECTED)).rejects.toThrow('throttled');
    });

    it('uses attribute_not_exists(SK) condition', async () => {
      ddbMock.on(PutCommand).resolves({});
      await makeStorage().putAchievementIfNew(DETECTED);
      const call = ddbMock.commandCalls(PutCommand)[0];
      expect(call.args[0].input.ConditionExpression).toBe('attribute_not_exists(SK)');
    });
  });

  describe('writeInbox', () => {
    it('writes to PK=INBOX#PAYER for payer recipient', async () => {
      ddbMock.on(PutCommand).resolves({});
      await makeStorage().writeInbox('PAYER', {
        eventId: '2026-04-25T12:00:00Z#abc',
        subject: 'request',
        message: 'pay me',
      });
      const call = ddbMock.commandCalls(PutCommand)[0];
      expect(call.args[0].input.Item?.PK).toBe('INBOX#PAYER');
      expect(call.args[0].input.Item?.SK).toBe('2026-04-25T12:00:00Z#abc');
    });
  });
});
