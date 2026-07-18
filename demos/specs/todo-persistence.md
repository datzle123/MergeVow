# Demo: Todo Persistence Regression

## Purpose

Prove the first vertical slice catches behavior that appears correct until page reload.

## Selected Flow

1. Visit `/todos`.
2. Click `Add task`.
3. Fill title with `Ship release`.
4. Click `Create`.
5. Assert the task is visible.
6. Reload.
7. Assert the task is still visible.

## Regression

The candidate shows a success toast and updates local UI state but never persists the task.

## Expected Result

The baseline and semantic-refactor variants pass in fresh browser contexts with the same contract.
The broken-persistence variant returns `REGRESSION` with `LOCATOR_MISSING` at zero-based step 6. A
minimal deterministic Local Cooperative summary explains the failed checkpoint.
