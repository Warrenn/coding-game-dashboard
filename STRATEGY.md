# STRATEGY — coding-game-dashboard

## Goal

Build a two-party ledger web app that tracks payments owed to a CodinGame player based on
verified achievements on https://www.codingame.com/. The system records what is owed and
what has been paid; it does not move money. It must run on AWS at the lowest possible cost
(free tier wherever possible) with security as a top priority.

## Requirements (from brief + clarifications)

### Roles

- **Payer/Admin** (single role): a Google-authenticated user. Owns the agreement: sets the
  player's CodinGame handle, defines the payable categories, sets and changes prices,
  records payments.
- **Player**: a Google-authenticated user. Read-only on the agreement and prices. Sees own
  achievements + paid/outstanding amounts. Can request a payout.

Both Google accounts are wired in as CloudFormation parameters (`PayerEmail`,
`PlayerEmail`); no signup flow.

### Functional

- **Configurable agreement (admin-only edit)**: CodinGame handle to verify, plus the
  payable categories and per-unit prices.
- **MVP achievements (auto-verified only)**: every achievement type the MVP supports must
  be retrievable from CodinGame's public endpoints without authentication. Specifically:
  - **Badges (`Achievement/findByCodingamerId`)** — each badge unlocked is a payable item;
    price can vary by `level` (PLATINUM/GOLD/SILVER/BRONZE).
  - **Overall rank thresholds** — admin defines tiers (e.g. "top 10k = $X, top 1k = $Y");
    payable when rank crosses a threshold. Source: `findCodingamePointsStatsByHandle.rank`.
  - **XP milestones** — admin defines milestones (e.g. "every 1000 XP"); payable when XP
    crosses each one. Source: same call's `xp` field.
  - **Clash of Code rank thresholds** — same threshold pattern. Source:
    `ClashOfCode/getClashRankByCodinGamerId.rank`.
- **Deferred (post-MVP)**: certifications (no working public endpoint; would require
  player-supplied cert URLs), puzzle-by-puzzle solved list (auth-required), per-game bot
  battle ranks (auth-required).
- **Player view**: list of achievements (one row per detected unit) showing paid vs
  outstanding amounts. "Request payment" action.
- **Payer view**: outstanding list, payment history, request inbox, "Record payment" form.
- **Notifications**: when the player requests payment → SNS email to payer + durable
  in-app inbox row.

### Non-functional

- **Cost**: free tier; target $0/month steady state.
- **Security**: defence in depth — least-priv IAM, encryption at rest + in transit, no
  public buckets, per-user data isolation, hardened CSP.
- **Theme**: codingame.com-inspired (dark navy, neon orange/teal, monospace).
- **IaC**: CloudFormation only.
- **TDD-able locally**: full local dev loop without hitting real CodinGame or real AWS.

## Approach

### Architecture (one diagram in words)

```
Browser (Vite/React/TS) ──┬── Cognito Identity Pool ←── Google OAuth (federated)
                          │
                          ├── DynamoDB (SigV4 with Cognito creds) — single-table design
                          │
                          └── Lambda Function URL (AWS_IAM auth)
                                     │
                                     └── fetches public CodinGame /services/* endpoints,
                                         normalises to a snapshot, returns JSON
                          ↑
SNS topic ── email ────── Lambda also publishes "payment-requested" events

Static assets: S3 (private, OAC) ←── CloudFront (HSTS + strict CSP response headers policy)
```

### Verified CodinGame endpoint flow

Confirmed live as of 2026-04-25, no auth required:

1. `POST /services/CodinGamer/findCodingamePointsStatsByHandle` body `["<handle>"]` →
   pseudo, country, level, **xp**, **rank**, achievementCount, codingamerPoints,
   rankHistory, **numeric `userId`**.
2. `POST /services/Achievement/findByCodingamerId` body `[<userId>]` → array of badges
   (`id`, `title`, `description`, `points`, `level`, `progress`, `progressMax`,
   `completionTime`).
3. `POST /services/ClashOfCode/getClashRankByCodinGamerId` body `[<userId>]` →
   `{rank, totalPlayers}`.

Cross-origin POST to these returns **HTTP 403 from Cloudflare**, so a Lambda is mandatory
(no browser-only path). `robots.txt` disallows `/services/`; we mitigate with low
volume + identifying User-Agent + cache (see Legal posture).

### Key decisions

1. **Lambda Function URL with `AWS_IAM` auth, not API Gateway.** Function URLs are
   forever-free; API Gateway free tier expires after 12 months. SigV4 via the user's
   Cognito creds keeps auth strong.
2. **Single-table DynamoDB with row-level IAM.** Cognito Identity Pool issues per-role
   credentials (`PlayerRole`, `PayerRole`) with `dynamodb:LeadingKeys` so each role can
   only touch its allowed key prefixes. No middleware authz.
3. **Two roles wired by email at deploy time.** CFN parameters `PayerEmail` /
   `PlayerEmail` map Google identities to roles via Cognito role-mapping on the `email`
   claim. No signup flow.
4. **CloudFront → S3 with OAC, bucket fully private.** Response-headers policy with HSTS,
   strict CSP allowlisting only `'self'` + Cognito + Lambda Function URL hosts.
5. **Lambda is read-only against CodinGame**, no creds stored. Receives handle from
   agreement record, calls the three verified endpoints, returns a normalised snapshot.
   Snapshot cached in DynamoDB with 15-min TTL; refresh on user click otherwise.
6. **No custom domain** at MVP (saves Route 53's $0.50/mo). CFN-only change to add later.
7. **Single CloudFormation stack.** Small blast radius; faster deploy.
8. **Prices are immutable on payment records.** When a payment is recorded, the unit price
   for each line item is **frozen into the payment row**. Subsequent agreement price
   changes do not retroactively change historical payments. Outstanding (unpaid)
   achievements use the **current** agreement price until the payment is recorded.
9. **Achievement detection is idempotent + append-only.** Each detected achievement gets a
   stable `achievementKey` (e.g. `BADGE#<badgeId>`, `XP#10000`, `RANK#TOP-1000`). The
   ledger stores one row per key. Re-running the fetcher never duplicates rows.
10. **Local CodinGame simulator** (`tools/mock-codingame/`). The Lambda's CodinGame base
    URL is configurable via env var (`CODINGAME_BASE_URL`, default real site). The mock
    server speaks the same `/services/*` shapes from captured fixtures, so the Lambda is
    tested locally and CI runs hermetically. Detail in **Local development** below.

### Data model (DynamoDB single table)

PK / SK pattern (string types). All entries use `LeadingKeys` for IAM scoping.

| PK | SK | Owner write | Description |
|---|---|---|---|
| `AGREEMENT` | `META` | payer | Handle, currency, audit info |
| `AGREEMENT` | `RULE#<ruleId>` | payer | One pricing rule (e.g. badge level → price) |
| `SNAPSHOT` | `LATEST` | lambda | Last fetch result; `ttl` attribute set by Lambda |
| `ACHIEVEMENT` | `<achievementKey>` | lambda | One detected achievement, with `detectedAt` and `unitPriceAtDetection` (informational only — pricing is recomputed on display) |
| `REQUEST` | `<ts>#<requestId>` | player | Payment request from player |
| `PAYMENT` | `<ts>#<paymentId>` | payer | Recorded payment; embeds line items as `{achievementKey, unitPriceAtPayment, quantity}` (immutable) |
| `INBOX#<recipient>` | `<ts>#<eventId>` | lambda | In-app notification rows |

`recipient` is `PAYER` or `PLAYER`. IAM policy gives PlayerRole write only to
`PK = REQUEST` (and read on the rest); PayerRole gets write on `PK in {AGREEMENT,
PAYMENT}`. The Lambda's role writes `SNAPSHOT`, `ACHIEVEMENT`, and `INBOX#*`.

### Parallelism assessment

Fresh repo, deeply intertwined first steps (frontend depends on infra IDs; Lambda depends
on data model; data model is shared). Decomposition produces only one disjoint pair
(infra vs frontend) and the frontend can't be exercised meaningfully until infra exists.
**Run serially.** Revisit for post-MVP work.

### Cost ledger (forever-free targets)

| Service | Free tier | Expected use | Headroom |
|---|---|---|---|
| S3 | 5 GB / 12 mo | <50 MB | ample |
| CloudFront | 1 TB out + 10M reqs forever | tiny | enormous |
| Cognito Identity Pool | always free | 2 users | n/a |
| DynamoDB | 25 GB + 25 RCU/25 WCU forever | <10 MB | enormous |
| Lambda | 1M reqs + 400k GB-s forever | <2k reqs/mo | enormous |
| SNS | 1k email + 1M reqs forever | <50 emails/mo | ample |
| CloudWatch Logs | 5 GB/mo forever | minimal | ample |

Net target: **$0/month** steady state.

### Security checklist (applied throughout)

- S3 bucket private, OAC only, BlockPublicAccess on, default SSE.
- CloudFront response-headers policy: HSTS (1y, includeSubdomains, preload), strict CSP,
  X-Content-Type-Options, Referrer-Policy `strict-origin-when-cross-origin`, minimal
  Permissions-Policy.
- Cognito Identity Pool: role mapping by `email` claim → `PayerRole` / `PlayerRole`. No
  default authenticated role (deny-by-default).
- DynamoDB IAM via `dynamodb:LeadingKeys` so each role can only touch its rows.
- Lambda URL `AWS_IAM` only — never `NONE`.
- Lambda execution role: scoped `dynamodb:GetItem`/`PutItem`/`Query` to specific PKs and
  `sns:Publish` on the one topic; no `*` resources.
- No secrets. Google OAuth client ID is public; PKCE via Cognito.
- `npm audit` in CI, lockfiles committed.
- TypeScript `strict: true` on all packages.
- `zod` validation at every trust boundary (Lambda input, DynamoDB writes, Lambda output).

### Legal / etiquette posture toward CodinGame

- **User-consented self-verification only**: the player's own handle, supplied by the
  admin in the agreement, with the player's explicit agreement displayed in-app at
  first run.
- **Low frequency**: snapshot cached 15 min minimum; the "refresh" button is rate-limited
  to once per 15 min per user.
- **Identifying User-Agent**: `coding-game-dashboard/<version> (+<repo URL>)` so CodinGame
  ops can identify and contact us.
- **No crawling**: only the configured handle is ever fetched.
- **Public-data only**: never any auth-required endpoints; hard-coded allowlist of 3
  endpoints.
- **Honor failure modes**: if CodinGame returns 403/429, Lambda surfaces a clear error to
  the user and stops; no retries beyond a single backoff.
- **Documented in-app**: a settings/legal page summarises this posture so users
  understand what is fetched and why.

### Local development simulator

A faithful local replacement for the CodinGame `/services/*` endpoints, in-repo at
`tools/mock-codingame/`.

- **Server**: tiny Node/Express app (no extra runtime deps). Routes:
  - `POST /services/CodinGamer/findCodingamePointsStatsByHandle`
  - `POST /services/Achievement/findByCodingamerId`
  - `POST /services/ClashOfCode/getClashRankByCodinGamerId`
- **Fixture-driven**: `tools/mock-codingame/fixtures/<handle>/{stats,achievements,clashRank}.json`
  populated from one real captured response (verbatim, anonymised if needed) plus
  hand-authored variants.
- **Built-in test handles**:
  - `mock-active` — full population (multiple badges of varying level, mid rank, mid XP).
  - `mock-empty` — valid user, zero achievements (boundary).
  - `mock-not-found` — returns CodinGame's real 422 error shape.
  - `mock-cloudflare-blocked` — returns 403 with Cloudflare-shaped HTML body.
  - `mock-slow` — adds 30s delay (timeout test).
- **Configuration**: Lambda reads `CODINGAME_BASE_URL` from env. CFN sets it to the real
  site. `npm run dev` for local sets it to `http://localhost:4000`.
- **Seed fixture**: captured once from the live profile
  `https://www.codingame.com/profile/ddc52ca3f0b26475dc7cc96153dbdf803390791` — the
  payer's own Google-linked CodinGame account. Verbatim JSON responses are committed at
  `tools/mock-codingame/fixtures/seed/` and serve as the source-of-truth for response
  shape. Hand-authored variants build on top of seed.
- **Test integration**:
  - Unit: parser tests against fixture JSON files directly (no HTTP).
  - Integration (Lambda): Jest `globalSetup` boots the mock server on a free port; tests
    set `CODINGAME_BASE_URL` and run the Lambda handler with real `fetch`.
  - End-to-end (web): Vite dev script proxies the Lambda Function URL to a locally-run
    Lambda handler (Express wrapper) that itself hits the mock server, plus DynamoDB
    Local (Docker, official `amazon/dynamodb-local` image) for storage. One
    `npm run dev` brings up via `docker compose`: Vite (5173) + DDB Local (8000) +
    Lambda-as-Express (4001) + Mock CodinGame (4000).

This makes the entire data flow runnable and TDD-able with zero AWS calls and zero real
CodinGame calls.

## Implementation steps

1. **Scaffold repo layout** — `web/` (Vite+React+TS+Jest), `lambda/` (Node 20 + TS +
   Jest), `infra/` (CloudFormation YAML), `tools/mock-codingame/`, `shared/` (types
   + zod schemas), root npm workspaces, `.editorconfig`, `.prettierrc`,
   `tsconfig.base.json`, `README.md`.
2. **Mock CodinGame server** — TDD: write Jest tests asserting the three routes match
   real shapes (using the captured fixture as source-of-truth) and that error/edge
   handles behave correctly, then implement. Capture real fixtures using a script
   `scripts/capture-fixture.ts` (one-time; see "What I need from you").
3. **CloudFormation: storage + identity** — DynamoDB table, Cognito Identity Pool with
   Google IdP, `PayerRole` / `PlayerRole` with leading-key conditions, role-mapping rule
   on `email` claim. Validate with `aws cloudformation validate-template`.
4. **CloudFormation: hosting** — S3 bucket (private, encrypted), CloudFront distribution
   with OAC, response-headers policy with strict CSP/HSTS, default root object.
5. **CloudFormation: lambda + sns** — SNS topic with email subscription parameterised by
   `PayerEmail`, Lambda function (Node 20) + execution role, Function URL with
   `AWS_IAM`, log group with 14-day retention.
6. **Lambda: CodinGame fetcher** — TDD against the mock server. Tests: handle-resolve →
   stats → achievements → clash; handles 422/403/network errors; emits zod-validated
   snapshot; idempotent `achievementKey` generation; SNS publish on payment-request
   trigger.
7. **Web: shared types + AWS clients** — TDD: Jest tests for the DynamoDB data-access
   layer using `aws-sdk-client-mock`; agreement, payment, request, snapshot helpers.
8. **Web: auth shell** — TDD: tests for the `useAuth` hook (signed-out / signing-in /
   signed-in-payer / signed-in-player) with mocked Cognito, then implement Google sign-in
   and role gating.
9. **Web: Agreement page (admin/payer-only edit)** — TDD: read mode for player, full
   edit for payer, validation of pricing rules, immutability of historical payments
   surfaced in UI.
10. **Web: Player view** — TDD: tests for achievement list rendering, paid/outstanding
    computation (current price applied to unpaid; frozen price displayed for paid),
    "Request payment" action.
11. **Web: Payer view** — TDD: tests for outstanding list, request inbox, "Record
    payment" form with explicit line items + frozen prices.
12. **Theme pass** — codingame.com-inspired dark theme: deep navy, neon orange/teal,
    monospace. Pure CSS variables, no UI lib.
13. **Security hardening pass** — verify CSP via browser, run `npm audit`, walk the
    Security checklist, document residual risks.
14. **Deploy + smoke test** — deploy stack, sign in as both roles, exercise the golden
    path, confirm SNS email arrives, confirm DynamoDB rows.

## Test strategy

- **Mock server**: Jest tests assert route shapes against captured fixture (the live
  capture is the spec). One test per route, plus tests for each built-in scenario handle.
- **Lambda parser**: Jest unit tests against fixture JSON.
- **Lambda handler**: Jest integration tests against the mock server (Jest `globalSetup`
  boots it). Asserts achievement-key idempotency, error mapping, snapshot zod schema.
- **Web data layer**: `aws-sdk-client-mock` for DynamoDB.
- **Web components**: Jest + React Testing Library; each view covers empty / populated /
  loading / error states; payer-edit vs. player-read modes.
- **Auth hook**: Jest tests for the four auth states, mocked Cognito client.
- **CloudFormation**: `aws cloudformation validate-template` per template (CFN substitute
  for TDD per Gate 4 rule) and `cfn-lint` if available.
- **Manual smoke test post-deploy**: documented script appended to STRATEGY.md Progress.

## Risks and open questions

- **CodinGame endpoint drift**: the three endpoints we depend on are undocumented and may
  change. Mitigated by: small surface (3 calls), zod-validated parsing surfaces breakage
  early, mock server makes regression coverage cheap. If an endpoint disappears, we fall
  back to admin-recorded manual entry for that category.
- **`dynamodb:LeadingKeys` granularity**: enforces partition-key matching only. Schema
  designed so write-scoped PKs are role-distinct (`AGREEMENT`/`PAYMENT` payer-only,
  `REQUEST` player-only, lambda-only PKs separate). Verified via IAM policy unit tests.
- **`email_verified` requirement**: Cognito role mapping requires the Google account to
  return `email_verified=true`. Both users must use Google accounts that satisfy this.
- **Local Cognito**: hard to mock cleanly. We swap the auth provider behind an interface
  so dev mode reads role from a query string; deployed app uses real Cognito. Documented
  as a known-acceptable test-vs-prod difference.
- **CodinGame ToS ambiguity**: no clearly published consumer ToS forbids automated public
  reads, but `robots.txt` disallows `/services/`. The Legal/etiquette posture above
  (consented self-verification, low frequency, identifying UA) is our best-effort
  good-faith stance. If CodinGame asks us to stop, we stop.

## Locked configuration

- **Seed fixture handle**: `ddc52ca3f0b26475dc7cc96153dbdf803390791` (payer's own
  Google-linked CodinGame profile). Captured public data committed to the repo.
- **Roles**: two only — admin/payer + player.
- **Pricing semantic**: current agreement price on unpaid items; frozen unit price on
  paid line items.
- **Local toolchain**: Docker + DynamoDB Local (`amazon/dynamodb-local`).
- **AWS region**: `us-east-1`.

## Progress

- [ ] Step 1 — Scaffold repo layout
- [ ] Step 2 — Mock CodinGame server with captured fixtures
- [ ] Step 3 — CloudFormation: storage + identity
- [ ] Step 4 — CloudFormation: hosting
- [ ] Step 5 — CloudFormation: lambda + sns
- [ ] Step 6 — Lambda: CodinGame fetcher
- [ ] Step 7 — Web: shared types + AWS clients
- [ ] Step 8 — Web: auth shell
- [ ] Step 9 — Web: Agreement page (admin/payer-only edit)
- [ ] Step 10 — Web: Player view
- [ ] Step 11 — Web: Payer view
- [ ] Step 12 — Theme pass
- [ ] Step 13 — Security hardening pass
- [ ] Step 14 — Deploy + smoke test
