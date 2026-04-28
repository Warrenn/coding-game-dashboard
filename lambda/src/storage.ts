// DynamoDB writes for the Lambda. Keys mirror the data model in STRATEGY.md.
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { Snapshot, DetectedAchievement } from '@cgd/shared';

export interface AgreementMeta {
  handle: string;
  /** Currency string (e.g. "USD"). Optional at MVP. */
  currency?: string;
  /** Last update ISO timestamp. */
  updatedAt?: string;
}

export interface InboxEntry {
  /** ISO timestamp + ULID-like suffix; used as SK. */
  eventId: string;
  /** Short title shown in the inbox. */
  subject: string;
  /** Free-text body. */
  message: string;
  /** Reference into the ledger (e.g. requestId). */
  refId?: string;
}

export class LedgerStorage {
  constructor(
    private readonly table: string,
    private readonly db: DynamoDBDocumentClient,
  ) {}

  async getAgreementMeta(): Promise<AgreementMeta | null> {
    const { Item } = await this.db.send(
      new GetCommand({ TableName: this.table, Key: { PK: 'AGREEMENT', SK: 'META' } }),
    );
    if (!Item) return null;
    return {
      handle: String(Item.handle ?? ''),
      currency: typeof Item.currency === 'string' ? Item.currency : undefined,
      updatedAt: typeof Item.updatedAt === 'string' ? Item.updatedAt : undefined,
    };
  }

  // Snapshot persists until next refresh overwrites it. No TTL — earlier
  // versions expired after 15 min, which silently blanked XP-milestone
  // outstanding lines for the payer once any time passed.
  async putSnapshot(snapshot: Snapshot): Promise<void> {
    await this.db.send(
      new PutCommand({
        TableName: this.table,
        Item: {
          PK: 'SNAPSHOT',
          SK: 'LATEST',
          ...snapshot,
        },
      }),
    );
  }

  /** Insert the achievement row only if the SK doesn't already exist. Idempotent. */
  async putAchievementIfNew(detected: DetectedAchievement): Promise<{ created: boolean }> {
    try {
      await this.db.send(
        new PutCommand({
          TableName: this.table,
          Item: { PK: 'ACHIEVEMENT', SK: detected.achievementKey, ...detected },
          ConditionExpression: 'attribute_not_exists(SK)',
        }),
      );
      return { created: true };
    } catch (err) {
      if (
        err &&
        typeof err === 'object' &&
        'name' in err &&
        (err as { name: string }).name === 'ConditionalCheckFailedException'
      ) {
        return { created: false };
      }
      throw err;
    }
  }

  async writeInbox(recipient: 'PAYER' | 'PLAYER', entry: InboxEntry): Promise<void> {
    await this.db.send(
      new PutCommand({
        TableName: this.table,
        Item: {
          PK: `INBOX#${recipient}`,
          SK: entry.eventId,
          subject: entry.subject,
          message: entry.message,
          refId: entry.refId ?? null,
        },
      }),
    );
  }
}
