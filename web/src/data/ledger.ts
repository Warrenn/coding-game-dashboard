// Web-side data access layer over the DynamoDB ledger table. Uses temporary
// credentials issued by the Cognito Identity Pool; IAM policies enforce
// per-role access (see infra/storage-identity.yaml).
import {
  BatchWriteCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  AgreementMetaSchema,
  PaymentRequestSchema,
  PaymentSchema,
  PricingRuleSchema,
  SnapshotSchema,
  type AgreementMeta,
  type DetectedAchievement,
  type InboxEntry,
  type Payment,
  type PaymentRequest,
  type PricingRule,
  type Snapshot,
} from '@cgd/shared';

export type Recipient = 'PAYER' | 'PLAYER';

export class WebLedger {
  constructor(
    private readonly table: string,
    private readonly db: DynamoDBDocumentClient,
  ) {}

  // ---------- Agreement (META) ----------

  async getAgreementMeta(): Promise<AgreementMeta | null> {
    const { Item } = await this.db.send(
      new GetCommand({ TableName: this.table, Key: { PK: 'AGREEMENT', SK: 'META' } }),
    );
    if (!Item) return null;
    return AgreementMetaSchema.parse(Item);
  }

  async putAgreementMeta(meta: AgreementMeta): Promise<void> {
    AgreementMetaSchema.parse(meta);
    await this.db.send(
      new PutCommand({
        TableName: this.table,
        Item: { PK: 'AGREEMENT', SK: 'META', ...meta },
      }),
    );
  }

  // ---------- Pricing rules ----------

  async listPricingRules(): Promise<PricingRule[]> {
    const { Items } = await this.db.send(
      new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: { ':pk': 'AGREEMENT', ':prefix': 'RULE#' },
      }),
    );
    return (Items ?? []).map((i) => PricingRuleSchema.parse(i));
  }

  async upsertPricingRule(rule: PricingRule): Promise<void> {
    PricingRuleSchema.parse(rule);
    await this.db.send(
      new PutCommand({
        TableName: this.table,
        Item: { PK: 'AGREEMENT', SK: `RULE#${rule.ruleId}`, ...rule },
      }),
    );
  }

  async deletePricingRule(ruleId: string): Promise<void> {
    await this.db.send(
      new DeleteCommand({
        TableName: this.table,
        Key: { PK: 'AGREEMENT', SK: `RULE#${ruleId}` },
      }),
    );
  }

  // ---------- Snapshot + achievements ----------

  async getLatestSnapshot(): Promise<Snapshot | null> {
    const { Item } = await this.db.send(
      new GetCommand({ TableName: this.table, Key: { PK: 'SNAPSHOT', SK: 'LATEST' } }),
    );
    if (!Item) return null;
    return SnapshotSchema.parse(Item);
  }

  async listAchievements(): Promise<DetectedAchievement[]> {
    const { Items } = await this.db.send(
      new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': 'ACHIEVEMENT' },
      }),
    );
    return (Items ?? []) as DetectedAchievement[];
  }

  // ---------- Payments (payer-write) ----------

  async listPayments(): Promise<Payment[]> {
    const { Items } = await this.db.send(
      new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': 'PAYMENT' },
        ScanIndexForward: false, // newest first
      }),
    );
    return (Items ?? []).map((i) => PaymentSchema.parse(i));
  }

  async recordPayment(payment: Payment): Promise<void> {
    PaymentSchema.parse(payment);
    await this.db.send(
      new PutCommand({
        TableName: this.table,
        Item: { PK: 'PAYMENT', SK: `${payment.paidAt}#${payment.paymentId}`, ...payment },
      }),
    );
  }

  // ---------- Requests (player-write) ----------

  async listRequests(): Promise<PaymentRequest[]> {
    const { Items } = await this.db.send(
      new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': 'REQUEST' },
        ScanIndexForward: false,
      }),
    );
    return (Items ?? []).map((i) => PaymentRequestSchema.parse(i));
  }

  async submitPaymentRequest(req: PaymentRequest): Promise<void> {
    PaymentRequestSchema.parse(req);
    await this.db.send(
      new PutCommand({
        TableName: this.table,
        Item: { PK: 'REQUEST', SK: `${req.requestedAt}#${req.requestId}`, ...req },
      }),
    );
  }

  async setPaymentRequestStatus(
    req: PaymentRequest,
    status: PaymentRequest['status'],
  ): Promise<void> {
    const next: PaymentRequest = { ...req, status };
    await this.db.send(
      new PutCommand({
        TableName: this.table,
        Item: { PK: 'REQUEST', SK: `${req.requestedAt}#${req.requestId}`, ...next },
      }),
    );
  }

  async deletePaymentRequest(req: PaymentRequest): Promise<void> {
    await this.db.send(
      new DeleteCommand({
        TableName: this.table,
        Key: { PK: 'REQUEST', SK: `${req.requestedAt}#${req.requestId}` },
      }),
    );
  }

  // ---------- Inbox ----------

  async deleteInboxEntry(recipient: Recipient, eventId: string): Promise<void> {
    await this.db.send(
      new DeleteCommand({
        TableName: this.table,
        Key: { PK: `INBOX#${recipient}`, SK: eventId },
      }),
    );
  }

  /** Bulk-delete via BatchWriteItem (25 per call). */
  async deleteInboxEntries(recipient: Recipient, eventIds: readonly string[]): Promise<void> {
    if (eventIds.length === 0) return;
    for (let i = 0; i < eventIds.length; i += 25) {
      const chunk = eventIds.slice(i, i + 25);
      await this.db.send(
        new BatchWriteCommand({
          RequestItems: {
            [this.table]: chunk.map((eventId) => ({
              DeleteRequest: { Key: { PK: `INBOX#${recipient}`, SK: eventId } },
            })),
          },
        }),
      );
    }
  }

  async listInbox(recipient: Recipient): Promise<InboxEntry[]> {
    const { Items } = await this.db.send(
      new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': `INBOX#${recipient}` },
        ScanIndexForward: false,
      }),
    );
    return (Items ?? []).map((i) => ({
      eventId: String(i.SK),
      subject: String(i.subject ?? ''),
      message: String(i.message ?? ''),
      refId: typeof i.refId === 'string' ? i.refId : null,
    }));
  }
}
