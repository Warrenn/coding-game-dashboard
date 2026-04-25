# coding-game-dashboard

Two-party ledger that tracks payments owed to a CodinGame player based on
verified achievements. Records what is owed and what has been paid; does not
move money.

See [STRATEGY.md](./STRATEGY.md) for the full plan and
[DECISIONS.md](./DECISIONS.md) for judgment calls made during autonomous work.

## Architecture

- **Frontend**: Vite + React + TypeScript on S3 behind CloudFront (private
  bucket via Origin Access Control)
- **Auth**: Cognito Identity Pool federated with Google
- **Storage**: DynamoDB single-table with row-level IAM via
  `dynamodb:LeadingKeys`
- **Server work**: one Node 20 Lambda Function URL with `AWS_IAM` auth — no
  API Gateway (avoids the 12-month free-tier cliff)
- **Notifications**: SNS email + in-app inbox
- **IaC**: CloudFormation, deployed to `us-east-1`
- **Cost target**: $0/month steady state

## Repo layout

```
shared/                   types + zod schemas, source-only @cgd/shared
web/                      Vite + React + TS app (@cgd/web)
lambda/                   Node 20 Lambda handler (@cgd/lambda)
tools/mock-codingame/     local Express simulator (@cgd/mock-codingame)
infra/                    CloudFormation YAML
```

## Local development

```sh
npm install
npm run typecheck    # tsc --noEmit across all workspaces
npm test             # jest across all workspaces
```

The full local dev loop (Vite + DDB Local + Lambda-as-Express + Mock
CodinGame, all under one `npm run dev`) lands in later steps.

## Deploy

CloudFormation deploy via `aws cloudformation deploy --profile busyweb
--region us-east-1`. Stack details land in Step 14 of STRATEGY.md.
