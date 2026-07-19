import { type ContractV1, validateContract } from "@mergevow/contract";
import { EXECUTION_VERDICTS, runContract } from "@mergevow/interpreter";
import { createGuardedBrowserContext, createPlaywrightDriver } from "@mergevow/playwright-driver";
import type { Browser } from "playwright";
import { chromium } from "playwright";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  type ActionRecorderResult,
  type ActionRecorderSession,
  ActionRecorderStartError,
  RECORDER_ISSUE_CODES,
  startActionRecorder,
} from "../src/index.js";
import { type RecorderTestServer, startRecorderTestServer } from "./server.js";

function html(body: string, script = ""): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body>${body}${script}</body></html>`;
}

describe("guarded Contract V1 action recorder", () => {
  let allowed: RecorderTestServer;
  let browser: Browser;
  let external: RecorderTestServer;
  let postedMethods: string[] = [];
  let semanticRefactor = false;
  let session: ActionRecorderSession | undefined;

  beforeAll(async () => {
    external = await startRecorderTestServer((_request, response) => response.end("external"));
    allowed = await startRecorderTestServer((request, response) => {
      response.setHeader("content-type", "text/html; charset=utf-8");
      switch ((request.url ?? "/").split("?")[0]) {
        case "/form":
          response.end(
            html(`
              <label for="name">Name</label><input id="name">
              <label for="choice">Choice</label>
              <select id="choice"><option value="a">A</option><option value="b">B</option></select>
              <label><input type="checkbox">Accept terms</label>
              <button aria-label="Save"><span aria-hidden="true">+</span></button>`),
          );
          return;
        case "/next":
          response.end(html("<h1>Next</h1>"));
          return;
        case "/semantic":
          response.end(
            semanticRefactor
              ? html(`
                  <section><div><label>Project <span><input id="project"></span></label></div></section>
                  <aside><button aria-label="Save"><span aria-hidden="true">icon</span></button></aside>`)
              : html(`
                  <label for="project">Project</label><input id="project">
                  <button>Save</button>`),
          );
          return;
        case "/ambiguous":
          response.end(html("<button>Duplicate</button><button>Duplicate</button>"));
          return;
        case "/ambiguous-nav":
          response.end(html('<a href="/next">Duplicate</a><a href="/form">Duplicate</a>'));
          return;
        case "/testid":
          response.end(
            html(
              '<div data-testid="icon-action" onclick="globalThis.clicked = true"><span>+</span></div>',
            ),
          );
          return;
        case "/unsupported":
          response.end(html('<div onclick="globalThis.clicked = true">Do thing</div>'));
          return;
        case "/password":
          response.end(html('<label>Password <input type="password"></label>'));
          return;
        case "/file":
          response.end(html('<label>Attachment <input type="file"></label>'));
          return;
        case "/checked":
          response.end(html('<label><input type="checkbox" checked>Enabled</label>'));
          return;
        case "/long":
          response.end(html("<label>Payload <textarea></textarea></label>"));
          return;
        case "/external":
          response.end(html(`<a href="${external.origin}/blocked">Leave app</a>`));
          return;
        case "/popup":
          response.end(
            html(
              "<button onclick=\"window.open('/next', '_blank')?.close()\">Open helper</button>",
            ),
          );
          return;
        case "/frame":
          response.end(html('<iframe title="Embedded" src="/frame-content"></iframe>'));
          return;
        case "/frame-content":
          response.end(html("<button>Inside frame</button>"));
          return;
        case "/click-nav":
          response.end(html('<a href="/next">Continue</a>'));
          return;
        case "/accname-nav":
          response.end(
            html(
              '<span id="real-name">Real name</span><a href="/next" aria-label="Wrong name" aria-labelledby="real-name">Visible</a>',
            ),
          );
          return;
        case "/duplicate-aria-nav":
          response.end(
            html('<a href="/next" aria-label="Go">One</a><a href="/form" aria-label="Go">Two</a>'),
          );
          return;
        case "/prevented-nav":
          response.end(html('<a href="/next" onclick="event.preventDefault()">Stay here</a>'));
          return;
        case "/no-op-nav":
          response.end(html('<a href="javascript:void(0)">No-op link</a>'));
          return;
        case "/beforeunload-dialog":
          response.end(
            html(
              '<a href="/next">Try to leave</a>',
              '<script>addEventListener("beforeunload", event => { event.preventDefault(); event.returnValue = ""; }, { once: true })</script>',
            ),
          );
          return;
        case "/download-nav":
          response.end(html('<a href="/download-file" download>Download file</a>'));
          return;
        case "/download-file":
          response.setHeader("content-disposition", 'attachment; filename="fixture.txt"');
          response.end("fixture");
          return;
        case "/no-content-nav":
          response.end(html('<a href="/no-content">No content</a>'));
          return;
        case "/no-content":
          response.statusCode = 204;
          response.end();
          return;
        case "/implicit-post":
          response.end(
            html(
              '<form method="post" action="/posted"><label>Query <input name="q"></label></form>',
            ),
          );
          return;
        case "/implicit-get":
          response.end(
            html(
              '<form method="get" action="/posted"><label>Query <input name="q"></label></form>',
            ),
          );
          return;
        case "/explicit-post":
          response.end(
            html(
              '<form method="post" action="/posted"><label>Query <input name="q"></label><button>Send</button></form>',
            ),
          );
          return;
        case "/posted":
          postedMethods.push(request.method ?? "UNKNOWN");
          response.end(html(`<h1>${request.method ?? "UNKNOWN"}</h1>`));
          return;
        case "/locator-edges":
          response.end(
            html(
              `<button><img alt="Image save"></button>
               <div role="foo" data-testid="invalid-role" onclick="this.dataset.clicked='yes'">Invalid role</div>
               <div data-testid=" spaced " onclick="this.dataset.clicked='yes'">Spaced ID</div>
               <div id="shadow-host"></div>
               <button onclick="this.remove()">Remove me</button>`,
              '<script>document.querySelector("#shadow-host").attachShadow({mode:"open"}).innerHTML="<button>Shadow save</button>"</script>',
            ),
          );
          return;
        case "/dynamic-label":
          response.end(
            html(
              '<label id="dynamic-label" for="dynamic-input">Before</label><input id="dynamic-input" oninput="document.querySelector(\'#dynamic-label\').textContent=this.value">',
            ),
          );
          return;
        case "/replacement-fill":
          response.end(
            html(
              '<label for="active-input">Field</label><input id="active-input">',
              `<script>
                const first = document.querySelector("#active-input");
                first.addEventListener("input", () => {
                  const replacement = document.createElement("input");
                  replacement.id = "active-input";
                  first.replaceWith(replacement);
                }, { once: true });
              </script>`,
            ),
          );
          return;
        case "/replacement-select":
          response.end(
            html(
              '<label for="active-select">Choice</label><select id="active-select"><option value="a">A</option><option value="b">B</option></select>',
              `<script>
                const first = document.querySelector("#active-select");
                first.addEventListener("input", () => {
                  const replacement = first.cloneNode(true);
                  replacement.value = first.value;
                  first.replaceWith(replacement);
                }, { once: true });
              </script>`,
            ),
          );
          return;
        case "/replacement-check":
          response.end(
            html(
              '<label><input id="active-check" type="checkbox">Accept terms</label>',
              `<script>
                const first = document.querySelector("#active-check");
                first.addEventListener("input", () => {
                  const replacement = first.cloneNode(true);
                  replacement.checked = first.checked;
                  first.replaceWith(replacement);
                }, { once: true });
              </script>`,
            ),
          );
          return;
        case "/radio":
          response.end(html('<label><input type="radio" name="choice" value="a">Alpha</label>'));
          return;
        case "/transport":
          response.end(
            html(
              "<button onclick=\"fetch('/reset').catch(() => undefined)\">Break transport</button>",
            ),
          );
          return;
        case "/reset":
          request.socket.destroy();
          return;
        case "/startup-external":
          response.statusCode = 302;
          response.setHeader("location", `${external.origin}/blocked?secret=startup-secret`);
          response.end();
          return;
        case "/startup-dialog":
          response.end(html("", "<script>alert('startup dialog')</script>"));
          return;
        case "/startup-popup":
          response.end(html("", '<script>window.open("/next", "_blank")?.close()</script>'));
          return;
        case "/many":
          response.end(html('<button data-testid="repeat">Repeat</button>'));
          return;
        default:
          response.statusCode = 404;
          response.end("not found");
      }
    });
    browser = await chromium.launch({ headless: true });
  }, 30_000);

  afterEach(async () => {
    await session?.stop();
    session = undefined;
    semanticRefactor = false;
    postedMethods = [];
  });

  afterAll(async () => {
    await browser.close();
    await Promise.all([allowed.close(), external.close()]);
  });

  async function start(startPath: string, flow = "record-actions"): Promise<ActionRecorderSession> {
    session = await startActionRecorder({ browser, flow, origin: allowed.origin, startPath });
    return session;
  }

  function expectExactFailure(result: ActionRecorderResult, code: string): void {
    expect(result).toEqual({
      issue: expect.objectContaining({ code, message: expect.any(String) }),
      ok: false,
    });
    if (result.ok) throw new Error("Expected recorder failure.");
    expect(Object.keys(result).sort()).toEqual(["issue", "ok"]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.issue)).toBe(true);
    expect(result.issue.message.length).toBeLessThanOrEqual(4_096);
  }

  async function replayContract(contract: ContractV1) {
    const replayContext = await createGuardedBrowserContext(browser, allowed.origin);
    try {
      const replayPage = await replayContext.context.newPage();
      return await runContract(
        contract,
        createPlaywrightDriver({ guardedContext: replayContext, page: replayPage }),
      );
    } finally {
      await replayContext.close();
    }
  }

  it("captures all six approved actions in source order as a frozen valid contract", async () => {
    const current = await start("/form");
    await current.page.getByLabel("Name").fill("Ada");
    // Type-ahead stays a trusted keyboard action without opening a platform-native popup.
    const choice = current.page.getByLabel("Choice");
    await choice.focus();
    await current.page.keyboard.press("b");
    expect(await choice.inputValue()).toBe("b");
    await current.page.getByLabel("Accept terms").check();
    await current.page.getByRole("button", { name: "Save" }).click();
    await current.page.reload();

    const result = await current.stop();
    expect(result).toEqual({
      contract: {
        flow: "record-actions",
        steps: [
          { visit: "/form" },
          { fill: { locator: { label: "Name" }, value: "Ada" } },
          { select: { locator: { label: "Choice" }, value: "b" } },
          { check: { label: "Accept terms" } },
          { click: { name: "Save", role: "button" } },
          { reload: {} },
        ],
        version: 1,
      },
      ok: true,
    });
    if (!result.ok) throw new Error("Expected a successful recording.");
    expect(validateContract(result.contract).ok).toBe(true);
    expect(Object.isFrozen(result.contract)).toBe(true);
    expect(Object.isFrozen(result.contract.steps)).toBe(true);
    expect(Object.isFrozen(result.contract.steps[1])).toBe(true);
    const frozenFill = result.contract.steps[1];
    if (frozenFill === undefined || !("fill" in frozenFill)) {
      throw new Error("Expected nested fill step.");
    }
    expect(Object.isFrozen(frozenFill.fill)).toBe(true);
    expect(Object.isFrozen(frozenFill.fill.locator)).toBe(true);

    const replayContext = await createGuardedBrowserContext(browser, allowed.origin);
    try {
      const replayPage = await replayContext.context.newPage();
      const replay = await runContract(
        result.contract,
        createPlaywrightDriver({ guardedContext: replayContext, page: replayPage }),
      );
      expect(replay).toMatchObject({
        completedSteps: 6,
        executionVerdict: EXECUTION_VERDICTS.pass,
        totalSteps: 6,
      });
    } finally {
      await replayContext.close();
    }
  });

  it("coalesces consecutive fills for the same control", async () => {
    const current = await start("/form", "coalesced-fill");
    await current.page.getByLabel("Name").fill("A");
    await current.page.getByLabel("Name").fill("Ada");

    await expect(current.stop()).resolves.toEqual({
      contract: {
        flow: "coalesced-fill",
        steps: [{ visit: "/form" }, { fill: { locator: { label: "Name" }, value: "Ada" } }],
        version: 1,
      },
      ok: true,
    });
  });

  it("preserves the exact same-origin pathname, search, and hash", async () => {
    const current = await start("/form?mode=record#name", "focused-path");
    await expect(current.stop()).resolves.toEqual({
      contract: {
        flow: "focused-path",
        steps: [{ visit: "/form?mode=record#name" }],
        version: 1,
      },
      ok: true,
    });
  });

  it("emits identical semantic actions across wrapper and nesting refactors", async () => {
    const baselineSession = await start("/semantic", "semantic-capture");
    await baselineSession.page.getByLabel("Project").fill("MergeVow");
    await baselineSession.page.getByRole("button", { name: "Save" }).click();
    const baseline = await baselineSession.stop();
    session = undefined;

    semanticRefactor = true;
    const refactoredSession = await start("/semantic", "semantic-capture");
    await refactoredSession.page.getByLabel("Project").fill("MergeVow");
    await refactoredSession.page.getByRole("button", { name: "Save" }).click();
    const refactored = await refactoredSession.stop();

    expect(refactored).toEqual(baseline);
    expect(refactored).toMatchObject({ ok: true });
  });

  it("captures direct navigation and reload but does not duplicate click navigation", async () => {
    const direct = await start("/form", "navigation");
    await direct.page.getByLabel("Name").fill("before navigation");
    await direct.page.goto("/next");
    await direct.page.reload();
    await expect(direct.stop()).resolves.toMatchObject({
      contract: {
        steps: [
          { visit: "/form" },
          { fill: { locator: { label: "Name" }, value: "before navigation" } },
          { visit: "/next" },
          { reload: {} },
        ],
      },
      ok: true,
    });
    session = undefined;

    const clicked = await start("/click-nav", "click-navigation");
    await clicked.page.getByRole("link", { name: "Continue" }).click();
    await expect(clicked.stop()).resolves.toMatchObject({
      contract: {
        steps: [{ visit: "/click-nav" }, { click: { name: "Continue", role: "link" } }],
      },
      ok: true,
    });
  });

  it("uses standards-based accessible names for navigation and rejects true ambiguity", async () => {
    const current = await start("/accname-nav", "accessible-navigation");
    await current.page.getByRole("link", { name: "Real name" }).click();
    const result = await current.stop();
    expect(result).toEqual({
      contract: {
        flow: "accessible-navigation",
        steps: [{ visit: "/accname-nav" }, { click: { name: "Real name", role: "link" } }],
        version: 1,
      },
      ok: true,
    });
    if (!result.ok) throw new Error("Expected accessible navigation recording.");
    await expect(replayContract(result.contract)).resolves.toMatchObject({
      executionVerdict: EXECUTION_VERDICTS.pass,
    });
    session = undefined;

    const ambiguous = await start("/duplicate-aria-nav", "accessible-ambiguity");
    await ambiguous.page.locator("a").first().click();
    expectExactFailure(await ambiguous.stop(), RECORDER_ISSUE_CODES.ambiguousLocator);
  });

  it("records valid role, test-ID, shadow, and removed-target locators then replays them", async () => {
    const current = await start("/locator-edges", "locator-edges");
    await current.page.getByRole("button", { name: "Image save" }).click();
    await current.page.getByTestId("invalid-role").click();
    await current.page.getByTestId(" spaced ").click();
    await current.page.getByRole("button", { name: "Shadow save" }).click();
    await current.page.getByRole("button", { name: "Remove me" }).click();

    const result = await current.stop();
    expect(result).toEqual({
      contract: {
        flow: "locator-edges",
        steps: [
          { visit: "/locator-edges" },
          { click: { name: "Image save", role: "button" } },
          { click: { testId: "invalid-role" } },
          { click: { testId: " spaced " } },
          { click: { name: "Shadow save", role: "button" } },
          { click: { name: "Remove me", role: "button" } },
        ],
        version: 1,
      },
      ok: true,
    });
    if (!result.ok) throw new Error("Expected edge-locator recording.");
    await expect(replayContract(result.contract)).resolves.toMatchObject({
      executionVerdict: EXECUTION_VERDICTS.pass,
    });
  });

  it("expires prevented-click ownership before later reload and direct navigation", async () => {
    const current = await start("/prevented-nav", "causal-navigation");
    await current.page.getByRole("link", { name: "Stay here" }).click();
    await current.page.reload();
    await current.page.goto("/next");
    await expect(current.stop()).resolves.toMatchObject({
      contract: {
        steps: [
          { visit: "/prevented-nav" },
          { click: { name: "Stay here", role: "link" } },
          { reload: {} },
          { visit: "/next" },
        ],
      },
      ok: true,
    });
  });

  it("expires no-op link ownership before a later direct navigation", async () => {
    const current = await start("/no-op-nav", "no-op-navigation");
    await current.page.getByRole("link", { name: "No-op link" }).click();
    await current.page.waitForTimeout(20);
    await current.page.goto("/next");
    await expect(current.stop()).resolves.toMatchObject({
      contract: {
        steps: [
          { visit: "/no-op-nav" },
          { click: { name: "No-op link", role: "link" } },
          { visit: "/next" },
        ],
      },
      ok: true,
    });
  });

  it("fails closed when a beforeunload dialog cancels click navigation", async () => {
    const current = await start("/beforeunload-dialog", "beforeunload-dialog");
    await current.page.getByRole("link", { name: "Try to leave" }).click();
    expectExactFailure(await current.stop(), RECORDER_ISSUE_CODES.unsupportedAction);
  });

  it("does not let downloads or 204 responses own a later direct navigation", async () => {
    const download = await start("/download-nav", "download-navigation");
    const downloadPromise = download.page.waitForEvent("download");
    await download.page.getByRole("link", { name: "Download file" }).click();
    await downloadPromise;
    await download.page.goto("/next");
    await expect(download.stop()).resolves.toMatchObject({
      contract: {
        steps: [
          { visit: "/download-nav" },
          { click: { name: "Download file", role: "link" } },
          { visit: "/next" },
        ],
      },
      ok: true,
    });
    session = undefined;

    const noContent = await start("/no-content-nav", "no-content-navigation");
    await noContent.page.getByRole("link", { name: "No content" }).click();
    await noContent.page.evaluate(() => {
      location.hash = "after-no-content";
    });
    await noContent.page.waitForURL(/#after-no-content$/u);
    await noContent.page.goto("/next");
    await expect(noContent.stop()).resolves.toMatchObject({
      contract: {
        steps: [
          { visit: "/no-content-nav" },
          { click: { name: "No content", role: "link" } },
          { visit: "/no-content-nav#after-no-content" },
          { visit: "/next" },
        ],
      },
      ok: true,
    });
  });

  it("rejects unowned GET/POST submits but preserves click-owned POST behavior", async () => {
    const implicitPost = await start("/implicit-post", "implicit-post");
    await implicitPost.page.getByLabel("Query").fill("secret-post-value");
    await implicitPost.page.getByLabel("Query").press("Enter");
    expectExactFailure(await implicitPost.stop(), RECORDER_ISSUE_CODES.unsupportedAction);
    session = undefined;

    const implicitGet = await start("/implicit-get", "implicit-get");
    await implicitGet.page.getByLabel("Query").fill("value");
    await implicitGet.page.getByLabel("Query").press("Enter");
    expectExactFailure(await implicitGet.stop(), RECORDER_ISSUE_CODES.unsupportedAction);
    session = undefined;
    postedMethods = [];

    const explicitPost = await start("/explicit-post", "explicit-post");
    await explicitPost.page.getByLabel("Query").fill("value");
    await explicitPost.page.getByRole("button", { name: "Send" }).click();
    const result = await explicitPost.stop();
    expect(result).toMatchObject({
      contract: {
        steps: [
          { visit: "/explicit-post" },
          { fill: { locator: { label: "Query" }, value: "value" } },
          { click: { name: "Send", role: "button" } },
        ],
      },
      ok: true,
    });
    expect(postedMethods).toEqual(["POST"]);
    if (!result.ok) throw new Error("Expected explicit POST recording.");
    await expect(replayContract(result.contract)).resolves.toMatchObject({
      executionVerdict: EXECUTION_VERDICTS.pass,
    });
    expect(postedMethods).toEqual(["POST", "POST"]);
  });

  it("coalesces by control identity while retaining the first replayable locator", async () => {
    const dynamic = await start("/dynamic-label", "dynamic-label");
    await dynamic.page.getByLabel("Before").fill("A");
    await dynamic.page.getByLabel("A").fill("Ada");
    const dynamicResult = await dynamic.stop();
    expect(dynamicResult).toMatchObject({
      contract: {
        steps: [
          { visit: "/dynamic-label" },
          { fill: { locator: { label: "Before" }, value: "Ada" } },
        ],
      },
      ok: true,
    });
    if (!dynamicResult.ok) throw new Error("Expected dynamic fill recording.");
    await expect(replayContract(dynamicResult.contract)).resolves.toMatchObject({
      executionVerdict: EXECUTION_VERDICTS.pass,
    });
    session = undefined;

    const replacement = await start("/replacement-fill", "replacement-fill");
    await replacement.page.getByLabel("Field").fill("One");
    await replacement.page.getByLabel("Field").fill("Two");
    const replacementResult = await replacement.stop();
    expect(replacementResult).toMatchObject({
      contract: {
        steps: [
          { visit: "/replacement-fill" },
          { fill: { locator: { label: "Field" }, value: "One" } },
          { fill: { locator: { label: "Field" }, value: "Two" } },
        ],
      },
      ok: true,
    });
    if (!replacementResult.ok) throw new Error("Expected replacement fill recording.");
    await expect(replayContract(replacementResult.contract)).resolves.toMatchObject({
      executionVerdict: EXECUTION_VERDICTS.pass,
    });
  });

  it("records radio selection through the approved check opcode", async () => {
    const current = await start("/radio", "radio-check");
    await current.page.getByLabel("Alpha").check();
    await expect(current.stop()).resolves.toMatchObject({
      contract: {
        steps: [{ visit: "/radio" }, { check: { label: "Alpha" } }],
      },
      ok: true,
    });
  });

  it("captures select input before the application replaces the acted-on control", async () => {
    const current = await start("/replacement-select", "replacement-select");
    const choice = current.page.getByLabel("Choice");
    await choice.focus();
    await current.page.keyboard.press("b");
    expect(await choice.inputValue()).toBe("b");

    const result = await current.stop();
    expect(result).toEqual({
      contract: {
        flow: "replacement-select",
        steps: [
          { visit: "/replacement-select" },
          { select: { locator: { label: "Choice" }, value: "b" } },
        ],
        version: 1,
      },
      ok: true,
    });
    if (!result.ok) throw new Error("Expected replacement select recording.");
    await expect(replayContract(result.contract)).resolves.toMatchObject({
      executionVerdict: EXECUTION_VERDICTS.pass,
    });
  });

  it("captures check input before the application replaces the acted-on control", async () => {
    const current = await start("/replacement-check", "replacement-check");
    const checkbox = current.page.getByLabel("Accept terms");
    await checkbox.check();
    expect(await checkbox.isChecked()).toBe(true);

    const result = await current.stop();
    expect(result).toEqual({
      contract: {
        flow: "replacement-check",
        steps: [{ visit: "/replacement-check" }, { check: { label: "Accept terms" } }],
        version: 1,
      },
      ok: true,
    });
    if (!result.ok) throw new Error("Expected replacement check recording.");
    await expect(replayContract(result.contract)).resolves.toMatchObject({
      executionVerdict: EXECUTION_VERDICTS.pass,
    });
  });

  it("uses an exact test ID only when richer semantics are unavailable", async () => {
    const current = await start("/testid", "test-id-fallback");
    await current.page.getByTestId("icon-action").click();
    await expect(current.stop()).resolves.toMatchObject({
      contract: { steps: [{ visit: "/testid" }, { click: { testId: "icon-action" } }] },
      ok: true,
    });
  });

  it("fails closed on ambiguous or missing semantic locators", async () => {
    const ambiguous = await start("/ambiguous", "ambiguous");
    await ambiguous.page.getByRole("button", { name: "Duplicate" }).first().click();
    await expect(ambiguous.stop()).resolves.toMatchObject({
      issue: { code: RECORDER_ISSUE_CODES.ambiguousLocator },
      ok: false,
    });
    session = undefined;

    const navigating = await start("/ambiguous-nav", "ambiguous-navigation");
    await navigating.page.getByRole("link", { name: "Duplicate" }).first().click();
    await expect(navigating.stop()).resolves.toMatchObject({
      issue: { code: RECORDER_ISSUE_CODES.ambiguousLocator },
      ok: false,
    });
    session = undefined;

    const unsupported = await start("/unsupported", "unsupported");
    await unsupported.page.getByText("Do thing").click();
    await expect(unsupported.stop()).resolves.toMatchObject({
      issue: { code: RECORDER_ISSUE_CODES.unsupportedLocator },
      ok: false,
    });
  });

  it("rejects password, file, uncheck, and oversized fill without persisting values", async () => {
    const password = await start("/password", "password");
    await password.page.getByLabel("Password").fill("never-persist-this");
    const passwordResult = await password.stop();
    expect(passwordResult).toMatchObject({
      issue: { code: RECORDER_ISSUE_CODES.sensitiveControl },
      ok: false,
    });
    expect(JSON.stringify(passwordResult)).not.toContain("never-persist-this");
    session = undefined;

    const file = await start("/file", "file");
    const chooserPromise = file.page.waitForEvent("filechooser");
    await file.page.getByLabel("Attachment").click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
      buffer: Buffer.from("private"),
      mimeType: "text/plain",
      name: "private.txt",
    });
    await expect(file.stop()).resolves.toMatchObject({
      issue: { code: RECORDER_ISSUE_CODES.unsupportedAction },
      ok: false,
    });
    session = undefined;

    const unchecked = await start("/checked", "uncheck");
    await unchecked.page.getByLabel("Enabled").uncheck();
    await expect(unchecked.stop()).resolves.toMatchObject({
      issue: { code: RECORDER_ISSUE_CODES.unsupportedAction },
      ok: false,
    });
    session = undefined;

    const longValue = await start("/long", "long-value");
    await longValue.page.getByLabel("Payload").fill("x".repeat(4_097));
    await expect(longValue.stop()).resolves.toMatchObject({
      issue: { code: RECORDER_ISSUE_CODES.valueLimit },
      ok: false,
    });
  });

  it("fails the whole recording on external traffic or short-lived popups", async () => {
    const externalSession = await start("/external", "external");
    external.requests.length = 0;
    await externalSession.page
      .getByRole("link", { name: "Leave app" })
      .click()
      .catch(() => undefined);
    await expect(externalSession.stop()).resolves.toMatchObject({
      issue: { code: RECORDER_ISSUE_CODES.browserPolicy },
      ok: false,
    });
    expect(external.requests).toEqual([]);
    session = undefined;

    const popup = await start("/popup", "popup");
    await popup.page.getByRole("button", { name: "Open helper" }).click();
    await expect(popup.stop()).resolves.toMatchObject({
      issue: { code: RECORDER_ISSUE_CODES.pageTopology },
      ok: false,
    });
  });

  it("returns typed bounded startup failures without raw Playwright or URL data", async () => {
    for (const [startPath, code] of [
      ["/startup-external?local=secret-start", RECORDER_ISSUE_CODES.browserPolicy],
      ["/startup-dialog", RECORDER_ISSUE_CODES.unsupportedAction],
      ["/frame", RECORDER_ISSUE_CODES.unsupportedAction],
      ["/startup-popup", RECORDER_ISSUE_CODES.pageTopology],
    ] as const) {
      const captured = await startActionRecorder({
        browser,
        flow: "startup-failure",
        origin: allowed.origin,
        startPath,
      }).catch((error: unknown) => error);
      expect(captured).toBeInstanceOf(ActionRecorderStartError);
      if (!(captured instanceof ActionRecorderStartError)) {
        throw new Error("Expected ActionRecorderStartError.");
      }
      expect(captured.issue).toMatchObject({ code, message: expect.any(String) });
      expect(Object.isFrozen(captured)).toBe(true);
      expect(Object.isFrozen(captured.issue)).toBe(true);
      const rendered = `${captured.message}\n${captured.stack ?? ""}\n${JSON.stringify(captured)}`;
      expect(rendered).not.toContain("secret-start");
      expect(rendered).not.toContain("startup-secret");
      expect(rendered).not.toContain("page.goto");
      expect(captured.issue.message.length).toBeLessThanOrEqual(4_096);
    }
  });

  it("returns no partial contract after a retained same-origin transport failure", async () => {
    const current = await start("/transport", "transport-failure");
    await current.page.getByRole("button", { name: "Break transport" }).click();
    await expect.poll(() => allowed.requests.includes("/reset")).toBe(true);
    expectExactFailure(await current.stop(), RECORDER_ISSUE_CODES.browserPolicy);
  });

  it("classifies closing the controlled page as unsupported topology", async () => {
    const current = await start("/form", "closed-page");
    await current.page.close();
    await expect(current.stop()).resolves.toMatchObject({
      issue: { code: RECORDER_ISSUE_CODES.pageTopology },
      ok: false,
    });
  });

  it("enforces the 100-step contract bound without returning partial output", async () => {
    const current = await start("/many", "bounded-steps");
    const button = current.page.getByTestId("repeat");
    for (let index = 0; index < 100; index += 1) await button.click();

    await expect(current.stop()).resolves.toMatchObject({
      issue: { code: RECORDER_ISSUE_CODES.stepLimit },
      ok: false,
    });
  });

  it("enforces final raw-contract size after individually bounded events", async () => {
    const current = await start("/form", "bounded-document");
    const input = current.page.getByLabel("Name");
    const button = current.page.getByRole("button", { name: "Save" });
    for (let index = 0; index < 49; index += 1) {
      await input.fill(`${String(index).padStart(2, "0")}${"x".repeat(2_000)}`);
      await button.click();
    }

    await expect(current.stop()).resolves.toMatchObject({
      issue: { code: RECORDER_ISSUE_CODES.contractInvalid },
      ok: false,
    });
  });

  it("bounds the document scan used for semantic locator proofs", async () => {
    const current = await start("/many", "bounded-page");
    await current.page.evaluate(() => {
      const fragment = document.createDocumentFragment();
      for (let index = 0; index < 10_001; index += 1) fragment.append(document.createElement("i"));
      document.body.append(fragment);
    });
    await current.page.getByTestId("repeat").click();

    await expect(current.stop()).resolves.toMatchObject({
      issue: { code: RECORDER_ISSUE_CODES.unsupportedLocator },
      ok: false,
    });
  });

  it("fails closed before semantic-name work can scan an oversized candidate set", async () => {
    const current = await start("/many", "bounded-semantic-work");
    await current.page.evaluate(() => {
      const fragment = document.createDocumentFragment();
      for (let index = 0; index < 2_500; index += 1) {
        const button = document.createElement("button");
        button.textContent = `Semantic ${index}`;
        fragment.append(button);
      }
      document.body.append(fragment);
    });
    await current.page.getByRole("button", { name: "Semantic 0" }).click();
    expectExactFailure(await current.stop(), RECORDER_ISSUE_CODES.unsupportedLocator);
  });

  it("ignores synthetic page-script click, input, select, and check events", async () => {
    const current = await start("/form", "trusted-events-only");
    await current.page.evaluate(() => {
      const input = document.querySelector("input#name");
      const select = document.querySelector("select");
      const checkbox = document.querySelector('input[type="checkbox"]');
      const button = document.querySelector("button");
      if (
        !(input instanceof HTMLInputElement) ||
        !(select instanceof HTMLSelectElement) ||
        !(checkbox instanceof HTMLInputElement) ||
        !(button instanceof HTMLButtonElement)
      ) {
        throw new TypeError("Missing synthetic-event controls.");
      }
      input.value = "scripted";
      input.dispatchEvent(new InputEvent("input", { bubbles: true }));
      select.value = "b";
      select.dispatchEvent(new InputEvent("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
      checkbox.checked = true;
      checkbox.dispatchEvent(new InputEvent("input", { bubbles: true }));
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));
      button.click();
    });

    await expect(current.stop()).resolves.toEqual({
      contract: { flow: "trusted-events-only", steps: [{ visit: "/form" }], version: 1 },
      ok: true,
    });
  });

  it("rejects malformed instrumentation payloads without persisting selector code", async () => {
    const current = await start("/many", "malformed-event");
    await current.page.evaluate(async () => {
      const bindingName = Object.getOwnPropertyNames(globalThis).find((name) =>
        name.startsWith("__mergevow_record_"),
      );
      if (bindingName === undefined) throw new TypeError("Missing recorder binding.");
      const binding = (globalThis as Record<string, unknown>)[bindingName];
      if (typeof binding !== "function") throw new TypeError("Invalid recorder binding.");
      await binding({
        candidates: [{ locator: { css: "*" }, matches: 1 }],
        documentToken: "forged",
        kind: "click",
        marker: "forged",
        mayNavigate: false,
      });
    });

    const result = await current.stop();
    expect(result).toMatchObject({
      issue: { code: RECORDER_ISSUE_CODES.malformedEvent },
      ok: false,
    });
    expect(JSON.stringify(result)).not.toContain('"css"');
  });

  it("rejects invalid flow, external origin, and cross-origin start paths before capture", async () => {
    await expect(
      startActionRecorder({
        browser,
        flow: "x".repeat(65),
        origin: allowed.origin,
        startPath: "/form",
      }),
    ).rejects.toThrow(/Contract V1 validation/i);
    await expect(
      startActionRecorder({
        browser,
        flow: "external-origin",
        origin: "https://example.com",
        startPath: "/",
      }),
    ).rejects.toThrow(/loopback/i);
    await expect(
      startActionRecorder({
        browser,
        flow: "external-path",
        origin: allowed.origin,
        startPath: "//example.com/path",
      }),
    ).rejects.toThrow(/same-origin/i);
  });

  it("uses a fresh context and never exports browser storage", async () => {
    const first = await start("/form", "fresh-one");
    await first.page
      .context()
      .addCookies([{ name: "recorder-secret", url: allowed.origin, value: "must-not-leak" }]);
    await first.page.evaluate(() => {
      localStorage.setItem("secret", "must-not-leak");
      sessionStorage.setItem("secret", "must-not-leak");
    });
    const firstResult = await first.stop();
    expect(JSON.stringify(firstResult)).not.toContain("must-not-leak");
    session = undefined;

    const second = await start("/form", "fresh-two");
    await expect(
      second.page.evaluate(() => ({
        cookie: document.cookie,
        local: localStorage.getItem("secret"),
        session: sessionStorage.getItem("secret"),
      })),
    ).resolves.toEqual({ cookie: "", local: null, session: null });
    await expect(second.stop()).resolves.toMatchObject({ ok: true });
  });
});
