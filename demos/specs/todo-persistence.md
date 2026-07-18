# Demo: Todo Persistence Regression

## Purpose

Prove the first vertical slice catches behavior that appears correct until page reload.

## Selected Flow

1. Visit `/todos`.
2. Click “Add task”.
3. Fill title with “Ship release”.
4. Click “Create”.
5. Assert the task is visible.
6. Reload.
7. Assert the task is still visible.

## Regression

The candidate shows a success toast and updates local UI state but never persists the task.

## Expected Result

The semantic refactor variant passes. The persistence variant fails at the post-reload checkpoint.
