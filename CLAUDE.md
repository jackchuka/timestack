# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Vite dev server
pnpm build        # tsc + vite build (single-file output)
pnpm test         # vitest single run
pnpm vitest run tests/timer-engine.test.ts  # run one test file
pnpm build:types  # typecheck (tsc --noEmit)
pnpm lint         # oxlint
pnpm fmt          # oxfmt (write)
pnpm fmt --check .  # oxfmt (check only, for CI)
pnpm knip         # dead code / unused export detection
pnpm tauri:dev    # Tauri desktop app dev mode
pnpm tauri:build  # Tauri desktop app build
```

## After Editing Code

Run the following commands to ensure code quality and correctness after making changes:

```bash
pnpm fmt
pnpm lint
pnpm test
pnpm knip
```

## Architecture

Timestack is a meeting timer app. Users define a tree of timed segments via JSON config, and the app counts down through leaf nodes with audio cues. It runs as a web SPA (Vite, single-file build) and as a Tauri v2 desktop app.

**Zero runtime dependencies** — vanilla TypeScript, Web Audio API, localStorage.
