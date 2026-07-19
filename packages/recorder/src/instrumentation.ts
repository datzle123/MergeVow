import { computeAccessibleName, getRole, isInaccessible } from "dom-accessibility-api";

export interface RecorderInitScriptOptions {
  readonly allowedRoles: readonly string[];
  readonly bindingName: string;
  readonly markerAttribute: string;
  readonly maxCandidates: number;
  readonly maxElements: number;
  readonly maxLocatorTextLength: number;
  readonly maxPendingEvents: number;
  readonly maxSemanticComputations: number;
  readonly maxValueLength: number;
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
        elements.push(element);
        if (elements.length > options.maxElements) return undefined;
        if (element.shadowRoot !== null) roots.push(element.shadowRoot);
        current = walker.nextNode();
      }
    }
    return elements;
  };

  const candidatesFor = (target: Element): CandidateProof | undefined => {
    const elements = allElements();
    if (elements === undefined) return undefined;
    const candidates: Candidate[] = [];
    const keys = new Set<string>();
    let exhausted = false;
    let work = 0;
    const spend = (): boolean => {
      if (work >= options.maxSemanticComputations) {
        exhausted = true;
        return false;
      }
      work += 1;
      return true;
    };
    const nameFor = (element: Element): string | undefined => {
      if (!spend()) return undefined;
      try {
        return boundedText(computeAccessibleName(element));
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
      for (const element of elements) {
        if (element.getAttribute("data-testid") === testId) matches += 1;
      }
      add({ testId }, matches);
    }

    if (hasLabelSource(target)) {
      const label = nameFor(target);
      if (label !== undefined) {
        let matches = 0;
        let complete = true;
        for (const element of elements) {
          if (!hasLabelSource(element)) continue;
          const name = nameFor(element);
          if (exhausted) {
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
    if (role !== undefined && name !== undefined && !exhausted) {
      let matches = 0;
      let complete = true;
      for (const element of elements) {
        const candidateRole = roleFor(element);
        if (exhausted) {
          complete = false;
          break;
        }
        if (candidateRole !== role) continue;
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
        const candidateName = nameFor(element);
        if (exhausted) {
          complete = false;
          break;
        }
        if (candidateName === name) matches += 1;
      }
      if (complete) add({ name, role }, matches);
    }

    return { candidates, exhausted };
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

  const eventElement = (event: Event): Element | undefined =>
    event.composedPath().find((entry): entry is Element => entry instanceof Element);

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
      if (!event.isTrusted) return;
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
      if (event.isTrusted) confirmImmediateNavigation(event);
    },
    false,
  );

  addEventListener(
    "input",
    (event) => {
      if (!event.isTrusted) return;
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
      if (!event.isTrusted) return;
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
      if (event.isTrusted && event.defaultPrevented) clearNavigationOwner();
    },
    false,
  );
  addEventListener(
    "invalid",
    (event) => {
      if (event.isTrusted) clearNavigationOwner();
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

  Object.defineProperty(recorderWindow, options.stateName, {
    configurable: false,
    enumerable: false,
    value: Object.freeze({
      cleanup: () => {
        accepting = false;
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
