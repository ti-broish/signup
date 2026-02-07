# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Rules

- Keep CLAUDE.md files short. If you need to add rules, be concise.
- Bulgarian language is used for user-facing strings and form values. Do not translate them.
- pnpm monorepo: `form/`, `submit/`, `export/` — each has its own CLAUDE.md with package-specific details.

## Commands

```bash
pnpm dev                  # Run form (:3000) + submit (:8787) locally
pnpm test                 # Run all tests (vitest watch mode)
pnpm build                # Build all packages
pnpm test:coverage        # Tests with coverage (90% lines/functions/statements, 85% branches)
```

### Run tests for a single package

```bash
pnpm --filter @signup/form test -- --run
pnpm --filter @signup/submit test -- --run
pnpm --filter @signup/export test -- --run
```

