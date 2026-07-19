import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  ARIA_ROLES,
  CONTRACT_LIMITS,
  CONTRACT_VERSION,
  type ContractStep,
  type ContractV1,
  validateContract,
} from "@mergevow/contract";
import {
  createGuardedBrowserContext,
  createPageTopologyObservation,
  normalizeLoopbackOrigin,
  waitForLoopbackReady,
} from "@mergevow/playwright-driver";
import type { Request } from "playwright";

import { parseBrowserRecorderEvent } from "./events.js";
import type { RecorderDocumentState, RecorderInitScriptOptions } from "./instrumentation.js";
import { selectCapturedLocator } from "./locator.js";
import {
  type ActionRecorderResult,
  type ActionRecorderSession,
  ActionRecorderStartError,
  type BrowserActionEvent,
  type BrowserNavigationEvent,
  type BrowserNavigationIntentEvent,
  type BrowserRejectedEvent,
  RECORDER_ISSUE_CODES,
  RECORDER_LIMITS,
  type RecorderIssue,
  type StartActionRecorderOptions,
} from "./types.js";

interface RecordedStep {
  readonly fillTarget?: string;
  readonly step: ContractStep;
}

let browserScriptPromise: Promise<string> | undefined;

function bundledBrowserScriptUrl(): URL {
  return new URL(
    import.meta.url.includes("/dist/src/")
      ? "../browser/recorder-init.js"
      : "../dist/browser/recorder-init.js",
    import.meta.url,
  );
}

function loadBrowserScript(): Promise<string> {
  browserScriptPromise ??= readFile(bundledBrowserScriptUrl(), "utf8");
  return browserScriptPromise;
}

function boundedMessage(value: string): string {
  return value.length <= RECORDER_LIMITS.maxIssueMessageLength
    ? value
    : `${value.slice(0, RECORDER_LIMITS.maxIssueMessageLength - 3)}...`;
}

function issue(code: RecorderIssue["code"], message: string): RecorderIssue {
  return Object.freeze({ code, message: boundedMessage(message) });
}

function startupFailure(code: RecorderIssue["code"], message: string): ActionRecorderStartError {
  return new ActionRecorderStartError(issue(code, message));
}

function failure(value: RecorderIssue): ActionRecorderResult {
  return Object.freeze({ issue: value, ok: false });
}

function freezeContract(value: ContractV1): ContractV1 {
  const pending: object[] = [value];
  const visited = new Set<object>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || visited.has(current)) continue;
    visited.add(current);
    for (const child of Object.values(current)) {
      if (child !== null && typeof child === "object") pending.push(child);
    }
    Object.freeze(current);
  }
  return value;
}

function normalizedStartContract(flow: string, origin: string, startPath: string): ContractV1 {
  if (typeof flow !== "string" || typeof startPath !== "string") {
    throw new TypeError("The recorder flow and start path must be strings.");
  }
  if (!startPath.startsWith("/") || startPath.startsWith("//")) {
    throw new TypeError("The recorder start path must be one same-origin absolute path.");
  }
  let url: URL;
  try {
    url = new URL(startPath, origin);
  } catch {
    throw new TypeError("The recorder start path must be a valid URL path.");
  }
  if (url.origin !== origin) {
    throw new TypeError("The recorder start path cannot select another origin.");
  }
  const path = `${url.pathname}${url.search}${url.hash}`;
  const validation = validateContract({
    flow,
    steps: [{ visit: path }],
    version: CONTRACT_VERSION,
  });
  if (!validation.ok) {
    throw new TypeError("The recorder flow or start path fails Contract V1 validation.");
  }
  return validation.value;
}

function recordedPath(path: string): string | undefined {
  const validation = validateContract({
    flow: "navigation",
    steps: [{ visit: path }],
    version: CONTRACT_VERSION,
  });
  if (!validation.ok) return undefined;
  const step = validation.value.steps[0];
  return step !== undefined && "visit" in step ? step.visit : undefined;
}

function actionKey(documentToken: string, marker: string): string {
  return `${documentToken}\u0000${marker}`;
}

export async function startActionRecorder(
  options: StartActionRecorderOptions,
): Promise<ActionRecorderSession> {
  let origin: string;
  try {
    origin = normalizeLoopbackOrigin(options.origin);
  } catch {
    throw new TypeError("The recorder origin must be one exact HTTP(S) loopback origin.");
  }
  const seed = normalizedStartContract(options.flow, origin, options.startPath);
  const firstStep = seed.steps[0];
  if (firstStep === undefined || !("visit" in firstStep)) {
    throw new TypeError("The recorder seed did not contain a visit step.");
  }
  try {
    await waitForLoopbackReady(origin, options.readiness);
  } catch {
    throw startupFailure(
      RECORDER_ISSUE_CODES.recorderFailure,
      "Recorder readiness failed before browser startup.",
    );
  }

  let guarded: Awaited<ReturnType<typeof createGuardedBrowserContext>>;
  try {
    guarded = await createGuardedBrowserContext(options.browser, origin);
  } catch {
    throw startupFailure(
      RECORDER_ISSUE_CODES.recorderFailure,
      "Recorder browser-context startup failed.",
    );
  }

  let startupIssue: RecorderIssue | undefined;
  try {
    const page = await guarded.context.newPage();
    const topology = createPageTopologyObservation(guarded.context, page);
    const identifier = randomUUID().replaceAll("-", "");
    const bindingName = `__mergevow_record_${identifier}`;
    const markerAttribute = `data-mergevow-recorder-${identifier}`;
    const stateName = `__mergevow_recorder_state_${identifier}`;
    const initOptions: RecorderInitScriptOptions = Object.freeze({
      allowedRoles: ARIA_ROLES,
      bindingName,
      markerAttribute,
      maxCandidates: RECORDER_LIMITS.maxCandidatesPerEvent,
      maxElements: RECORDER_LIMITS.maxElementsScanned,
      maxLocatorTextLength: CONTRACT_LIMITS.maxLocatorTextLength,
      maxPendingEvents: RECORDER_LIMITS.maxPendingEvents,
      maxSemanticComputations: RECORDER_LIMITS.maxSemanticComputations,
      maxValueLength: CONTRACT_LIMITS.maxValueLength,
      stateName,
    });

    const recordedSteps: RecordedStep[] = [{ step: { visit: firstStep.visit } }];
    const recordedClicks = new Set<string>();
    const navigationRequestOwners = new WeakMap<Request, string>();
    let accepting = true;
    let currentNavigationRequest: Request | undefined;
    let fatalIssue: RecorderIssue | undefined;
    let firstNavigation = true;
    let lastNavigationKey: string | undefined;
    let ownedNextNavigation: string | undefined;
    let pendingNavigationIntent: string | undefined;
    let queue = Promise.resolve();

    const setFatal = (value: RecorderIssue): void => {
      fatalIssue ??= value;
    };

    const enqueueOperation = (handler: () => Promise<void> | void): Promise<void> => {
      const operation = queue.then(handler);
      queue = operation.catch(() => {
        setFatal(issue(RECORDER_ISSUE_CODES.recorderFailure, "Recorder event processing failed."));
      });
      return operation;
    };

    const appendStep = (step: ContractStep, fillTarget?: string): void => {
      if (fatalIssue !== undefined) return;
      const previous = recordedSteps.at(-1);
      if (
        fillTarget !== undefined &&
        "fill" in step &&
        previous !== undefined &&
        previous.fillTarget === fillTarget &&
        "fill" in previous.step
      ) {
        recordedSteps[recordedSteps.length - 1] = {
          fillTarget,
          step: {
            fill: {
              locator: previous.step.fill.locator,
              value: step.fill.value,
            },
          },
        };
        return;
      }
      if (recordedSteps.length >= CONTRACT_LIMITS.maxSteps) {
        setFatal(
          issue(
            RECORDER_ISSUE_CODES.stepLimit,
            `Recording exceeds the ${CONTRACT_LIMITS.maxSteps} step limit.`,
          ),
        );
        return;
      }
      recordedSteps.push(fillTarget === undefined ? { step } : { fillTarget, step });
    };

    const handleRejected = (event: BrowserRejectedEvent): void => {
      switch (event.kind) {
        case "eventLimit":
          setFatal(
            issue(
              RECORDER_ISSUE_CODES.eventLimit,
              "The recorder browser-event queue exceeded its configured bound.",
            ),
          );
          return;
        case "sensitive":
          setFatal(
            issue(RECORDER_ISSUE_CODES.sensitiveControl, "Sensitive controls cannot be recorded."),
          );
          return;
        case "valueLimit":
          setFatal(
            issue(
              RECORDER_ISSUE_CODES.valueLimit,
              "The control value exceeds the Contract V1 limit.",
            ),
          );
          return;
        case "pageLimit":
          setFatal(
            issue(
              RECORDER_ISSUE_CODES.unsupportedLocator,
              "The document exceeds the bounded semantic-locator scan.",
            ),
          );
          return;
        case "uncheck":
          setFatal(
            issue(
              RECORDER_ISSUE_CODES.unsupportedAction,
              "Contract V1 supports check but not uncheck.",
            ),
          );
          return;
        case "unsupported":
          setFatal(
            issue(
              RECORDER_ISSUE_CODES.unsupportedAction,
              "The browser action is outside Contract V1.",
            ),
          );
          return;
      }
    };

    const handleAction = async (event: BrowserActionEvent): Promise<void> => {
      const selection = await selectCapturedLocator(page, event, markerAttribute, stateName);
      if (!selection.ok) {
        setFatal(
          issue(
            selection.ambiguous
              ? RECORDER_ISSUE_CODES.ambiguousLocator
              : RECORDER_ISSUE_CODES.unsupportedLocator,
            selection.ambiguous
              ? `No approved semantic locator uniquely identifies the ${event.kind} target.`
              : `The ${event.kind} target has no supported semantic locator.`,
          ),
        );
        return;
      }
      switch (event.kind) {
        case "check":
          appendStep({ check: selection.locator });
          return;
        case "click":
          appendStep({ click: selection.locator });
          recordedClicks.add(actionKey(event.documentToken, event.marker));
          return;
        case "fill":
          if (event.value === undefined) {
            setFatal(issue(RECORDER_ISSUE_CODES.malformedEvent, "A fill event omitted its value."));
            return;
          }
          appendStep(
            { fill: { locator: selection.locator, value: event.value } },
            actionKey(event.documentToken, event.marker),
          );
          return;
        case "select":
          if (event.value === undefined) {
            setFatal(
              issue(RECORDER_ISSUE_CODES.malformedEvent, "A select event omitted its value."),
            );
            return;
          }
          appendStep({ select: { locator: selection.locator, value: event.value } });
          return;
      }
    };

    const handleNavigationIntent = (event: BrowserNavigationIntentEvent): void => {
      const owner = actionKey(event.documentToken, event.ownerMarker);
      if (event.phase === "begin") {
        pendingNavigationIntent = recordedClicks.has(owner) ? owner : undefined;
      } else if (pendingNavigationIntent === owner) {
        pendingNavigationIntent = undefined;
      }
    };

    const handleNavigation = (event: BrowserNavigationEvent): void => {
      const key = `${event.documentToken}\u0000${event.path}`;
      if (key === lastNavigationKey) return;
      lastNavigationKey = key;
      const path = recordedPath(event.path);
      if (event.origin !== origin || path === undefined) {
        setFatal(
          issue(
            RECORDER_ISSUE_CODES.browserPolicy,
            "Navigation left the exact recorder origin or produced an invalid Contract V1 path.",
          ),
        );
        return;
      }
      if (firstNavigation) {
        firstNavigation = false;
        if (path !== firstStep.visit) {
          setFatal(
            issue(
              RECORDER_ISSUE_CODES.browserPolicy,
              "The first browser document did not match the configured recorder path.",
            ),
          );
        }
        ownedNextNavigation = undefined;
        return;
      }
      const inlineOwner =
        event.ownerMarker === undefined
          ? undefined
          : actionKey(event.documentToken, event.ownerMarker);
      const causedByClick =
        ownedNextNavigation !== undefined ||
        (inlineOwner !== undefined && recordedClicks.has(inlineOwner));
      ownedNextNavigation = undefined;
      if (causedByClick) return;
      if (event.navigationType === "reload") {
        appendStep({ reload: {} });
        return;
      }
      appendStep({ visit: path });
    };

    const handleEvent = async (value: unknown): Promise<void> => {
      if (!accepting || fatalIssue !== undefined) return;
      const event = parseBrowserRecorderEvent(value);
      if (event === undefined) {
        setFatal(
          issue(RECORDER_ISSUE_CODES.malformedEvent, "Browser instrumentation sent invalid data."),
        );
        return;
      }
      if (event.kind === "navigation") {
        handleNavigation(event);
      } else if (event.kind === "navigationIntent") {
        handleNavigationIntent(event);
      } else if ("candidates" in event) {
        await handleAction(event);
      } else {
        handleRejected(event);
      }
    };

    const expireBrowserNavigationIntent = async (): Promise<void> => {
      await page
        .evaluate((name) => {
          const state = (globalThis as Record<string, unknown>)[name] as
            | RecorderDocumentState
            | undefined;
          state?.expireNavigationIntent();
        }, stateName)
        .catch(() => undefined);
    };

    page.on("request", (request) => {
      if (!request.isNavigationRequest() || request.frame() !== page.mainFrame()) return;
      void enqueueOperation(() => {
        const redirectedFrom = request.redirectedFrom();
        const inheritedOwner =
          redirectedFrom === null ? undefined : navigationRequestOwners.get(redirectedFrom);
        const owner = inheritedOwner ?? pendingNavigationIntent;
        pendingNavigationIntent = undefined;
        if (owner !== undefined) navigationRequestOwners.set(request, owner);
        currentNavigationRequest = request;
      });
    });
    page.on("framenavigated", (frame) => {
      if (frame !== page.mainFrame()) return;
      void enqueueOperation(() => {
        ownedNextNavigation =
          currentNavigationRequest === undefined
            ? undefined
            : navigationRequestOwners.get(currentNavigationRequest);
        currentNavigationRequest = undefined;
      });
    });
    const clearFinishedNavigation = (request: Request): void => {
      if (!request.isNavigationRequest() || request.frame() !== page.mainFrame()) return;
      void enqueueOperation(async () => {
        if (request !== currentNavigationRequest) return;
        currentNavigationRequest = undefined;
        await expireBrowserNavigationIntent();
      });
    };
    page.on("requestfailed", clearFinishedNavigation);
    page.on("requestfinished", clearFinishedNavigation);
    page.on("dialog", (dialog) => {
      const dismissal = dialog.dismiss().catch(() => undefined);
      void enqueueOperation(async () => {
        setFatal(
          issue(
            RECORDER_ISSUE_CODES.unsupportedAction,
            "Browser dialogs are outside Contract V1 recording.",
          ),
        );
        await dismissal;
      });
    });

    await guarded.context.exposeBinding(bindingName, (source, value: unknown) => {
      return enqueueOperation(async () => {
        if (source.page !== page || source.frame !== page.mainFrame()) {
          setFatal(
            issue(
              RECORDER_ISSUE_CODES.unsupportedAction,
              "Actions inside additional pages or frames are outside Contract V1 recording.",
            ),
          );
          return;
        }
        await handleEvent(value);
      });
    });

    const bundledScript = await loadBrowserScript();
    const browserScript = `${bundledScript}\n;__mergevowRecorderBundle.recorderInitScript(${JSON.stringify(
      initOptions,
    )});`;
    await guarded.context.addInitScript({ content: browserScript });

    await page.goto(firstStep.visit, { waitUntil: "load" });
    await page.evaluate(async (name) => {
      const state = (globalThis as Record<string, unknown>)[name] as
        | RecorderDocumentState
        | undefined;
      await state?.flush();
    }, stateName);
    await queue;
    if (fatalIssue !== undefined) {
      startupIssue = fatalIssue;
      throw new Error("Recorder startup failed.");
    }
    const initialDocumentToken = await page.evaluate((name) => {
      const state = (globalThis as Record<string, unknown>)[name];
      if (state === null || typeof state !== "object") return undefined;
      const token = (state as { readonly documentToken?: unknown }).documentToken;
      return typeof token === "string" ? token : undefined;
    }, stateName);
    if (initialDocumentToken === undefined) {
      startupIssue = issue(
        RECORDER_ISSUE_CODES.recorderFailure,
        "Recorder browser instrumentation did not initialize.",
      );
      throw new Error("Recorder startup failed.");
    }
    const initialUrl = new URL(page.url());
    const initialPath = `${initialUrl.pathname}${initialUrl.search}${initialUrl.hash}`;
    if (initialUrl.origin !== origin || initialPath !== firstStep.visit) {
      startupIssue = issue(
        RECORDER_ISSUE_CODES.browserPolicy,
        "The first browser document did not match the configured recorder URL.",
      );
      throw new Error("Recorder startup failed.");
    }
    lastNavigationKey ??= `${initialDocumentToken}\u0000${initialPath}`;
    firstNavigation = false;
    const initialTopology = await topology.synchronize();
    if (initialTopology.currentPages !== 1 || initialTopology.maximumObservedPages !== 1) {
      startupIssue = issue(
        RECORDER_ISSUE_CODES.pageTopology,
        "Recorder startup requires exactly one controlled page.",
      );
      throw new Error("Recorder startup failed.");
    }

    let stopPromise: Promise<ActionRecorderResult> | undefined;
    const stop = (): Promise<ActionRecorderResult> => {
      stopPromise ??= (async () => {
        try {
          if (!page.isClosed()) {
            await page
              .evaluate(async (name) => {
                const state = (globalThis as Record<string, unknown>)[name] as
                  | RecorderDocumentState
                  | undefined;
                await state?.flush();
              }, stateName)
              .catch(() => undefined);
          }
          await queue;
          accepting = false;
          await queue;

          const violation = guarded.getViolation();
          const transportFailure = guarded.getTransportFailure();
          let boundaryIssue =
            violation === undefined && transportFailure === undefined
              ? undefined
              : issue(
                  RECORDER_ISSUE_CODES.browserPolicy,
                  "The guarded browser policy or transport failed during recording.",
                );

          if (boundaryIssue === undefined && page.isClosed()) {
            boundaryIssue = issue(
              RECORDER_ISSUE_CODES.pageTopology,
              "The controlled recorder page closed before recording completed.",
            );
          }
          fatalIssue = boundaryIssue ?? fatalIssue;
          const snapshot = await topology.synchronize();
          if (
            boundaryIssue === undefined &&
            (snapshot.currentPages !== 1 ||
              snapshot.maximumObservedPages !== 1 ||
              guarded.context.pages().length !== 1 ||
              guarded.context.pages()[0] !== page)
          ) {
            boundaryIssue = issue(
              RECORDER_ISSUE_CODES.pageTopology,
              `Expected one recorder page; observed up to ${snapshot.maximumObservedPages} (${snapshot.currentPages} currently).`,
            );
          }
          fatalIssue = boundaryIssue ?? fatalIssue;
          if (fatalIssue !== undefined) return failure(fatalIssue);

          const validation = validateContract({
            flow: seed.flow,
            steps: recordedSteps.map((recorded) => recorded.step),
            version: CONTRACT_VERSION,
          });
          if (!validation.ok) {
            return failure(
              issue(
                RECORDER_ISSUE_CODES.contractInvalid,
                "The recorded contract failed Contract V1 validation.",
              ),
            );
          }
          return Object.freeze({ contract: freezeContract(validation.value), ok: true });
        } catch {
          return failure(
            fatalIssue ?? issue(RECORDER_ISSUE_CODES.recorderFailure, "Recorder shutdown failed."),
          );
        } finally {
          if (!page.isClosed()) {
            await page
              .evaluate((name) => {
                const state = (globalThis as Record<string, unknown>)[name] as
                  | RecorderDocumentState
                  | undefined;
                state?.cleanup();
              }, stateName)
              .catch(() => undefined);
          }
          await guarded.close();
        }
      })();
      return stopPromise;
    };

    return Object.freeze({ page, stop });
  } catch {
    const retainedBoundaryFailure =
      guarded.getViolation() !== undefined || guarded.getTransportFailure() !== undefined;
    await guarded.close().catch(() => undefined);
    throw new ActionRecorderStartError(
      retainedBoundaryFailure
        ? issue(
            RECORDER_ISSUE_CODES.browserPolicy,
            "The guarded browser policy or transport failed during recorder startup.",
          )
        : (startupIssue ?? issue(RECORDER_ISSUE_CODES.recorderFailure, "Recorder startup failed.")),
    );
  }
}
