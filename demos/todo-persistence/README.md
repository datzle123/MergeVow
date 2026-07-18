# Todo Persistence Demo

This private workspace demo proves MergeVow's first Local Cooperative vertical slice. One
handwritten Contract V1 flow runs against baseline, semantic-refactor, and broken-persistence
variants. The first two pass; the last fails only at the post-reload checkpoint.

```bash
pnpm --filter @mergevow/demo-todo-persistence demo
```

The harness creates a fresh guarded browser context for every variant. It does not serialize or
reuse cookies, local storage, or Playwright `storageState`.
