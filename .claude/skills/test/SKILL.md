---
name: test
description: Run tests for all packages or a specific package
disable-model-invocation: true
allowed-tools: Bash
---

Do not investigate or fix failures. Just run the command and show output.

If `$ARGUMENTS` is `form`, `submit`, or `export`:
```bash
pnpm --filter @signup/$ARGUMENTS test -- --run
```

Otherwise:
```bash
pnpm --recursive test -- --run
```
