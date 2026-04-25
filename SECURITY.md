# SECURITY — coding-game-dashboard

Hardening pass run on 2026-04-25. The list below maps each item from the
STRATEGY.md security checklist to evidence and any open follow-ups.

## Static / IaC checks

| Control                                      | Status | Evidence                                                                                                                                                                                                                                                       |
| -------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S3 bucket private (BlockPublicAccess on)     | ✅     | `infra/hosting.yaml` `PublicAccessBlockConfiguration` all four flags `true`; `OwnershipControls: BucketOwnerEnforced` (no ACLs at all)                                                                                                                         |
| S3 default SSE on                            | ✅     | `BucketEncryption.ServerSideEncryptionByDefault.SSEAlgorithm: AES256`                                                                                                                                                                                          |
| S3 access only via CloudFront OAC            | ✅     | `StaticBucketPolicy` allows only `cloudfront.amazonaws.com` with `aws:SourceArn = distribution`; otherwise denied. Plus a deny-on-non-TLS clause covers any future grants                                                                                      |
| CloudFront enforces HTTPS                    | ✅     | `ViewerProtocolPolicy: redirect-to-https`, `MinimumProtocolVersion: TLSv1.2_2021`                                                                                                                                                                              |
| HSTS, X-CTO, Referrer-Policy, Frame-Options  | ✅     | `SecurityHeadersPolicy` in `infra/hosting.yaml`: HSTS 1y + includeSubdomains + preload, FrameOptions DENY, Referrer-Policy strict-origin-when-cross-origin, ContentTypeOptions nosniff                                                                         |
| Strict CSP                                   | ✅     | CSP allowlists `'self'` + Cognito + DynamoDB + Google Identity Services + Lambda Function URL host (parameterised). No `'unsafe-eval'`. `'unsafe-inline'` only on style-src (acceptable for React; tightenable later via nonces)                               |
| Permissions-Policy minimal                   | ✅     | Disables accelerometer, camera, geolocation, gyroscope, magnetometer, microphone, payment, usb                                                                                                                                                                 |
| Cross-Origin-Opener/Resource-Policy          | ✅     | Both set to `same-origin`                                                                                                                                                                                                                                      |
| Cognito: no unauthenticated identities       | ✅     | `AllowUnauthenticatedIdentities: false` in `IdentityPool`                                                                                                                                                                                                      |
| Cognito: no default authenticated role       | ✅     | `Roles: {}` on `IdentityPoolRoleAttachment` — only role-mapped identities can assume                                                                                                                                                                           |
| Cognito: deny-by-default for unmapped emails | ✅     | `AmbiguousRoleResolution: Deny` plus only PayerEmail / PlayerEmail mapped                                                                                                                                                                                      |
| DynamoDB row-level IAM via LeadingKeys       | ✅     | Both PayerRole and PlayerRole policies use `ForAllValues:StringEquals` with explicit PK lists. Schema is designed so write-scoped PKs are role-distinct (AGREEMENT/PAYMENT payer-only; REQUEST player-only; lambda-only PKs separate)                          |
| DynamoDB encryption at rest                  | ✅     | `SSESpecification.SSEEnabled: true` (AWS-owned KMS key — free tier compatible)                                                                                                                                                                                 |
| DynamoDB PITR enabled                        | ✅     | `PointInTimeRecoverySpecification.PointInTimeRecoveryEnabled: true`                                                                                                                                                                                            |
| Lambda Function URL auth                     | ✅     | `AuthType: AWS_IAM`. Permission resource `FunctionUrlAuthType: AWS_IAM` (never `NONE`)                                                                                                                                                                         |
| Lambda execution role least-privilege        | ✅     | Scoped `dynamodb:GetItem/Query` on `{AGREEMENT,SNAPSHOT,ACHIEVEMENT}` PKs; `dynamodb:PutItem/UpdateItem/DeleteItem` on `{SNAPSHOT,ACHIEVEMENT,INBOX#PAYER,INBOX#PLAYER}` PKs; `sns:Publish` on the one topic; logs only on its own log group. No `*` resources |
| Logs retention                               | ✅     | 14-day retention (no orphan log accumulation)                                                                                                                                                                                                                  |
| SNS encryption                               | ✅     | `KmsMasterKeyId: alias/aws/sns`                                                                                                                                                                                                                                |
| No secrets in code or env                    | ✅     | grep confirmed: no API keys, no client secrets. Google OAuth uses public client ID only (PKCE flow handled by GIS / Cognito)                                                                                                                                   |
| Input validation at trust boundaries         | ✅     | `zod` parses every Lambda input; every DDB write in WebLedger validates input first; CodinGame raw responses parsed via zod                                                                                                                                    |
| TypeScript `strict: true`                    | ✅     | `tsconfig.base.json` extends to all packages                                                                                                                                                                                                                   |

## npm audit

```
6 vulnerabilities (4 low, 2 moderate, 0 high, 0 critical)
```

| Package                  | Severity | Path                        | Disposition                                                                                                                                                                                                     |
| ------------------------ | -------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `esbuild`                | moderate | dev (Vite + Lambda bundler) | Affects only dev server (`vite`/`vitest`) — known [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99). Production bundle is not affected. **Accepted risk** — fix requires Vite major bump |
| `vite`                   | moderate | dev only                    | Same root cause as esbuild. **Accepted risk**                                                                                                                                                                   |
| `jsdom`                  | low      | test only                   | Pulls in `@tootallnate/once` / `http-proxy-agent`. **Accepted risk** — no production exposure                                                                                                                   |
| `jest-environment-jsdom` | low      | test only                   | Same root cause as jsdom. **Accepted risk**                                                                                                                                                                     |
| `@tootallnate/once`      | low      | test only                   | Transitive via jsdom. **Accepted risk**                                                                                                                                                                         |
| `http-proxy-agent`       | low      | test only                   | Transitive via jsdom. **Accepted risk**                                                                                                                                                                         |

**No critical or high severity findings.** All findings are dev/test-only
transitive dependencies; none ship in the production bundle.

## CFN validation

`scripts/validate-cfn.sh` runs `aws cloudformation validate-template` plus
`cfn-lint` over every `infra/*.yaml`. All three templates pass clean.

## CSP runtime verification

Pending Step 14 deploy + browser test. Will be verified by opening
`https://<cloudfront>/` in Chromium devtools and confirming no CSP
violations during sign-in + agreement + payment flows. Documented as a
post-deploy task in DEPLOY.md.

## Residual risks / known limitations

1. **Google OAuth client ID not yet provisioned.** Deploy parameter
   `GoogleClientId` defaults to `REPLACE_BEFORE_AUTH_USE`. Sign-in will
   fail until the user provisions a Google Cloud OAuth Web Client and
   updates the stack parameter. Documented in DECISIONS.md.
2. **`'unsafe-inline'` on `style-src`.** React's inline `style` attributes
   require it; eliminating would require migrating to CSS-only / styled-
   components with nonces. Low practical risk; tightenable post-MVP.
3. **CSP `connect-src` includes a wildcard for the Lambda URL host until
   deploy.** The deploy will replace the parameter with the exact host.
4. **`dynamodb:LeadingKeys` only enforces partition key matches.** No
   item-attribute-level constraints. Schema design (role-distinct PK
   prefixes) is the mitigation; verified by IAM policy review.
5. **No row-level audit log of who-changed-what.** Adding a `lastWriter`
   attribute on every write is straightforward future work.
6. **CodinGame endpoint drift.** Three undocumented endpoints; mock
   server + zod parse layers surface breakage early. Fallback: manual
   entry. Documented in STRATEGY.md.
7. **Lambda `AllowOrigins: '*'`.** With `AWS_IAM` auth, requests must be
   SigV4-signed regardless of CORS, so this is safe but should be
   tightened to the CloudFront domain after Step 14 deploy.
8. **No rate limiting on the Lambda Function URL.** If credentials leak,
   an attacker could exhaust the 1M-request free tier. AWS billing alarms
   are recommended (not in scope at MVP).

## Follow-up post-deploy (Step 14)

- [ ] Verify CSP via Chromium devtools (no violations on golden path)
- [ ] Tighten `connect-src` Lambda host to exact value
- [ ] Tighten Lambda CORS `AllowOrigins` to CloudFront domain
- [ ] Provision Google OAuth client; update `GoogleClientId` parameter
- [ ] Confirm payer's SNS email subscription (click link in confirmation
      email)
- [ ] Set up an AWS budget alert (e.g. $1/month) to catch unexpected costs
