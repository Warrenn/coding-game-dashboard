import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import type { AgreementMeta, Payment, PaymentRequest, PricingRule } from '@cgd/shared';
import { WebLedger } from '../../src/data/ledger.js';

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => ddbMock.reset());

function makeLedger(): WebLedger {
  return new WebLedger('test-table', DynamoDBDocumentClient.from(new DynamoDBClient({})));
}

const NOW = '2026-04-25T12:00:00.000Z';

const SAMPLE_AGREEMENT: AgreementMeta = {
  handle: 'mock-active',
  currency: 'USD',
  updatedAt: NOW,
};

const SAMPLE_RULE: PricingRule = {
  ruleId: 'r1',
  kind: 'badge-level',
  level: 'GOLD',
  unitPrice: 10,
};

const SAMPLE_PAYMENT: Payment = {
  paymentId: 'pay-1',
  paidAt: NOW,
  totalAmount: 30,
  currency: 'USD',
  lineItems: [
    {
      achievementKey: 'BADGE#X',
      unitPriceAtPayment: 10,
      quantity: 3,
      description: 'three GOLD badges',
    },
  ],
};

const SAMPLE_REQUEST: PaymentRequest = {
  requestId: 'req-1',
  requestedAt: NOW,
  achievementKeys: ['BADGE#X'],
  totalAmount: 10,
  currency: 'USD',
  status: 'PENDING',
};

describe('WebLedger', () => {
  describe('getAgreementMeta', () => {
    it('returns null when not present', async () => {
      ddbMock.on(GetCommand).resolves({});
      expect(await makeLedger().getAgreementMeta()).toBeNull();
    });

    it('parses and returns the META row', async () => {
      ddbMock
        .on(GetCommand)
        .resolves({ Item: { PK: 'AGREEMENT', SK: 'META', ...SAMPLE_AGREEMENT } });
      const got = await makeLedger().getAgreementMeta();
      expect(got).toEqual(SAMPLE_AGREEMENT);
    });
  });

  describe('putAgreementMeta', () => {
    it('writes to AGREEMENT/META', async () => {
      ddbMock.on(PutCommand).resolves({});
      await makeLedger().putAgreementMeta(SAMPLE_AGREEMENT);
      const call = ddbMock.commandCalls(PutCommand)[0];
      expect(call.args[0].input.Item?.PK).toBe('AGREEMENT');
      expect(call.args[0].input.Item?.SK).toBe('META');
    });

    it('rejects invalid agreement input (empty handle)', async () => {
      ddbMock.on(PutCommand).resolves({});
      await expect(
        makeLedger().putAgreementMeta({ handle: '', currency: 'USD', updatedAt: NOW }),
      ).rejects.toThrow();
    });
  });

  describe('listPricingRules', () => {
    it('queries with begins_with(SK, "RULE#") and parses results', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [{ PK: 'AGREEMENT', SK: 'RULE#r1', ...SAMPLE_RULE }],
      });
      const rules = await makeLedger().listPricingRules();
      expect(rules).toEqual([SAMPLE_RULE]);

      const call = ddbMock.commandCalls(QueryCommand)[0];
      expect(call.args[0].input.KeyConditionExpression).toContain('begins_with');
      expect(call.args[0].input.ExpressionAttributeValues).toMatchObject({
        ':pk': 'AGREEMENT',
        ':prefix': 'RULE#',
      });
    });

    it('returns empty array when no rules', async () => {
      ddbMock.on(QueryCommand).resolves({});
      expect(await makeLedger().listPricingRules()).toEqual([]);
    });
  });

  describe('upsertPricingRule', () => {
    it('writes to AGREEMENT/RULE#<ruleId>', async () => {
      ddbMock.on(PutCommand).resolves({});
      await makeLedger().upsertPricingRule(SAMPLE_RULE);
      const call = ddbMock.commandCalls(PutCommand)[0];
      expect(call.args[0].input.Item?.PK).toBe('AGREEMENT');
      expect(call.args[0].input.Item?.SK).toBe('RULE#r1');
    });
  });

  describe('listAchievements', () => {
    it('queries by PK=ACHIEVEMENT', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [
          {
            achievementKey: 'BADGE#X',
            category: 'BADGE',
            title: 'X',
            level: 'GOLD',
            detectedAt: NOW,
            metadata: {},
          },
        ],
      });
      const got = await makeLedger().listAchievements();
      expect(got).toHaveLength(1);
      expect(got[0].achievementKey).toBe('BADGE#X');
    });
  });

  describe('payments', () => {
    it('listPayments queries newest first (ScanIndexForward=false)', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [{ PK: 'PAYMENT', SK: `${NOW}#pay-1`, ...SAMPLE_PAYMENT }],
      });
      const got = await makeLedger().listPayments();
      expect(got).toEqual([SAMPLE_PAYMENT]);
      const call = ddbMock.commandCalls(QueryCommand)[0];
      expect(call.args[0].input.ScanIndexForward).toBe(false);
    });

    it('recordPayment writes timestamp + paymentId as SK', async () => {
      ddbMock.on(PutCommand).resolves({});
      await makeLedger().recordPayment(SAMPLE_PAYMENT);
      const call = ddbMock.commandCalls(PutCommand)[0];
      expect(call.args[0].input.Item?.PK).toBe('PAYMENT');
      expect(call.args[0].input.Item?.SK).toBe(`${NOW}#pay-1`);
    });

    it('rejects payment with no line items', async () => {
      ddbMock.on(PutCommand).resolves({});
      await expect(
        makeLedger().recordPayment({ ...SAMPLE_PAYMENT, lineItems: [] }),
      ).rejects.toThrow();
    });
  });

  describe('requests', () => {
    it('submitPaymentRequest writes to REQUEST partition', async () => {
      ddbMock.on(PutCommand).resolves({});
      await makeLedger().submitPaymentRequest(SAMPLE_REQUEST);
      const call = ddbMock.commandCalls(PutCommand)[0];
      expect(call.args[0].input.Item?.PK).toBe('REQUEST');
      expect(call.args[0].input.Item?.SK).toBe(`${NOW}#req-1`);
    });

    it('listRequests parses returned items', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [{ PK: 'REQUEST', SK: `${NOW}#req-1`, ...SAMPLE_REQUEST }],
      });
      const got = await makeLedger().listRequests();
      expect(got).toEqual([SAMPLE_REQUEST]);
    });
  });

  describe('inbox', () => {
    it('listInbox(PAYER) queries INBOX#PAYER partition', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [
          {
            PK: 'INBOX#PAYER',
            SK: `${NOW}#evt-1`,
            subject: 'Payment requested',
            message: 'pay me',
            refId: 'req-1',
          },
        ],
      });
      const got = await makeLedger().listInbox('PAYER');
      expect(got).toEqual([
        {
          eventId: `${NOW}#evt-1`,
          subject: 'Payment requested',
          message: 'pay me',
          refId: 'req-1',
        },
      ]);
      const call = ddbMock.commandCalls(QueryCommand)[0];
      expect(call.args[0].input.ExpressionAttributeValues).toMatchObject({
        ':pk': 'INBOX#PAYER',
      });
    });
  });
});
