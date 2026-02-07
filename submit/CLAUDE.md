# submit/ — API worker

Cloudflare Worker with D1 database. Routes: `POST /submit`, `GET /health`.

## Pipeline

Parse JSON -> validate fields -> Turnstile verification -> rate limit (D1, per IP) -> D1 insert -> fire-and-forget Brevo email + Google Sheets export via RPC (`env.EXPORT.appendRow()`).

## Testing

Vitest + node environment. Config: `vitest.config.ts`.

```bash
pnpm --filter @signup/submit test -- --run
```

## Notes

- Schema: `schema.sql`. Migrations: `migrations/`.
- EGN only required for "Пазител на вота в секция" role.
- Form values are Bulgarian strings, not codes.
