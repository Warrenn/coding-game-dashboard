import type { LambdaFunctionURLEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { mockClient } from 'aws-sdk-client-mock';
import { handle } from '../src/handler.js';
import { CodinGameClient } from '../src/codingame.js';
import { LedgerStorage } from '../src/storage.js';
import { PaymentRequestNotifier } from '../src/notify.js';
import { useMockCodinGameServer } from './helpers/mock-server.js';

const ddbMock = mockClient(DynamoDBDocumentClient);
const snsMock = mockClient(SNSClient);

beforeEach(() => {
  ddbMock.reset();
  snsMock.reset();
});

const ctx = useMockCodinGameServer();

function makeDeps() {
  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const sns = new SNSClient({});
  return {
    storage: new LedgerStorage('test-table', ddb),
    codingame: new CodinGameClient({ baseUrl: ctx.baseUrl, userAgent: 'test/1.0' }),
    notifier: new PaymentRequestNotifier('arn:test', sns),
    now: () => new Date('2026-04-25T12:00:00.000Z'),
  };
}

function postEvent(path: string, body?: unknown): LambdaFunctionURLEvent {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: path,
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: 'anonymous',
      apiId: 'fake',
      domainName: 'fake.lambda-url.us-east-1.on.aws',
      domainPrefix: 'fake',
      http: {
        method: 'POST',
        path,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test',
      },
      requestId: 'r',
      routeKey: '$default',
      stage: '$default',
      time: '25/Apr/2026:12:00:00 +0000',
      timeEpoch: 1745582400000,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    isBase64Encoded: false,
  };
}

describe('handler', () => {
  it('returns 405 for non-POST', async () => {
    const event = postEvent('/snapshot');
    event.requestContext.http.method = 'GET';
    const res = await handle(event, makeDeps());
    expect(res.statusCode).toBe(405);
  });

  it('returns 404 for unknown route', async () => {
    const res = await handle(postEvent('/nope'), makeDeps());
    expect(res.statusCode).toBe(404);
  });

  describe('POST /snapshot', () => {
    it('returns 412 when agreement is missing', async () => {
      ddbMock.on(GetCommand).resolves({});
      const res = await handle(postEvent('/snapshot'), makeDeps());
      expect(res.statusCode).toBe(412);
      expect(JSON.parse(res.body as string).error).toBe('agreement-handle-not-configured');
    });

    it('fetches CodinGame, writes snapshot + new achievement rows, returns counts', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: { PK: 'AGREEMENT', SK: 'META', handle: 'mock-active' },
      });
      ddbMock.on(PutCommand).resolves({});

      const res = await handle(postEvent('/snapshot'), makeDeps());
      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.body as string);
      expect(body.snapshot.handle).toBe('mock-active');
      expect(body.snapshot.totalAchievements).toBe(5);
      expect(body.achievementsAdded).toBe(5);

      const puts = ddbMock.commandCalls(PutCommand);
      // 1 snapshot + 5 achievements
      expect(puts).toHaveLength(6);
      const snapshotPut = puts.find((c) => c.args[0].input.Item?.PK === 'SNAPSHOT');
      expect(snapshotPut).toBeDefined();
      expect(snapshotPut!.args[0].input.Item?.SK).toBe('LATEST');
    });

    it('counts only newly-created achievement rows (idempotent on re-run)', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: { PK: 'AGREEMENT', SK: 'META', handle: 'mock-active' },
      });
      // Snapshot put succeeds; achievement puts fail conditional check (already exists).
      ddbMock.on(PutCommand).callsFake((input) => {
        if (input.Item?.PK === 'ACHIEVEMENT') {
          return Promise.reject(
            Object.assign(new Error('exists'), { name: 'ConditionalCheckFailedException' }),
          );
        }
        return Promise.resolve({});
      });

      const res = await handle(postEvent('/snapshot'), makeDeps());
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body as string).achievementsAdded).toBe(0);
    });

    it('returns 502 when CodinGame returns 422 (invalid handle)', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: { PK: 'AGREEMENT', SK: 'META', handle: 'mock-not-found' },
      });
      const res = await handle(postEvent('/snapshot'), makeDeps());
      expect(res.statusCode).toBe(502);
      expect(JSON.parse(res.body as string).error).toBe('CodinGameInvalidHandleError');
    });

    it('returns 502 when CodinGame is Cloudflare-blocked', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: { PK: 'AGREEMENT', SK: 'META', handle: 'mock-cloudflare-blocked' },
      });
      const res = await handle(postEvent('/snapshot'), makeDeps());
      expect(res.statusCode).toBe(502);
      expect(JSON.parse(res.body as string).error).toBe('CodinGameBlockedError');
    });
  });

  describe('POST /notify-payment-request', () => {
    it('rejects invalid JSON body with 400', async () => {
      const event = postEvent('/notify-payment-request');
      event.body = '{not-json';
      const res = await handle(event, makeDeps());
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body as string).error).toBe('invalid-json');
    });

    it('rejects missing fields with 400 invalid-body', async () => {
      const res = await handle(postEvent('/notify-payment-request', {}), makeDeps());
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body as string).error).toBe('invalid-body');
    });

    it('publishes SNS and writes INBOX#PAYER', async () => {
      snsMock.on(PublishCommand).resolves({ MessageId: 'm1' });
      ddbMock.on(PutCommand).resolves({});

      const res = await handle(
        postEvent('/notify-payment-request', {
          requestId: 'req-1',
          subject: 'Payment requested',
          message: 'Player wants $25 for badges',
        }),
        makeDeps(),
      );
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body as string).inboxEventId).toBe('2026-04-25T12:00:00.000Z#req-1');

      expect(snsMock.commandCalls(PublishCommand)).toHaveLength(1);
      const inboxPut = ddbMock.commandCalls(PutCommand)[0];
      expect(inboxPut.args[0].input.Item?.PK).toBe('INBOX#PAYER');
      expect(inboxPut.args[0].input.Item?.refId).toBe('req-1');
    });
  });
});
