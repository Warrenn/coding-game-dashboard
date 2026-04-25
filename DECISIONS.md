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

## Reverting

If a decision is wrong, the simplest path is `git revert` the commit that
introduced the change. Each step lands as one commit so the history is
bisectable.
