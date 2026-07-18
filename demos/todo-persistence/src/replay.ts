import { type InterpreterRunResult, runContract } from "@mergevow/interpreter";
import {
  createGuardedBrowserContext,
  createPlaywrightDriver,
  waitForLoopbackReady,
} from "@mergevow/playwright-driver";
import type { Browser } from "playwright";

import { TODO_PERSISTENCE_CONTRACT } from "./contract.js";
import { startTodoDemo, type TodoDemoVariant } from "./server.js";

export interface ReplayTodoVariantOptions {
  readonly signal?: AbortSignal;
}

export async function replayTodoVariant(
  browser: Browser,
  variant: TodoDemoVariant,
  options: ReplayTodoVariantOptions = {},
): Promise<InterpreterRunResult> {
  const server = await startTodoDemo(variant);
  try {
    const signalOptions = options.signal === undefined ? {} : { signal: options.signal };
    await waitForLoopbackReady(server.origin, {
      ...signalOptions,
      timeoutMs: 5_000,
    });
    const guardedContext = await createGuardedBrowserContext(browser, server.origin);
    try {
      const page = await guardedContext.context.newPage();
      const driver = createPlaywrightDriver({ guardedContext, page });
      return await runContract(TODO_PERSISTENCE_CONTRACT, driver, signalOptions);
    } finally {
      await guardedContext.close();
    }
  } finally {
    await server.close();
  }
}
