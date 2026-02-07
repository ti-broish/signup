# form/ — React + Vite frontend

Deployed as Cloudflare Worker with Worker Assets (`src/worker.ts` serves the SPA and injects runtime env vars).

## Key files

- `components/widgets/SignUpWidget.tsx` — Single large component (~2100 lines) with all form state, validation, rendering, submission.
- `src/worker.ts` — CF Worker serving SPA, injects `window.process.env.*` into HTML at runtime.
- `App.tsx` — Root component with iframe origin protection.

## Testing

Vitest + jsdom + React Testing Library. Config: `vitest.config.ts`.

```bash
pnpm --filter @signup/form test -- --run
```

## Notes

- Location cascade: region -> municipality -> settlement -> cityRegion -> pollingStation (from `api.tibroish.bg`).
- Sofia MIR merge: regions 23/24/25 merged into virtual "София-град" (`sofia-merged`), `actualRegionForApi` tracks the real region.
- Env vars: runtime via `window.process.env.*` (worker-injected), build-time via `process.env.*` (Vite).
- Tailwind CSS v4.
