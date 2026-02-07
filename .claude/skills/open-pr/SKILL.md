---
name: open-pr
description: Open a pull request
disable-model-invocation: true
---

1. Check for uncommitted changes with `git status`. If there are any, commit them.
2. Push and open PR (pre-push hook runs tests automatically):
   ```bash
   git push -u origin HEAD
   ```
   ```bash
   gh pr create --fill
   ```
