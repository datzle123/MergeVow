import { computeAccessibleName, getRole, isInaccessible } from "dom-accessibility-api";

import {
  type CheckpointSelection,
  type CheckpointTargetOption,
  mountCheckpointOverlay,
} from "./overlay.js";
import type { BrowserLocatorCandidate, CapturedAssertionKind } from "./types.js";

export interface RecorderInitScriptOptions {
  readonly allowedRoles: readonly string[];
  readonly bindingName: string;
  readonly checkpointOverlay: boolean;
  readonly markerAttribute: string;
  readonly maxCandidates: number;
  readonly maxElements: number;
  readonly maxLocatorTextLength: number;
  readonly maxOverlayHiddenTargets: number;
  readonly maxPendingEvents: number;
  readonly maxSemanticComputations: number;
  readonly maxUrlLength: number;
  readonly maxValueLength: number;
  readonly overlayHostId: string;
  readonly stateName: string;
}

export interface RecorderDocumentState {
  readonly cleanup: () => void;
  readonly documentToken: string;
  readonly expireNavigationIntent: () => void;
  readonly flush: () => Promise<void>;
}

export function recorderInitScript(options: RecorderInitScriptOptions): void {
  type CandidateLocator =
    | { readonly label: string }
    | { readonly name: string; readonly role: string }
    | { readonly testId: string };
  interface Candidate {
    readonly locator: CandidateLocator;
    readonly matches: number;
  }
  interface CandidateProof {
    readonly candidates: readonly Candidate[];
    readonly exhausted: boolean;
  }
  interface SemanticBudget {
    exhausted: boolean;
    sensitiveNames?: SensitiveNameSnapshot;
    work: number;
  }
  interface SensitiveNameSnapshot {
    readonly cache: WeakMap<Element, boolean>;
    exhausted: boolean;
    work: number;
  }
  interface VisibilitySnapshot {
    readonly cache: WeakMap<Element, boolean>;
    exhausted: boolean;
    work: number;
  }
  interface VisibilityFrame {
    readonly element: Element;
    initialized: boolean;
    nextChild?: ChildNode | null;
    pendingChild?: Element;
  }
  interface NavigationOwner {
    readonly element: Element;
    readonly hrefBefore: string;
    readonly marker: string;
  }
  interface PreparedAction {
    readonly candidates: readonly Candidate[];
    readonly marker: string;
  }
  interface PendingFill {
    readonly candidates: readonly Candidate[];
    readonly element: Element;
    readonly marker: string;
    readonly value: string;
  }
  type RecorderWindow = typeof globalThis &
    Record<string, ((event: unknown) => Promise<unknown>) | RecorderDocumentState>;

  const recorderWindow = globalThis as RecorderWindow;
  if (Object.hasOwn(recorderWindow, options.stateName)) return;
  const recorderBinding = recorderWindow[options.bindingName];
  if (typeof recorderBinding !== "function") return;

  const allowedRoles = new Set(options.allowedRoles);
  const ariaDisabledRoles = new Set([
    "application",
    "button",
    "checkbox",
    "columnheader",
    "combobox",
    "grid",
    "gridcell",
    "group",
    "link",
    "listbox",
    "menu",
    "menubar",
    "menuitem",
    "menuitemcheckbox",
    "menuitemradio",
    "option",
    "radio",
    "radiogroup",
    "row",
    "rowheader",
    "scrollbar",
    "searchbox",
    "separator",
    "slider",
    "spinbutton",
    "switch",
    "tab",
    "tablist",
    "textbox",
    "toolbar",
    "tree",
    "treegrid",
    "treeitem",
  ]);
  const ariaCheckedRoles = new Set([
    "checkbox",
    "menuitemcheckbox",
    "menuitemradio",
    "option",
    "radio",
    "switch",
    "treeitem",
  ]);
  const documentToken = crypto.randomUUID();
  const markedElements = new Set<Element>();
  const markerValues = new WeakMap<Element, string>();
  const originalMarkers = new WeakMap<Element, string | null>();
  const pendingBindings = new Set<Promise<void>>();
  const originalFormSubmitDescriptor = Object.getOwnPropertyDescriptor(
    HTMLFormElement.prototype,
    "submit",
  );
  const originalFormSubmit = HTMLFormElement.prototype.submit;
  const confirmedNavigationEvents = new WeakSet<Event>();
  const confirmedNavigationOwners = new WeakSet<NavigationOwner>();
  let accepting = true;
  let checkpointOverlayCleanup: (() => void) | undefined;
  let checkpointOverlayHost: HTMLElement | undefined;
  let checkpointPickerActive = false;
  let fillFrame: number | undefined;
  let navigationOwner: NavigationOwner | undefined;
  let navigationOwnerTimer: ReturnType<typeof setTimeout> | undefined;
  let nextMarker = 0;
  let pendingFill: PendingFill | undefined;

  const boundedText = (value: string | null | undefined): string | undefined => {
    if (
      typeof value !== "string" ||
      value.length === 0 ||
      value.length > options.maxLocatorTextLength * 4
    ) {
      return undefined;
    }
    const normalized = value.replace(/\s+/gu, " ").trim();
    return normalized.length > 0 && normalized.length <= options.maxLocatorTextLength
      ? normalized
      : undefined;
  };

  const boundedTestId = (element: Element): string | undefined => {
    const value = element.getAttribute("data-testid");
    return value !== null && value.length > 0 && value.length <= options.maxLocatorTextLength
      ? value
      : undefined;
  };

  const hasLabelSource = (element: Element): boolean => {
    if (element.hasAttribute("aria-label") || element.hasAttribute("aria-labelledby")) return true;
    if (
      element instanceof HTMLButtonElement ||
      element instanceof HTMLInputElement ||
      element instanceof HTMLMeterElement ||
      element instanceof HTMLOutputElement ||
      element instanceof HTMLProgressElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement
    ) {
      return (element.labels?.length ?? 0) > 0;
    }
    return false;
  };

  const allElements = (): readonly Element[] | undefined => {
    const elements: Element[] = [];
    const roots: (Document | ShadowRoot)[] = [document];
    while (roots.length > 0) {
      const root = roots.pop();
      if (root === undefined) break;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
      let current = walker.nextNode();
      while (current !== null) {
        const element = current as Element;
        if (element === checkpointOverlayHost) {
          current = walker.nextNode();
          continue;
        }
        elements.push(element);
        if (elements.length > options.maxElements) return undefined;
        if (element.shadowRoot !== null) roots.push(element.shadowRoot);
        current = walker.nextNode();
      }
    }
    return elements;
  };

  const candidatesFor = (
    target: Element,
    includeHidden = false,
    retainedElements?: readonly Element[],
    retainedBudget?: SemanticBudget,
  ): CandidateProof | undefined => {
    const elements = retainedElements ?? allElements();
    if (elements === undefined) return undefined;
    const candidates: Candidate[] = [];
    const keys = new Set<string>();
    const budget = retainedBudget ?? { exhausted: false, work: 0 };
    const sensitiveNames =
      budget.sensitiveNames ??
      ({
        cache: new WeakMap<Element, boolean>(),
        exhausted: false,
        work: 0,
      } as SensitiveNameSnapshot);
    budget.sensitiveNames = sensitiveNames;
    const spend = (): boolean => {
      if (budget.work >= options.maxSemanticComputations) {
        budget.exhausted = true;
        return false;
      }
      budget.work += 1;
      return true;
    };
    const nameTouchesPassword = (element: Element): boolean | undefined => {
      const cached = sensitiveNames.cache.get(element);
      if (cached !== undefined) return cached;
      if (sensitiveNames.exhausted) return undefined;

      const pending = [element];
      const visited = new Set<Element>();
      const addIdReferences = (
        source: Element,
        attribute: "aria-labelledby" | "aria-owns",
      ): boolean => {
        const value = source.getAttribute(attribute);
        if (value === null || value.trim().length === 0) return true;
        if (value.length > options.maxValueLength) return false;
        const ids = value.trim().split(/\s+/u);
        if (ids.length > options.maxCandidates) return false;
        const root = source.getRootNode();
        for (const id of ids) {
          const referenced =
            (root instanceof Document || root instanceof ShadowRoot
              ? root.getElementById(id)
              : undefined) ?? document.getElementById(id);
          if (referenced !== null && referenced !== undefined) pending.push(referenced);
        }
        return true;
      };

      while (pending.length > 0) {
        const current = pending.pop();
        if (current === undefined || visited.has(current)) continue;
        if (sensitiveNames.work >= options.maxElements * 4) {
          sensitiveNames.exhausted = true;
          budget.exhausted = true;
          return undefined;
        }
        sensitiveNames.work += 1;
        const known = sensitiveNames.cache.get(current);
        if (known === true) {
          sensitiveNames.cache.set(element, true);
          return true;
        }
        if (known === false) continue;
        visited.add(current);
        if (current instanceof HTMLInputElement && current.type.toLowerCase() === "password") {
          sensitiveNames.cache.set(element, true);
          return true;
        }
        for (const child of current.children) pending.push(child);
        if (current.shadowRoot !== null) {
          for (const child of current.shadowRoot.children) pending.push(child);
        }
        if (current instanceof HTMLSlotElement) {
          try {
            pending.push(...current.assignedElements({ flatten: true }));
          } catch {
            sensitiveNames.exhausted = true;
            budget.exhausted = true;
            return undefined;
          }
        }
        if (
          !addIdReferences(current, "aria-labelledby") ||
          !addIdReferences(current, "aria-owns")
        ) {
          sensitiveNames.exhausted = true;
          budget.exhausted = true;
          return undefined;
        }
        if (
          current instanceof HTMLButtonElement ||
          current instanceof HTMLInputElement ||
          current instanceof HTMLMeterElement ||
          current instanceof HTMLOutputElement ||
          current instanceof HTMLProgressElement ||
          current instanceof HTMLSelectElement ||
          current instanceof HTMLTextAreaElement
        ) {
          for (const label of current.labels ?? []) pending.push(label);
        }
      }
      for (const safe of visited) sensitiveNames.cache.set(safe, false);
      return false;
    };
    const nameFor = (element: Element): string | undefined => {
      const touchesPassword = nameTouchesPassword(element);
      if (touchesPassword !== false) return undefined;
      if (!spend()) return undefined;
      try {
        return boundedText(computeAccessibleName(element, { hidden: includeHidden }));
      } catch {
        return undefined;
      }
    };
    const roleFor = (element: Element): string | undefined => {
      if (!spend()) return undefined;
      try {
        const role = getRole(element);
        return role !== null && allowedRoles.has(role) ? role : undefined;
      } catch {
        return undefined;
      }
    };
    const add = (locator: CandidateLocator, matches: number): void => {
      if (candidates.length >= options.maxCandidates) return;
      const key = JSON.stringify(locator);
      if (keys.has(key)) return;
      keys.add(key);
      candidates.push({ locator, matches });
    };

    const testId = boundedTestId(target);
    if (testId !== undefined) {
      let matches = 0;
      let complete = true;
      for (const element of elements) {
        if (retainedBudget !== undefined && !spend()) {
          complete = false;
          break;
        }
        if (element.getAttribute("data-testid") === testId) matches += 1;
      }
      if (complete) add({ testId }, matches);
    }

    if (hasLabelSource(target)) {
      const label = nameFor(target);
      if (label !== undefined) {
        let matches = 0;
        let complete = true;
        for (const element of elements) {
          if (!hasLabelSource(element)) continue;
          const name = nameFor(element);
          if (budget.exhausted) {
            complete = false;
            break;
          }
          if (name === label) matches += 1;
        }
        if (complete) add({ label }, matches);
      }
    }

    const role = roleFor(target);
    const name = role === undefined ? undefined : nameFor(target);
    if (role !== undefined && name !== undefined && !budget.exhausted) {
      let matches = 0;
      let complete = true;
      for (const element of elements) {
        const candidateRole = roleFor(element);
        if (budget.exhausted) {
          complete = false;
          break;
        }
        if (candidateRole !== role) continue;
        if (!includeHidden) {
          if (!spend()) {
            complete = false;
            break;
          }
          let inaccessible: boolean;
          try {
            inaccessible = isInaccessible(element);
          } catch {
            inaccessible = true;
          }
          if (inaccessible) continue;
        }
        const candidateName = nameFor(element);
        if (budget.exhausted) {
          complete = false;
          break;
        }
        if (candidateName === name) matches += 1;
      }
      if (complete) add({ name, role }, matches);
    }

    return { candidates, exhausted: budget.exhausted };
  };

  const markerFor = (element: Element): string => {
    const existing = markerValues.get(element);
    if (existing !== undefined) return existing;
    nextMarker += 1;
    const value = String(nextMarker);
    originalMarkers.set(element, element.getAttribute(options.markerAttribute));
    markerValues.set(element, value);
    markedElements.add(element);
    element.setAttribute(options.markerAttribute, value);
    return value;
  };

  const invokeBinding = (event: unknown): void => {
    let pending: Promise<void>;
    try {
      pending = Promise.resolve(recorderBinding(event)).then(
        () => undefined,
        () => undefined,
      );
    } catch {
      return;
    }
    pendingBindings.add(pending);
    void pending.finally(() => pendingBindings.delete(pending));
  };

  const send = (event: unknown): void => {
    if (!accepting) return;
    if (pendingBindings.size >= options.maxPendingEvents - 1) {
      accepting = false;
      invokeBinding({
        kind: "eventLimit",
        reason: "The recorder browser-event queue reached its configured bound.",
      });
      return;
    }
    invokeBinding(event);
  };

  const reject = (
    kind: "pageLimit" | "sensitive" | "uncheck" | "unsupported" | "valueLimit",
    reason: string,
  ): void => send({ kind, reason });

  const prepareAction = (element: Element): PreparedAction | undefined => {
    const proof = candidatesFor(element);
    if (proof === undefined) {
      reject("pageLimit", "The document has too many elements for bounded locator capture.");
      return undefined;
    }
    if (proof.exhausted && !proof.candidates.some((candidate) => candidate.matches === 1)) {
      reject("pageLimit", "The document exceeds the bounded semantic-locator computation budget.");
      return undefined;
    }
    const marker = markerFor(element);
    return { candidates: proof.candidates, marker };
  };

  const emitPreparedAction = (
    kind: "check" | "click" | "fill" | "select",
    prepared: PreparedAction,
    value?: string,
    mayNavigate?: boolean,
  ): string | undefined => {
    if (value !== undefined && value.length > options.maxValueLength) {
      reject("valueLimit", "The control value exceeds the Contract V1 limit.");
      return undefined;
    }
    send({
      candidates: prepared.candidates,
      documentToken,
      kind,
      marker: prepared.marker,
      ...(mayNavigate === undefined ? {} : { mayNavigate }),
      ...(value === undefined ? {} : { value }),
    });
    return prepared.marker;
  };

  const emitAction = (
    kind: "check" | "click" | "fill" | "select",
    element: Element,
    value?: string,
    mayNavigate?: boolean,
  ): string | undefined => {
    const prepared = prepareAction(element);
    return prepared === undefined
      ? undefined
      : emitPreparedAction(kind, prepared, value, mayNavigate);
  };

  const flushPendingFill = (): void => {
    if (fillFrame !== undefined) {
      cancelAnimationFrame(fillFrame);
      fillFrame = undefined;
    }
    const current = pendingFill;
    pendingFill = undefined;
    if (current !== undefined) emitPreparedAction("fill", current, current.value);
  };

  const queueFill = (element: Element, value: string): void => {
    if (value.length > options.maxValueLength) {
      pendingFill = undefined;
      if (fillFrame !== undefined) cancelAnimationFrame(fillFrame);
      fillFrame = undefined;
      reject("valueLimit", "The control value exceeds the Contract V1 limit.");
      return;
    }
    if (pendingFill !== undefined && pendingFill.element !== element) flushPendingFill();
    if (pendingFill === undefined) {
      const prepared = prepareAction(element);
      if (prepared === undefined) return;
      pendingFill = { ...prepared, element, value };
    } else {
      pendingFill = { ...pendingFill, value };
    }
    fillFrame ??= requestAnimationFrame(() => {
      fillFrame = undefined;
      flushPendingFill();
    });
  };

  const overlayCandidates = (
    candidates: readonly Candidate[],
  ): readonly BrowserLocatorCandidate[] =>
    candidates as unknown as readonly BrowserLocatorCandidate[];

  const locatorKey = (locator: CandidateLocator): string => {
    if ("label" in locator) return `label:${locator.label}`;
    if ("testId" in locator) return `testId:${locator.testId}`;
    return `role:${locator.role}:${locator.name}`;
  };

  const locatorLabel = (locator: CandidateLocator): string => {
    if ("label" in locator) return `Label: ${locator.label}`;
    if ("testId" in locator) return `Test ID: ${locator.testId}`;
    return `${locator.role}: ${locator.name}`;
  };

  const isRenderedVisible = (
    element: Element,
    retainedSnapshot?: VisibilitySnapshot,
  ): boolean | undefined => {
    const snapshot =
      retainedSnapshot ??
      ({ cache: new WeakMap<Element, boolean>(), exhausted: false, work: 0 } as VisibilitySnapshot);
    const cached = snapshot.cache.get(element);
    if (cached !== undefined) return cached;
    if (snapshot.exhausted) return undefined;

    const spend = (): boolean => {
      if (snapshot.work >= options.maxElements * 2) {
        snapshot.exhausted = true;
        return false;
      }
      snapshot.work += 1;
      return true;
    };
    const frames: VisibilityFrame[] = [{ element, initialized: false }];
    while (frames.length > 0) {
      const frame = frames[frames.length - 1];
      if (frame === undefined) return undefined;
      if (!frame.initialized) {
        if (!spend()) return undefined;
        let style: CSSStyleDeclaration;
        try {
          style = getComputedStyle(frame.element);
        } catch {
          return undefined;
        }
        if (style.display === "contents") {
          frame.initialized = true;
          frame.nextChild = frame.element.firstChild;
          continue;
        }

        let visible: boolean;
        try {
          const checkVisibility = Element.prototype.checkVisibility;
          let styleVisible = true;
          if (typeof checkVisibility === "function") {
            styleVisible = Reflect.apply(checkVisibility, frame.element, []);
          } else {
            const detailsOrSummary = frame.element.closest("details,summary");
            if (
              detailsOrSummary !== frame.element &&
              detailsOrSummary instanceof HTMLDetailsElement &&
              !detailsOrSummary.open
            ) {
              styleVisible = false;
            }
          }
          const box = frame.element.getBoundingClientRect();
          visible =
            styleVisible && style.visibility === "visible" && box.width > 0 && box.height > 0;
        } catch {
          return undefined;
        }
        snapshot.cache.set(frame.element, visible);
        frames.pop();
        continue;
      }

      if (frame.pendingChild !== undefined) {
        const childVisible = snapshot.cache.get(frame.pendingChild);
        if (childVisible === undefined) return undefined;
        delete frame.pendingChild;
        if (childVisible) {
          snapshot.cache.set(frame.element, true);
          frames.pop();
        }
        continue;
      }

      const child = frame.nextChild;
      if (child === null || child === undefined) {
        snapshot.cache.set(frame.element, false);
        frames.pop();
        continue;
      }
      frame.nextChild = child.nextSibling;
      if (child.nodeType === Node.ELEMENT_NODE) {
        const childElement = child as Element;
        const childVisible = snapshot.cache.get(childElement);
        if (childVisible === true) {
          snapshot.cache.set(frame.element, true);
          frames.pop();
        } else if (childVisible === undefined) {
          frame.pendingChild = childElement;
          frames.push({ element: childElement, initialized: false });
        }
        continue;
      }
      if (child.nodeType === Node.TEXT_NODE) {
        if (!spend()) return undefined;
        try {
          const range = child.ownerDocument?.createRange();
          if (range === undefined) return undefined;
          range.selectNode(child);
          const box = range.getBoundingClientRect();
          if (box.width > 0 && box.height > 0) {
            snapshot.cache.set(frame.element, true);
            frames.pop();
          }
        } catch {
          return undefined;
        }
      }
    }
    return snapshot.cache.get(element);
  };

  const composedParent = (element: Element): Element | undefined => {
    if (element.parentElement !== null) return element.parentElement;
    const root = element.getRootNode();
    return root instanceof ShadowRoot ? root.host : undefined;
  };

  const isReplayDisabled = (element: Element): boolean | undefined => {
    try {
      if (element.matches(":disabled")) return true;
    } catch {
      return undefined;
    }

    let current: Element | undefined = element;
    let inherited = false;
    let visited = 0;
    while (current !== undefined) {
      visited += 1;
      if (visited > options.maxElements) return undefined;
      let supportsAriaDisabled = inherited;
      if (!supportsAriaDisabled) {
        try {
          const role = getRole(current);
          supportsAriaDisabled = role !== null && ariaDisabledRoles.has(role);
        } catch {
          return undefined;
        }
      }
      if (!supportsAriaDisabled) return false;
      const state = (current.getAttribute("aria-disabled") ?? "").toLowerCase();
      if (state === "true") return true;
      if (state === "false") return false;
      inherited = true;
      current = composedParent(current);
    }
    return false;
  };

  const isReplayChecked = (element: Element): boolean | undefined => {
    if (
      element instanceof HTMLInputElement &&
      ["checkbox", "radio"].includes(element.type.toLowerCase())
    ) {
      return element.checked;
    }
    let role: string | null;
    try {
      role = getRole(element);
    } catch {
      return undefined;
    }
    if (role === null || !ariaCheckedRoles.has(role)) return undefined;
    return element.getAttribute("aria-checked") === "true";
  };

  const captureCheckpointTarget = (
    element: Element,
    assertionKind: Exclude<CapturedAssertionKind, "hidden" | "url">,
    retainedElements?: readonly Element[],
    retainedBudget?: SemanticBudget,
    retainedVisibility?: VisibilitySnapshot,
  ):
    | { readonly message: string; readonly ok: false }
    | { readonly ok: true; readonly value: CheckpointSelection } => {
    const renderedVisible = isRenderedVisible(element, retainedVisibility);
    if (renderedVisible === undefined) {
      reject("pageLimit", "The checkpoint visibility lookup exceeded its bounded work.");
      return { message: "The checkpoint visibility could not be read within bounds.", ok: false };
    }
    if (!renderedVisible) {
      return { message: "The selected element is not visible.", ok: false };
    }
    if (element instanceof HTMLInputElement && element.type.toLowerCase() === "password") {
      reject("sensitive", "Password controls cannot become checkpoints.");
      return { message: "Password controls cannot become checkpoints.", ok: false };
    }
    const proof = candidatesFor(element, false, retainedElements, retainedBudget);
    if (proof === undefined) {
      reject("pageLimit", "The document has too many elements for bounded checkpoint capture.");
      return { message: "The document exceeds the checkpoint scan bound.", ok: false };
    }
    const hasEligibleCandidate = proof.candidates.some((candidate) =>
      assertionKind === "count" ? candidate.matches > 0 : candidate.matches === 1,
    );
    if (proof.exhausted && !hasEligibleCandidate) {
      reject("pageLimit", "The document exceeds the checkpoint semantic-work budget.");
      return { message: "The document exceeds the checkpoint work bound.", ok: false };
    }
    let expected: boolean | string | undefined;
    switch (assertionKind) {
      case "checked":
        expected = isReplayChecked(element);
        if (expected === undefined) {
          return { message: "Checked checkpoints require a checkbox or radio.", ok: false };
        }
        break;
      case "disabled":
        expected = isReplayDisabled(element);
        if (expected === undefined) {
          reject("pageLimit", "The disabled checkpoint exceeded its bounded state lookup.");
          return { message: "The disabled state could not be read within bounds.", ok: false };
        }
        break;
      case "text":
        if (!(element instanceof HTMLElement)) {
          return { message: "Text checkpoints require an HTML element.", ok: false };
        }
        expected = element.innerText.replace(/\s+/gu, " ").trim();
        break;
      case "value":
        if (
          !(
            element instanceof HTMLInputElement ||
            element instanceof HTMLSelectElement ||
            element instanceof HTMLTextAreaElement
          )
        ) {
          return { message: "Value checkpoints require an input, select, or textarea.", ok: false };
        }
        if (element instanceof HTMLInputElement) {
          const type = element.type.toLowerCase();
          if (type === "file") {
            reject("unsupported", "File inputs cannot become value checkpoints.");
            return { message: "File inputs cannot become value checkpoints.", ok: false };
          }
        }
        expected = element.value;
        break;
      case "count":
      case "visible":
        break;
      default:
        return { message: "Unsupported checkpoint type.", ok: false };
    }
    if (typeof expected === "string" && expected.length > options.maxValueLength) {
      return { message: "The observed checkpoint value exceeds the Contract V1 limit.", ok: false };
    }
    return {
      ok: true,
      value: {
        assertionKind,
        candidates: overlayCandidates(proof.candidates),
        ...(expected === undefined ? {} : { expected }),
        target: element,
      },
    };
  };

  const captureUrlCheckpoint = ():
    | { readonly message: string; readonly ok: false }
    | { readonly ok: true; readonly value: CheckpointSelection } => {
    const path = `${location.pathname}${location.search}${location.hash}`;
    if (location.origin.length > options.maxUrlLength || path.length > options.maxUrlLength) {
      return { message: "The current URL exceeds the Contract V1 limit.", ok: false };
    }
    return { ok: true, value: { assertionKind: "url", origin: location.origin, path } };
  };

  const visibleCheckpointTargets = (
    assertionKind: Exclude<CapturedAssertionKind, "hidden" | "url">,
  ):
    | { readonly message: string; readonly ok: false }
    | { readonly ok: true; readonly value: readonly CheckpointTargetOption[] } => {
    const elements = allElements();
    if (elements === undefined) {
      reject("pageLimit", "The document has too many elements for bounded checkpoint browsing.");
      return { message: "The document exceeds the checkpoint scan bound.", ok: false };
    }
    const budget: SemanticBudget = { exhausted: false, work: 0 };
    const visibility: VisibilitySnapshot = {
      cache: new WeakMap<Element, boolean>(),
      exhausted: false,
      work: 0,
    };
    const seen = new Set<string>();
    const targets: CheckpointTargetOption[] = [];
    for (const element of elements) {
      if (element instanceof HTMLInputElement && element.type.toLowerCase() === "password")
        continue;
      const renderedVisible = isRenderedVisible(element, visibility);
      if (renderedVisible === undefined) {
        reject("pageLimit", "The checkpoint target list exceeded its visibility-work budget.");
        return { message: "The checkpoint target list exceeds the work bound.", ok: false };
      }
      if (!renderedVisible) continue;
      if (
        assertionKind === "value" &&
        element instanceof HTMLInputElement &&
        element.type.toLowerCase() === "file"
      ) {
        continue;
      }
      const captured = captureCheckpointTarget(
        element,
        assertionKind,
        elements,
        budget,
        visibility,
      );
      if (captured.ok) {
        const candidate = captured.value.candidates?.find(
          (entry) =>
            (assertionKind === "count" ? entry.matches > 0 : entry.matches === 1) &&
            !seen.has(locatorKey(entry.locator)),
        );
        if (candidate !== undefined) {
          seen.add(locatorKey(candidate.locator));
          targets.push({
            label: locatorLabel(candidate.locator),
            selection: captured.value,
          });
          if (targets.length >= options.maxOverlayHiddenTargets) break;
        }
      }
      if (budget.exhausted) break;
    }
    if (budget.exhausted) {
      reject("pageLimit", "The checkpoint target list exceeded its semantic-work budget.");
      return { message: "The checkpoint target list exceeds the work bound.", ok: false };
    }
    return { ok: true, value: targets };
  };

  const hiddenCheckpointTargets = ():
    | { readonly message: string; readonly ok: false }
    | { readonly ok: true; readonly value: readonly CheckpointTargetOption[] } => {
    const elements = allElements();
    if (elements === undefined) {
      reject("pageLimit", "The document has too many elements for bounded hidden checkpoints.");
      return { message: "The document exceeds the checkpoint scan bound.", ok: false };
    }
    const budget: SemanticBudget = { exhausted: false, work: 0 };
    const visibility: VisibilitySnapshot = {
      cache: new WeakMap<Element, boolean>(),
      exhausted: false,
      work: 0,
    };
    const seen = new Set<string>();
    const targets: CheckpointTargetOption[] = [];
    for (const element of elements) {
      if (element instanceof HTMLInputElement && element.type.toLowerCase() === "password")
        continue;
      const renderedVisible = isRenderedVisible(element, visibility);
      if (renderedVisible === undefined) {
        reject("pageLimit", "The hidden checkpoint list exceeded its visibility-work budget.");
        return { message: "The hidden checkpoint list exceeds the work bound.", ok: false };
      }
      if (renderedVisible) continue;
      const proof = candidatesFor(element, true, elements, budget);
      if (proof === undefined) break;
      const candidate = proof.candidates.find(
        (entry) => entry.matches === 1 && !seen.has(locatorKey(entry.locator)),
      );
      if (candidate !== undefined) {
        seen.add(locatorKey(candidate.locator));
        targets.push({
          label: locatorLabel(candidate.locator),
          selection: {
            assertionKind: "hidden",
            candidates: overlayCandidates(proof.candidates),
            target: element,
          },
        });
        if (targets.length >= options.maxOverlayHiddenTargets) break;
      }
      if (budget.exhausted) break;
    }
    if (budget.exhausted) {
      reject("pageLimit", "The hidden checkpoint list exceeded its semantic-work budget.");
      return { message: "The hidden checkpoint list exceeds the work bound.", ok: false };
    }
    return { ok: true, value: targets };
  };

  const recaptureHiddenCheckpoint = (
    element: Element,
  ):
    | { readonly message: string; readonly ok: false }
    | { readonly ok: true; readonly value: CheckpointSelection } => {
    if (!element.isConnected) {
      return { message: "The hidden checkpoint target changed before confirmation.", ok: false };
    }
    if (element instanceof HTMLInputElement && element.type.toLowerCase() === "password") {
      reject("sensitive", "Password controls cannot become checkpoints.");
      return { message: "Password controls cannot become checkpoints.", ok: false };
    }
    const renderedVisible = isRenderedVisible(element);
    if (renderedVisible === undefined) {
      reject("pageLimit", "The hidden checkpoint visibility lookup exceeded its bounded work.");
      return {
        message: "The hidden checkpoint visibility could not be read within bounds.",
        ok: false,
      };
    }
    if (renderedVisible) {
      return { message: "The hidden checkpoint target changed before confirmation.", ok: false };
    }
    const proof = candidatesFor(element, true);
    if (proof === undefined) {
      reject(
        "pageLimit",
        "The document has too many elements for bounded checkpoint confirmation.",
      );
      return { message: "The document exceeds the checkpoint scan bound.", ok: false };
    }
    if (proof.exhausted && !proof.candidates.some((entry) => entry.matches === 1)) {
      reject("pageLimit", "The hidden checkpoint confirmation exceeded its semantic-work budget.");
      return { message: "The hidden checkpoint exceeds the work bound.", ok: false };
    }
    return {
      ok: true,
      value: {
        assertionKind: "hidden",
        candidates: overlayCandidates(proof.candidates),
        target: element,
      },
    };
  };

  const confirmCheckpoint = (
    selection: CheckpointSelection,
    candidate: BrowserLocatorCandidate | undefined,
  ):
    | { readonly message: string; readonly ok: false }
    | { readonly ok: true; readonly value: undefined } => {
    flushPendingFill();
    if (selection.assertionKind === "url") {
      const current = captureUrlCheckpoint();
      if (
        !current.ok ||
        current.value.origin !== selection.origin ||
        current.value.path !== selection.path
      ) {
        return { message: "The URL changed before this checkpoint was confirmed.", ok: false };
      }
      send({
        assertionKind: "url",
        documentToken,
        kind: "assertion",
        origin: selection.origin,
        path: selection.path,
      });
      return { ok: true, value: undefined };
    }
    if (candidate === undefined || selection.target === undefined) {
      return { message: "Choose one semantic locator before adding this checkpoint.", ok: false };
    }
    const current =
      selection.assertionKind === "hidden"
        ? recaptureHiddenCheckpoint(selection.target)
        : captureCheckpointTarget(selection.target, selection.assertionKind);
    if (!current.ok) return current;
    const currentCandidates = current.value.candidates;
    const currentCandidate = currentCandidates?.find(
      (entry) => locatorKey(entry.locator) === locatorKey(candidate.locator),
    );
    const currentExpected =
      selection.assertionKind === "count" ? currentCandidate?.matches : current.value.expected;
    const selectedExpected =
      selection.assertionKind === "count" ? candidate.matches : selection.expected;
    if (
      currentCandidates === undefined ||
      currentCandidate === undefined ||
      (selection.assertionKind === "count"
        ? currentCandidate.matches <= 0
        : currentCandidate.matches !== 1) ||
      currentExpected !== selectedExpected
    ) {
      return { message: "The checkpoint target changed before confirmation.", ok: false };
    }
    send({
      assertionKind: selection.assertionKind,
      candidates: currentCandidates,
      documentToken,
      ...(currentExpected === undefined ? {} : { expected: currentExpected }),
      kind: "assertion",
      locator: currentCandidate.locator,
    });
    return { ok: true, value: undefined };
  };

  const eventElement = (event: Event): Element | undefined =>
    event.composedPath().find((entry): entry is Element => entry instanceof Element);

  const isOverlayEvent = (event: Event): boolean =>
    checkpointOverlayHost !== undefined && event.composedPath().includes(checkpointOverlayHost);

  const isOtherControl = (element: Element): boolean => {
    if (
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement ||
      (element instanceof HTMLElement && element.isContentEditable)
    ) {
      return true;
    }
    if (element instanceof HTMLInputElement) {
      return !["button", "image", "reset", "submit"].includes(element.type.toLowerCase());
    }
    return element instanceof HTMLLabelElement && element.control !== null;
  };

  const actionableClickTarget = (
    event: MouseEvent,
  ): { readonly element: Element; readonly mayNavigate: boolean } | undefined => {
    for (const entry of event.composedPath()) {
      if (!(entry instanceof Element)) continue;
      if (isOtherControl(entry)) return undefined;
      const tagName = entry.tagName.toLowerCase();
      const inputButton =
        entry instanceof HTMLInputElement &&
        ["button", "image", "reset", "submit"].includes(entry.type.toLowerCase());
      if (
        tagName === "button" ||
        tagName === "summary" ||
        ((tagName === "a" || tagName === "area") && entry.hasAttribute("href")) ||
        inputButton ||
        entry.hasAttribute("role") ||
        entry.hasAttribute("data-testid") ||
        entry.hasAttribute("onclick")
      ) {
        const link =
          (tagName === "a" || tagName === "area") &&
          entry.hasAttribute("href") &&
          !entry.hasAttribute("download");
        const submit =
          (entry instanceof HTMLButtonElement && entry.type === "submit" && entry.form !== null) ||
          (entry instanceof HTMLInputElement &&
            ["image", "submit"].includes(entry.type.toLowerCase()) &&
            entry.form !== null);
        return { element: entry, mayNavigate: link || submit };
      }
    }
    return undefined;
  };

  const clearNavigationOwner = (): void => {
    const owner = navigationOwner;
    if (owner !== undefined) {
      send({
        documentToken,
        kind: "navigationIntent",
        ownerMarker: owner.marker,
        phase: "end",
      });
    }
    navigationOwner = undefined;
    if (navigationOwnerTimer !== undefined) clearTimeout(navigationOwnerTimer);
    navigationOwnerTimer = undefined;
  };

  const captureNavigation = (
    navigationType: "back_forward" | "navigate" | "reload",
    ownerMarker?: string,
  ): void => {
    flushPendingFill();
    send({
      documentToken,
      kind: "navigation",
      navigationType,
      ...(ownerMarker === undefined ? {} : { ownerMarker }),
      origin: location.origin,
      path: `${location.pathname}${location.search}${location.hash}`,
    });
  };

  const ownImmediateNavigation = (element: Element, marker: string): void => {
    clearNavigationOwner();
    navigationOwner = { element, hrefBefore: location.href, marker };
  };

  const confirmImmediateNavigation = (event: MouseEvent): void => {
    if (confirmedNavigationEvents.has(event)) return;
    confirmedNavigationEvents.add(event);
    const owner = navigationOwner;
    if (owner === undefined || !event.composedPath().includes(owner.element)) return;
    if (event.defaultPrevented) {
      clearNavigationOwner();
      return;
    }
    send({
      documentToken,
      kind: "navigationIntent",
      ownerMarker: owner.marker,
      phase: "begin",
    });
    queueMicrotask(() => {
      if (navigationOwner !== owner) return;
      if (event.defaultPrevented) {
        clearNavigationOwner();
        return;
      }
      if (confirmedNavigationOwners.has(owner)) return;
      navigationOwnerTimer = setTimeout(() => {
        navigationOwnerTimer = undefined;
        if (navigationOwner !== owner) return;
        if (location.href !== owner.hrefBefore) {
          captureNavigation("navigate", owner.marker);
        }
        clearNavigationOwner();
      }, 0);
    });
  };

  addEventListener(
    "click",
    (event) => {
      if (!event.isTrusted || checkpointPickerActive || isOverlayEvent(event)) return;
      flushPendingFill();
      clearNavigationOwner();
      const directTarget = eventElement(event);
      if (directTarget instanceof HTMLInputElement) {
        const type = directTarget.type.toLowerCase();
        if (type === "password") {
          reject("sensitive", "Password controls cannot be recorded.");
          return;
        }
        if (type === "file") {
          reject("unsupported", "File inputs are outside Contract V1.");
          return;
        }
      }
      const target = actionableClickTarget(event);
      if (target === undefined) return;
      const marker = emitAction("click", target.element, undefined, target.mayNavigate);
      if (marker !== undefined && target.mayNavigate) {
        ownImmediateNavigation(target.element, marker);
      }
    },
    true,
  );

  addEventListener(
    "click",
    (event) => {
      if (event.isTrusted && !checkpointPickerActive && !isOverlayEvent(event)) {
        confirmImmediateNavigation(event);
      }
    },
    false,
  );

  addEventListener(
    "input",
    (event) => {
      if (!event.isTrusted || isOverlayEvent(event)) return;
      clearNavigationOwner();
      const target = eventElement(event);
      if (target instanceof HTMLSelectElement) {
        flushPendingFill();
        if (target.multiple && target.selectedOptions.length !== 1) {
          reject("unsupported", "Multi-value select actions are outside Contract V1.");
          return;
        }
        emitAction("select", target, target.value);
        return;
      }
      if (target instanceof HTMLInputElement) {
        const type = target.type.toLowerCase();
        if (type === "password") {
          reject("sensitive", "Password controls cannot be recorded.");
          return;
        }
        if (type === "file") {
          reject("unsupported", "File inputs are outside Contract V1.");
          return;
        }
        if (["checkbox", "radio"].includes(type)) {
          flushPendingFill();
          if (!target.checked) {
            reject("uncheck", "Contract V1 supports check but not uncheck.");
            return;
          }
          emitAction("check", target);
          return;
        }
        if (
          ![
            "date",
            "datetime-local",
            "email",
            "month",
            "number",
            "search",
            "tel",
            "text",
            "time",
            "url",
            "week",
          ].includes(type)
        ) {
          reject("unsupported", `Input type ${JSON.stringify(type)} is outside Contract V1 fill.`);
          return;
        }
        queueFill(target, target.value);
        return;
      }
      if (target instanceof HTMLTextAreaElement) {
        queueFill(target, target.value);
        return;
      }
      if (target instanceof HTMLElement && target.isContentEditable) {
        queueFill(target, target.innerText);
      }
    },
    true,
  );

  addEventListener(
    "submit",
    (event) => {
      if (!event.isTrusted || isOverlayEvent(event)) return;
      flushPendingFill();
      const submitter = event instanceof SubmitEvent ? event.submitter : null;
      if (navigationOwner === undefined || navigationOwner.element !== submitter) {
        reject(
          "unsupported",
          "Form submission must be initiated by a recorded submit-control click.",
        );
        return;
      }
      const form = event.target instanceof HTMLFormElement ? event.target : undefined;
      const override =
        submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement
          ? submitter
          : undefined;
      const method = override?.hasAttribute("formmethod") ? override.formMethod : form?.method;
      const target = override?.hasAttribute("formtarget") ? override.formTarget : form?.target;
      const action = override?.hasAttribute("formaction") ? override.formAction : form?.action;
      let protocol: string | undefined;
      try {
        protocol = action === undefined ? undefined : new URL(action, location.href).protocol;
      } catch {
        protocol = undefined;
      }
      if (
        form === undefined ||
        !["get", "post"].includes(method ?? "") ||
        !["", "_parent", "_self", "_top"].includes((target ?? "").toLowerCase()) ||
        !["http:", "https:"].includes(protocol ?? "")
      ) {
        reject("unsupported", "The form submission target is outside Contract V1 recording.");
        clearNavigationOwner();
        return;
      }
      const owner = navigationOwner;
      confirmedNavigationOwners.add(owner);
      if (navigationOwnerTimer !== undefined) clearTimeout(navigationOwnerTimer);
      navigationOwnerTimer = undefined;
      queueMicrotask(() => {
        if (navigationOwner === owner && event.defaultPrevented) clearNavigationOwner();
      });
    },
    true,
  );

  addEventListener(
    "submit",
    (event) => {
      if (event.isTrusted && !isOverlayEvent(event) && event.defaultPrevented) {
        clearNavigationOwner();
      }
    },
    false,
  );
  addEventListener(
    "invalid",
    (event) => {
      if (event.isTrusted && !isOverlayEvent(event)) clearNavigationOwner();
    },
    true,
  );

  try {
    Object.defineProperty(HTMLFormElement.prototype, "submit", {
      configurable: true,
      writable: true,
      value: function guardedRecorderSubmit(this: HTMLFormElement): void {
        reject("unsupported", "Programmatic form submission is outside Contract V1 recording.");
        Reflect.apply(originalFormSubmit, this, []);
      },
    });
  } catch {
    reject("unsupported", "The recorder could not guard programmatic form submission.");
  }

  addEventListener(
    "beforeunload",
    () => {
      flushPendingFill();
      if (navigationOwner !== undefined) {
        confirmedNavigationOwners.add(navigationOwner);
        if (navigationOwnerTimer !== undefined) clearTimeout(navigationOwnerTimer);
        navigationOwnerTimer = undefined;
      }
    },
    true,
  );
  addEventListener("pagehide", flushPendingFill, true);

  addEventListener(
    "pageshow",
    () => {
      const navigation = performance.getEntriesByType("navigation")[0] as
        | PerformanceNavigationTiming
        | undefined;
      const type = navigation?.type;
      captureNavigation(
        type === "back_forward" || type === "reload" || type === "navigate" ? type : "navigate",
      );
    },
    { once: true },
  );
  addEventListener("hashchange", () => captureNavigation("navigate", navigationOwner?.marker));
  addEventListener("popstate", () => captureNavigation("back_forward"));

  if (options.checkpointOverlay) {
    try {
      const overlay = mountCheckpointOverlay({
        captureTarget: captureCheckpointTarget,
        captureUrl: captureUrlCheckpoint,
        confirm: confirmCheckpoint,
        hiddenTargets: hiddenCheckpointTargets,
        hostId: options.overlayHostId,
        setPicking: (active) => {
          checkpointPickerActive = active;
        },
        visibleTargets: visibleCheckpointTargets,
      });
      checkpointOverlayHost = overlay.host;
      checkpointOverlayCleanup = overlay.cleanup;
    } catch {
      reject("unsupported", "The checkpoint overlay could not initialize.");
    }
  }

  Object.defineProperty(recorderWindow, options.stateName, {
    configurable: false,
    enumerable: false,
    value: Object.freeze({
      cleanup: () => {
        accepting = false;
        checkpointOverlayCleanup?.();
        checkpointOverlayCleanup = undefined;
        checkpointOverlayHost = undefined;
        if (fillFrame !== undefined) cancelAnimationFrame(fillFrame);
        clearNavigationOwner();
        pendingFill = undefined;
        if (originalFormSubmitDescriptor !== undefined) {
          try {
            Object.defineProperty(
              HTMLFormElement.prototype,
              "submit",
              originalFormSubmitDescriptor,
            );
          } catch {
            // The owned context closes immediately after cleanup.
          }
        }
        for (const element of markedElements) {
          const original = originalMarkers.get(element);
          if (original === null || original === undefined) {
            element.removeAttribute(options.markerAttribute);
          } else {
            element.setAttribute(options.markerAttribute, original);
          }
        }
        markedElements.clear();
      },
      documentToken,
      expireNavigationIntent: clearNavigationOwner,
      flush: async () => {
        flushPendingFill();
        while (pendingBindings.size > 0) {
          await Promise.allSettled(Array.from(pendingBindings));
        }
      },
    }),
    writable: false,
  });
}
