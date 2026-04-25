# DECISIONS — autonomous session 2026-04-25

Judgment calls made while the user is away. Each entry lists the decision, the
reasoning, and how to revert if the user disagrees on return.

## Authorization

- **2026-04-25** — User granted session-scoped consent to proceed through MVP
  autonomously, fetch the configured CodinGame profile (their own,
  `ddc52ca3f0b26475dc7cc96153dbdf803390791`), and deploy to AWS using the
  `busyweb` SSO profile. Authorization is **session-scoped only** — future
  sessions must reconfirm.

## Toolchain

- **AWS region**: deploy to `us-east-1` per STRATEGY.md, even though the
  `busyweb` SSO portal lives in `eu-west-1`. SSO region only affects where
  the IdP is hosted; deploy region is independent. Account `352842384468`,
  Administrator access. Revert: pass `--region <other>` to all `aws` calls
  and update CFN stack region.
- **Node**: dev machine runs Node 23.11.0 but Lambda runtime targets Node 20.
  Each package.json `engines.node` is pinned to `>=20 <23` to keep Lambda
  bundling honest; no Node 23-only features used.
- **Package manager**: npm 11.2.0 with workspaces. No yarn, no pnpm. Reason:
  fewer moving parts; npm workspaces are sufficient for this scope.
- **Module system**: ESM throughout (`"type": "module"`). Lambda is bundled
  by esbuild to a single .mjs at deploy time, so runtime ESM support in
  Node 20 is fine.
- **TS framework**: `tsc --noEmit` for type-checking only; runtime files are
  bundled (Vite for web, esbuild for lambda) or executed via tsx (mock + dev).
- **Test framework**: Jest 29 + ts-jest 29 per global CLAUDE.md convention.
  Web uses jest-environment-jsdom + @testing-library/react.

## Repo layout

- **Single npm-workspaces monorepo** rooted at the repo root. Packages:
  `shared/`, `web/`, `lambda/`, `tools/mock-codingame/`, `infra/`.
- **Workspace naming**: `@cgd/<name>` (cgd = coding-game-dashboard). Packages
  depend on each other via `"@cgd/shared": "*"` etc. — npm symlinks them
  automatically.
- **Shared sources, not builds**: `shared/package.json` exports `./src/index.ts`
  directly. Consumers pick up TS source. Avoids a separate build step in dev
  and keeps types live across boundaries.

## CloudFormation deploy strategy

- **2026-04-25** — Steps 3–5 author CFN templates as separate files but do NOT
  deploy them individually. Single deploy happens at Step 14 with a combined
  template (or nested stacks). This avoids orphaned named-IAM resources and
  duplicate stack collisions. Validation (validate-template + cfn-lint) is
  the TDD substitute for IaC per Gate 4. Revert: deploy each template
  separately as developed (will require renaming roles to avoid collisions).
- **2026-04-25** — `GoogleClientId` parameter has a placeholder default
  (`REPLACE_BEFORE_AUTH_USE`). The Identity Pool resource accepts this; only
  Google sign-in itself fails until the value is replaced. Lets us deploy
  for IAM/DDB review without needing Google credentials in this autonomous
  session. The user must create a Google OAuth Client ID and update the
  parameter via `aws cloudformation update-stack` before sign-in works.

## Lambda code deployment

- **2026-04-25** — `infra/lambda-sns.yaml` ships an inline placeholder (returns 501) via `Code.ZipFile`. The real esbuild bundle is uploaded post-deploy
  via `aws lambda update-function-code`. This decouples stack creation from
  code build and lets the template stand alone for review. The Step 14
  deploy script does: stack-deploy → lambda-build → lambda-update-code.
- **2026-04-25** — Lambda Function URL CORS `AllowOrigins: '*'` at MVP. With
  `AuthType: AWS_IAM`, every request must be SigV4-signed by Cognito-issued
  credentials; CORS does not bypass auth. Tighten to the actual CloudFront
  domain in Step 13/14 once known.
- **2026-04-25** — SNS email subscription requires recipient confirmation.
  PayerEmail will receive a confirmation link from AWS SNS at deploy time;
  no payment-request emails flow until that link is clicked. Documented for
  the user to handle on return.
- **2026-04-25** — Lambda runs on `arm64` (Graviton). Same free-tier limits
  as x86_64 but lower per-ms cost beyond free tier and slightly faster cold
  starts on Node 20 (per AWS benchmarks). Revert to `x86_64` only if a Lambda
  layer or native dep doesn't exist for arm64 (none anticipated for this
  workload).

## Reverting

If a decision is wrong, the simplest path is `git revert` the commit that
introduced the change. Each step lands as one commit so the history is
bisectable.
