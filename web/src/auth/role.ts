// Derive the app role from an STS assumed-role ARN.
// Format: arn:aws:sts::<account>:assumed-role/<role-name>/<session>
import type { Role } from './types.js';

export function roleFromAssumedRoleArn(arn: string | undefined): Role | null {
  if (!arn) return null;
  const m = /assumed-role\/([^/]+)\//.exec(arn);
  if (!m) return null;
  const name = m[1].toLowerCase();
  if (name.endsWith('-payer')) return 'PAYER';
  if (name.endsWith('-player')) return 'PLAYER';
  return null;
}
