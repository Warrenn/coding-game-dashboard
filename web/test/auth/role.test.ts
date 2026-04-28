import { roleFromAssumedRoleArn } from '../../src/auth/role.js';

describe('roleFromAssumedRoleArn', () => {
  it('returns PAYER for *-payer role', () => {
    const arn =
      'arn:aws:sts::352842384468:assumed-role/coding-game-dashboard-payer/CognitoIdentity';
    expect(roleFromAssumedRoleArn(arn)).toBe('PAYER');
  });

  it('returns PLAYER for *-player role', () => {
    const arn =
      'arn:aws:sts::352842384468:assumed-role/coding-game-dashboard-player/CognitoIdentity';
    expect(roleFromAssumedRoleArn(arn)).toBe('PLAYER');
  });

  it('returns null when role name does not match either suffix', () => {
    const arn = 'arn:aws:sts::1:assumed-role/some-other-role/Session';
    expect(roleFromAssumedRoleArn(arn)).toBeNull();
  });

  it('returns null for missing or malformed ARN', () => {
    expect(roleFromAssumedRoleArn(undefined)).toBeNull();
    expect(roleFromAssumedRoleArn('not-an-arn')).toBeNull();
    expect(roleFromAssumedRoleArn('')).toBeNull();
  });
});
