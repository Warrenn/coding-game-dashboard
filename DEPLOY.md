# DEPLOY

End-to-end deploy lives in [`scripts/deploy.sh`](./scripts/deploy.sh). It
provisions the three CloudFormation stacks, builds + uploads the Lambda
bundle, and ships the web bundle to S3 + CloudFront.

> **⚠ CloudFront verification blocker (2026-04-25).** First deploy attempt
> on AWS account 352842384468 failed with `Access denied: Your account
must be verified before you can add new CloudFront resources.` This is
> a one-time AWS-side gate for new accounts. **Action: open an AWS
> Support case** (Service: CloudFront, Severity: General Inquiry, ask to
> "enable CloudFront for this account"). Once unblocked, re-run
> `scripts/deploy.sh` — the storage-identity and lambda-sns stacks are
> already up; only the hosting stack will be created and the web bundle
> uploaded. See "Current deployed state" below.

## Prerequisites

- `aws` CLI ≥ v2 with the `busyweb` SSO profile signed in
  (`aws sso login --profile busyweb`)
- `cfn-lint` for template validation (`brew install cfn-lint`)
- Docker (only for local dev — not required for deploy)
- Node 20 / npm 11 (deploy machine)

## First deploy

```sh
PAYER_EMAIL=warrenne@gmail.com \
PLAYER_EMAIL=player-placeholder@example.com \
GOOGLE_CLIENT_ID=REPLACE_BEFORE_AUTH_USE \
./scripts/deploy.sh
```

Three CloudFormation stacks are created:

| Stack                                    | Resources                                                        |
| ---------------------------------------- | ---------------------------------------------------------------- |
| `coding-game-dashboard-storage-identity` | DynamoDB ledger + Cognito Identity Pool + PayerRole + PlayerRole |
| `coding-game-dashboard-hosting`          | S3 (private) + CloudFront + OAC + response-headers policy        |
| `coding-game-dashboard-lambda-sns`       | Lambda + Function URL + SNS topic + log group                    |

Cross-stack values (LedgerTableName, IdentityPoolId, StaticBucketName,
DistributionId, FetcherUrl, …) flow through CloudFormation `Outputs` and
the deploy script reads them via `aws cloudformation describe-stacks`.

CloudFront takes 10–15 minutes to deploy; total wall time is typically
~20 minutes for a clean stack.

## Current deployed state (2026-04-25, autonomous session)

Deployed and verified:

| Resource                                                               | State                                                                                                                                |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| DynamoDB `coding-game-dashboard-ledger`                                | ACTIVE, SSE enabled                                                                                                                  |
| Cognito Identity Pool `us-east-1:a9b0ce89-9b35-43ff-a0c6-81ffeeff5deb` | created, Google provider with placeholder Client ID                                                                                  |
| IAM `coding-game-dashboard-payer` / `-player` roles                    | created                                                                                                                              |
| Lambda `coding-game-dashboard-fetcher`                                 | Active, real bundle uploaded (1.4 MB unzipped)                                                                                       |
| Lambda Function URL                                                    | `https://ndov5c5ele6ae2hqiwiusqfbke0bizbr.lambda-url.us-east-1.on.aws/` (AWS_IAM auth — verified rejects unsigned requests with 403) |
| SNS topic `coding-game-dashboard-payment-requests`                     | created                                                                                                                              |
| SNS email subscription                                                 | **PendingConfirmation** for warrenne@gmail.com                                                                                       |

Not yet deployed (blocked on AWS account CloudFront verification):

| Resource                | Why missing                   |
| ----------------------- | ----------------------------- |
| S3 static bucket        | hosting stack rolled back     |
| CloudFront distribution | account verification required |
| Response headers policy | (in hosting stack)            |

The web bundle has been built locally but not uploaded.

## Post-deploy manual steps

### 1. Confirm the SNS subscription

When the lambda-sns stack lands, AWS sends a confirmation email to
`PAYER_EMAIL`. Click the link in that email — until then, no payment-
request notifications flow.

### 2. Provision the Google OAuth Web Client

1. Open <https://console.cloud.google.com/apis/credentials>
2. Create a new project (or reuse an existing one)
3. Configure the OAuth consent screen (External, your email, etc.)
4. Create credentials → OAuth client ID → Web application
5. Add authorized JavaScript origin: `https://<your-cloudfront-domain>`
   (printed at end of `deploy.sh`)
6. Copy the Client ID (looks like `1234567890-xxx.apps.googleusercontent.com`)

### 3. Re-deploy with the real Google Client ID

```sh
PAYER_EMAIL=warrenne@gmail.com \
PLAYER_EMAIL=player-placeholder@example.com \
GOOGLE_CLIENT_ID=1234567890-xxx.apps.googleusercontent.com \
./scripts/deploy.sh
```

This updates the Cognito `SupportedLoginProviders` and rebuilds the web
bundle with the matching `VITE_GOOGLE_CLIENT_ID`. CloudFront invalidates
on every run.

### 4. Update PlayerEmail (when ready)

If you have a second Google account for the player, swap the placeholder:

```sh
aws cloudformation update-stack \
  --profile busyweb --region us-east-1 \
  --stack-name coding-game-dashboard-storage-identity \
  --use-previous-template \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameters \
    ParameterKey=AppName,UsePreviousValue=true \
    ParameterKey=PayerEmail,UsePreviousValue=true \
    ParameterKey=PlayerEmail,ParameterValue=player@gmail.com \
    ParameterKey=GoogleClientId,UsePreviousValue=true
```

### 5. Smoke test

1. Open `https://<your-cloudfront-domain>/`
2. Sign in with the configured Payer Google account
3. On the Agreement page, set CodinGame handle to your handle, set USD
   currency, save
4. Add at least one Bronze pricing rule with a small unit price (e.g. $0.50)
5. (As player) sign in, click "Refresh from CodinGame"
6. Verify achievements list populates
7. Click "Request payment" — payer SHOULD receive an SNS email
8. (As payer) confirm the request appears in the inbox; check selected
   achievements; record payment
9. (As player) refresh — those achievements should now show "Paid" with
   the frozen price

## Rollback

To completely tear down:

```sh
aws cloudformation delete-stack --profile busyweb --region us-east-1 \
  --stack-name coding-game-dashboard-lambda-sns
aws cloudformation delete-stack --profile busyweb --region us-east-1 \
  --stack-name coding-game-dashboard-hosting
aws cloudformation delete-stack --profile busyweb --region us-east-1 \
  --stack-name coding-game-dashboard-storage-identity
```

Wait for each to complete before deleting the next (storage-identity has
the role names that everything else depends on transitively).

## Cost expectations

All resources are within free tier under the 2-user MVP load:

- DynamoDB: 25 GB + 25 RCU/WCU forever
- Lambda: 1M req/mo + 400k GB-s forever
- SNS: 1k email + 1M req forever
- CloudFront: 1 TB out + 10M req forever
- S3: 5 GB free for 12 mo
- Cognito Identity Pool: free
- CloudWatch Logs: 5 GB/mo free

Net target: **$0/month**. Recommend setting an AWS Budget alert at $1/mo
to catch surprises (not configured by deploy script).
