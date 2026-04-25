import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { SNSClient } from '@aws-sdk/client-sns';
import type { LambdaFunctionURLEvent } from 'aws-lambda';
import { z } from 'zod';
import { CodinGameClient, CodinGameError } from './codingame.js';
import { LedgerStorage } from './storage.js';
import { PaymentRequestNotifier } from './notify.js';

export interface HandlerResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

const NotifyPaymentRequestBody = z.object({
  requestId: z.string().min(1),
  subject: z.string().min(1).max(200),
  message: z.string().min(1).max(2000),
});

export interface HandlerDependencies {
  storage: LedgerStorage;
  codingame: CodinGameClient;
  notifier: PaymentRequestNotifier;
  now?: () => Date;
}

function ok(body: unknown): HandlerResponse {
  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function err(statusCode: number, error: string, detail?: unknown): HandlerResponse {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(detail ? { error, detail } : { error }),
  };
}

export async function handle(
  event: LambdaFunctionURLEvent,
  deps: HandlerDependencies,
): Promise<HandlerResponse> {
  const path = event.requestContext.http.path;
  const method = event.requestContext.http.method;

  if (method !== 'POST') return err(405, 'method-not-allowed');

  if (path === '/snapshot') return refreshSnapshot(deps);
  if (path === '/notify-payment-request') return notifyPaymentRequest(event, deps);
  return err(404, 'not-found');
}

async function refreshSnapshot(deps: HandlerDependencies): Promise<HandlerResponse> {
  const meta = await deps.storage.getAgreementMeta();
  if (!meta || !meta.handle) {
    return err(412, 'agreement-handle-not-configured');
  }

  let snapshot;
  try {
    snapshot = await deps.codingame.snapshot(meta.handle);
  } catch (e) {
    if (e instanceof CodinGameError) {
      return err(502, e.name, e.message);
    }
    throw e;
  }

  await deps.storage.putSnapshot(snapshot);
  let createdCount = 0;
  for (const detected of snapshot.achievements) {
    const { created } = await deps.storage.putAchievementIfNew(detected);
    if (created) createdCount++;
  }
  return ok({ snapshot, achievementsAdded: createdCount });
}

async function notifyPaymentRequest(
  event: LambdaFunctionURLEvent,
  deps: HandlerDependencies,
): Promise<HandlerResponse> {
  let body: unknown;
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return err(400, 'invalid-json');
  }
  const parsed = NotifyPaymentRequestBody.safeParse(body);
  if (!parsed.success) {
    return err(400, 'invalid-body', parsed.error.flatten());
  }
  const { requestId, subject, message } = parsed.data;

  await deps.notifier.publish({ subject, message });

  const now = (deps.now ?? (() => new Date()))();
  const eventId = `${now.toISOString()}#${requestId}`;
  await deps.storage.writeInbox('PAYER', {
    eventId,
    subject,
    message,
    refId: requestId,
  });

  return ok({ inboxEventId: eventId });
}

/**
 * Default Lambda entry point. Reads env vars to wire up real AWS clients.
 * Tests should call `handle()` directly with mocked dependencies instead.
 */
export const handler = async (event: LambdaFunctionURLEvent): Promise<HandlerResponse> => {
  const table = process.env.LEDGER_TABLE;
  const topic = process.env.PAYMENT_REQUEST_TOPIC_ARN;
  const baseUrl = process.env.CODINGAME_BASE_URL ?? 'https://www.codingame.com';
  if (!table) return err(500, 'LEDGER_TABLE not set');
  if (!topic) return err(500, 'PAYMENT_REQUEST_TOPIC_ARN not set');

  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const sns = new SNSClient({});

  const deps: HandlerDependencies = {
    storage: new LedgerStorage(table, ddb),
    codingame: new CodinGameClient({
      baseUrl,
      userAgent: 'coding-game-dashboard/0.0.0 (+https://github.com/Warrenn/coding-game-dashboard)',
    }),
    notifier: new PaymentRequestNotifier(topic, sns),
  };
  return handle(event, deps);
};
