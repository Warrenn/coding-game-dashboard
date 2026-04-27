import { useMemo } from 'react';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { AwsCredentialIdentity } from '@aws-sdk/types';
import { WebLedger } from './ledger.js';

/**
 * Build a WebLedger instance from the current Cognito credentials. Memoised
 * on credential identity so the underlying DDB client doesn't churn on every
 * render.
 */
export function useLedger(opts: {
  credentials: AwsCredentialIdentity | null;
  region: string;
  tableName: string;
}): WebLedger | null {
  return useMemo(() => {
    if (!opts.credentials || !opts.tableName) return null;
    const ddb = new DynamoDBClient({
      region: opts.region,
      credentials: opts.credentials,
    });
    const doc = DynamoDBDocumentClient.from(ddb);
    return new WebLedger(opts.tableName, doc);
  }, [opts.credentials, opts.region, opts.tableName]);
}
