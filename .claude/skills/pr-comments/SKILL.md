---
name: pr-comments
description: Address review comments on a pull request
disable-model-invocation: true
---

Address review comments on PR `$ARGUMENTS`.

1. Fetch PR details and review comments:
   ```bash
   gh pr view $ARGUMENTS
   gh api repos/ti-broish/signup/pulls/$ARGUMENTS/comments
   gh api repos/ti-broish/signup/pulls/$ARGUMENTS/reviews
   ```
2. Make the requested changes.
3. Commit and push (pre-push hook runs tests automatically).
