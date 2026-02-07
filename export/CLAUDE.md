# export/ — Google Sheets export worker

`WorkerEntrypoint` subclass exposing `appendRow()` RPC method. Not publicly accessible — only reachable via service binding from submit worker.

Uses service account JSON + JWT to append rows to Google Sheets API v4.

## Testing

Vitest + node environment. Config: `vitest.config.ts`.

```bash
pnpm --filter @signup/export test -- --run
```
