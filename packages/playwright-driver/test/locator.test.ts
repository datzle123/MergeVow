import type { Locator as ContractLocator } from "@stillworks/contract";
import type { Browser, BrowserContext, Page } from "playwright";
import { chromium } from "playwright";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  inspectLocatorMatches,
  LOCATOR_RESOLUTION_CODES,
  resolveUniqueLocator,
} from "../src/index.js";

describe("semantic locator resolution", () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  }, 30_000);

  beforeEach(async () => {
    context = await browser.newContext();
    page = await context.newPage();
  });

  afterEach(async () => {
    await context.close();
  });

  afterAll(async () => {
    await browser.close();
  });

  it("survives wrapper, class, and nesting refactors when role semantics stay stable", async () => {
    await page.setContent(`
      <main class="legacy-shell">
        <section class="legacy-panel">
          <button id="before" class="legacy-primary"><span>Save order</span></button>
        </section>
      </main>
    `);

    const before = await resolveUniqueLocator(page, {
      name: "Save order",
      role: "button",
    });
    expect(before.ok).toBe(true);
    if (!before.ok) {
      throw new Error("Expected the semantic control before refactor.");
    }
    expect(await before.value.locator.getAttribute("id")).toBe("before");

    await page.setContent(`
      <div data-layout="new">
        <div>
          <button id="after" aria-label="Save order">
            <svg aria-hidden="true"></svg>
          </button>
        </div>
      </div>
    `);

    const after = await resolveUniqueLocator(page, {
      name: "Save order",
      role: "button",
    });
    expect(after.ok).toBe(true);
    if (!after.ok) {
      throw new Error("Expected the semantic control after refactor.");
    }
    expect(await after.value.locator.getAttribute("id")).toBe("after");
  });

  it("resolves controls through exact associated label text", async () => {
    await page.setContent(`
      <label for="email-before">Email address</label>
      <input id="email-before" />
    `);

    const before = await resolveUniqueLocator(page, { label: "Email address" });
    expect(before.ok).toBe(true);
    if (!before.ok) {
      throw new Error("Expected the explicitly associated label.");
    }
    await before.value.locator.fill("before@example.test");
    expect(await before.value.locator.inputValue()).toBe("before@example.test");

    await page.setContent(`
      <div class="new-field-shell">
        <label>Email address <input id="email-after" /></label>
      </div>
    `);

    const after = await resolveUniqueLocator(page, { label: "Email address" });
    expect(after.ok).toBe(true);
    if (!after.ok) {
      throw new Error("Expected the wrapping label after refactor.");
    }
    expect(await after.value.locator.getAttribute("id")).toBe("email-after");
  });

  it("matches test IDs exactly instead of treating them as substrings", async () => {
    await page.setContent(`
      <output data-testid="order-total">$12.00</output>
      <output data-testid="order-total-preview">$13.00</output>
    `);

    const result = await resolveUniqueLocator(page, { testId: "order-total" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(await result.value.locator.textContent()).toBe("$12.00");
      expect(result.value.strategy).toBe("testId");
    }
  });

  it("reports a missing exact role/name instead of using similar text", async () => {
    await page.setContent(`<button>Save changes</button>`);

    const result = await resolveUniqueLocator(page, { name: "Save", role: "button" });

    expect(result).toEqual({
      issues: [
        {
          code: LOCATOR_RESOLUTION_CODES.missing,
          description: 'role "button" with accessible name "Save"',
          matchCount: 0,
          message:
            '0 elements matched role "button" with accessible name "Save"; expected exactly one.',
          strategy: "role",
        },
      ],
      ok: false,
    });

    const caseMismatch = await resolveUniqueLocator(page, {
      name: "save changes",
      role: "button",
    });
    expect(caseMismatch.ok).toBe(false);
    if (!caseMismatch.ok) {
      expect(caseMismatch.issues[0]?.code).toBe(LOCATOR_RESOLUTION_CODES.missing);
    }
  });

  it("reports ambiguity with the observed match count", async () => {
    await page.setContent(`
      <button>Continue</button>
      <button>Continue</button>
    `);

    const result = await resolveUniqueLocator(page, {
      name: "Continue",
      role: "button",
    });

    expect(result).toEqual({
      issues: [
        {
          code: LOCATOR_RESOLUTION_CODES.ambiguous,
          description: 'role "button" with accessible name "Continue"',
          matchCount: 2,
          message:
            '2 elements matched role "button" with accessible name "Continue"; expected exactly one.',
          strategy: "role",
        },
      ],
      ok: false,
    });
  });

  it("exposes all exact matches for count assertions without weakening unique resolution", async () => {
    await page.setContent(`
      <div data-testid="line-item">First</div>
      <div data-testid="line-item">Second</div>
    `);

    const observation = await inspectLocatorMatches(page, { testId: "line-item" });
    const unique = await resolveUniqueLocator(page, { testId: "line-item" });

    expect(observation.matchCount).toBe(2);
    expect(await observation.locator.allTextContents()).toEqual(["First", "Second"]);
    expect(unique.ok).toBe(false);
    if (!unique.ok) {
      expect(unique.issues[0]?.code).toBe(LOCATOR_RESOLUTION_CODES.ambiguous);
    }
  });

  it("lets Playwright failures propagate instead of misclassifying them as missing", async () => {
    await page.close();

    await expect(resolveUniqueLocator(page, { name: "Continue", role: "button" })).rejects.toThrow(
      /closed/i,
    );
  });

  it("rejects a malformed mixed strategy instead of choosing a fallback", async () => {
    const mixed = {
      label: "Continue",
      name: "Continue",
      role: "button",
    } as unknown as ContractLocator;

    await expect(resolveUniqueLocator(page, mixed)).rejects.toThrow(
      "A semantic locator must contain exactly one own strategy.",
    );
  });

  it("keeps the returned locator strict when the DOM later becomes ambiguous", async () => {
    await page.setContent(`<button>Continue</button>`);
    const result = await resolveUniqueLocator(page, {
      name: "Continue",
      role: "button",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected the initial unique locator.");
    }

    await page.locator("body").evaluate((body) => {
      const duplicate = document.createElement("button");
      duplicate.textContent = "Continue";
      body.append(duplicate);
    });

    await expect(result.value.locator.click()).rejects.toThrow(/strict mode violation/i);
  });

  it("includes hidden role targets only when trusted interpreter policy requests it", async () => {
    await page.setContent(`<button style="display: none">Hidden action</button>`);

    const normal = await resolveUniqueLocator(page, {
      name: "Hidden action",
      role: "button",
    });
    const hiddenAssertion = await resolveUniqueLocator(
      page,
      { name: "Hidden action", role: "button" },
      { includeHidden: true },
    );

    expect(normal.ok).toBe(false);
    if (!normal.ok) {
      expect(normal.issues[0]?.code).toBe(LOCATOR_RESOLUTION_CODES.missing);
    }
    expect(hiddenAssertion.ok).toBe(true);
    if (hiddenAssertion.ok) {
      expect(await hiddenAssertion.value.locator.isHidden()).toBe(true);
    }
  });
});
