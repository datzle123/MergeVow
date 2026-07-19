import type { Locator } from "@mergevow/contract";

import type { BrowserLocatorCandidate, CapturedAssertionKind } from "./types.js";

export interface CheckpointSelection {
  readonly assertionKind: CapturedAssertionKind;
  readonly candidates?: readonly BrowserLocatorCandidate[];
  readonly expected?: boolean | string;
  readonly origin?: string;
  readonly path?: string;
  readonly target?: Element;
}

export interface CheckpointTargetOption {
  readonly label: string;
  readonly selection: CheckpointSelection;
}

export type OverlayResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly message: string; readonly ok: false };

export interface CheckpointOverlayRuntime {
  readonly captureTarget: (
    element: Element,
    assertionKind: Exclude<CapturedAssertionKind, "hidden" | "url">,
  ) => OverlayResult<CheckpointSelection>;
  readonly captureUrl: () => OverlayResult<CheckpointSelection>;
  readonly confirm: (
    selection: CheckpointSelection,
    candidate: BrowserLocatorCandidate | undefined,
  ) => OverlayResult<void>;
  readonly hiddenTargets: () => OverlayResult<readonly CheckpointTargetOption[]>;
  readonly hostId: string;
  readonly setPicking: (active: boolean) => void;
  readonly visibleTargets: (
    assertionKind: Exclude<CapturedAssertionKind, "hidden" | "url">,
  ) => OverlayResult<readonly CheckpointTargetOption[]>;
}

export interface CheckpointOverlayMount {
  readonly cleanup: () => void;
  readonly host: HTMLElement;
}

const assertionLabels: Readonly<Record<CapturedAssertionKind, string>> = Object.freeze({
  checked: "Checked",
  count: "Count",
  disabled: "Disabled",
  hidden: "Hidden",
  text: "Text",
  url: "URL",
  value: "Value",
  visible: "Visible",
});

const assertionKinds: readonly CapturedAssertionKind[] = Object.freeze([
  "visible",
  "hidden",
  "text",
  "value",
  "count",
  "checked",
  "disabled",
  "url",
]);

function button(label: string, testId: string): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  element.dataset.testid = testId;
  return element;
}

function locatorDescription(locator: Locator, matches: number): string {
  const suffix = `${matches} match${matches === 1 ? "" : "es"}`;
  if ("label" in locator) return `Label: ${locator.label} (${suffix})`;
  if ("testId" in locator) return `Test ID: ${locator.testId} (${suffix})`;
  return `${locator.role}: ${locator.name} (${suffix})`;
}

function candidatePriority(
  assertionKind: CapturedAssertionKind,
  candidate: BrowserLocatorCandidate,
): number {
  const locator = candidate.locator;
  const controlFirst = ["checked", "disabled", "value"].includes(assertionKind);
  if (controlFirst) {
    if ("label" in locator) return 0;
    if ("role" in locator) return 1;
    return 2;
  }
  if ("role" in locator) return 0;
  if ("label" in locator) return 1;
  return 2;
}

export function mountCheckpointOverlay(runtime: CheckpointOverlayRuntime): CheckpointOverlayMount {
  const host = document.createElement("div");
  host.id = runtime.hostId;
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    :host {
      all: initial;
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 2147483647;
      color-scheme: light;
      --mv-ink: #172022;
      --mv-muted: #58666a;
      --mv-line: #d5dddf;
      --mv-soft: #f4f7f7;
      --mv-teal: #08776d;
      --mv-teal-dark: #075c55;
      --mv-teal-soft: #e4f4f1;
      --mv-amber: #b87808;
      --mv-amber-soft: #fff5d8;
      --mv-danger: #a3292d;
    }
    *, *::before, *::after { box-sizing: border-box; }
    .root {
      display: grid;
      justify-items: end;
      color: var(--mv-ink);
      font: 13px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0;
    }
    button { font: inherit; letter-spacing: 0; }
    button {
      min-height: 36px;
      border: 1px solid #7d8b8e;
      border-radius: 6px;
      background: #ffffff;
      color: var(--mv-ink);
      padding: 7px 11px;
      cursor: pointer;
      transition: background-color 120ms ease, border-color 120ms ease, box-shadow 120ms ease;
    }
    button:hover { border-color: var(--mv-teal); background: #f8fbfa; }
    button:focus-visible {
      outline: 2px solid #ffffff;
      outline-offset: 1px;
      box-shadow: 0 0 0 4px var(--mv-teal);
    }
    button:disabled { cursor: default; opacity: 0.5; }
    .trigger {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      min-height: 42px;
      border-color: var(--mv-ink);
      background: var(--mv-ink);
      color: #ffffff;
      font-weight: 700;
      box-shadow: 0 8px 24px rgba(12, 25, 27, 0.24);
    }
    .trigger:hover { border-color: #26383b; background: #26383b; }
    .trigger-mark { color: #83ddd2; font-size: 18px; font-weight: 500; line-height: 1; }
    .panel {
      width: min(372px, calc(100vw - 24px));
      max-height: min(560px, calc(100vh - 36px));
      overflow: auto;
      border: 1px solid #879396;
      border-radius: 8px;
      background: #ffffff;
      box-shadow: 0 18px 48px rgba(12, 25, 27, 0.28), 0 2px 8px rgba(12, 25, 27, 0.12);
    }
    .panel[hidden], [hidden] { display: none !important; }
    .header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      min-height: 70px;
      padding: 13px 14px 12px;
      border-bottom: 1px solid #314447;
      background: var(--mv-ink);
      color: #ffffff;
    }
    .header-copy { display: grid; gap: 4px; min-width: 0; }
    .meta { display: flex; align-items: center; gap: 8px; min-height: 18px; }
    .brand { color: #83ddd2; font-size: 10px; font-weight: 800; text-transform: uppercase; }
    .recording {
      border: 1px solid #4c8983;
      border-radius: 999px;
      background: #26383b;
      color: #83ddd2;
      padding: 1px 6px;
      font-size: 10px;
      font-weight: 700;
    }
    .title { margin: 0; font-size: 16px; font-weight: 750; line-height: 1.25; }
    .close {
      width: 32px;
      min-width: 32px;
      min-height: 32px;
      border-color: transparent;
      background: transparent;
      padding: 0;
      color: #b9c5c7;
      font-size: 16px;
      font-weight: 700;
    }
    .close:hover { border-color: #4a5b5e; background: #26383b; color: #ffffff; }
    .body { display: grid; gap: 14px; padding: 14px; }
    .field { display: grid; gap: 6px; }
    .label { color: #465458; font-size: 11px; font-weight: 750; text-transform: uppercase; }
    .mode-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 6px;
    }
    .mode {
      min-width: 0;
      min-height: 37px;
      border: 1px solid #c4ced0;
      border-radius: 5px;
      background: #ffffff;
      padding: 6px 4px;
      color: #435154;
      font-size: 11px;
      font-weight: 700;
    }
    .mode:hover { border-color: #77bbb4; background: #eef5f4; color: var(--mv-teal-dark); }
    .mode[aria-pressed="true"] {
      border-color: var(--mv-ink);
      background: var(--mv-ink);
      color: #ffffff;
      box-shadow: inset 0 0 0 1px #314447;
    }
    .pick {
      width: 100%;
      min-height: 42px;
      border-color: #77bbb4;
      background: var(--mv-teal-soft);
      color: var(--mv-teal-dark);
      font-weight: 750;
    }
    .pick:hover { border-color: var(--mv-teal); background: #d9efeb; }
    .preview-field {
      display: grid;
      gap: 5px;
      border: 1px solid #ded9c8;
      border-left: 3px solid var(--mv-amber);
      border-radius: 6px;
      background: #f8f6f0;
      padding: 9px 10px;
    }
    .preview-label { color: #725014; font-size: 10px; font-weight: 800; text-transform: uppercase; }
    .preview {
      min-height: 18px;
      margin: 0;
      color: #3f321a;
      font: 600 12px/1.45 ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
      overflow-wrap: anywhere;
    }
    .status { min-height: 18px; margin: 0; color: var(--mv-muted); font-size: 12px; overflow-wrap: anywhere; }
    .status.error { min-height: 18px; color: var(--mv-danger); }
    .target-list { display: grid; gap: 6px; max-height: 180px; overflow: auto; }
    .target-option { width: 100%; min-height: 38px; text-align: left; overflow-wrap: anywhere; }
    .locator-options { display: grid; gap: 6px; max-height: 132px; overflow: auto; }
    .locator-option {
      width: 100%;
      min-height: 38px;
      border-color: #aeb9bb;
      background: #ffffff;
      padding: 8px 10px;
      text-align: left;
      font: 11px/1.4 ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
      overflow-wrap: anywhere;
    }
    .locator-option[aria-pressed="true"] {
      border-color: var(--mv-teal);
      background: #f0f8f7;
      color: var(--mv-teal-dark);
      box-shadow: inset 3px 0 0 var(--mv-teal);
    }
    .footer {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 11px 14px;
      border-top: 1px solid var(--mv-line);
      background: var(--mv-soft);
    }
    .cancel { border-color: transparent; background: transparent; color: var(--mv-muted); }
    .cancel:hover { border-color: #c4ced0; background: #ffffff; color: var(--mv-ink); }
    .confirm { min-width: 112px; border-color: var(--mv-teal); background: var(--mv-teal); color: #ffffff; font-weight: 750; }
    .confirm:hover { border-color: var(--mv-teal-dark); background: var(--mv-teal-dark); }
    .toast {
      margin-bottom: 8px;
      border: 1px solid #3b4a4d;
      border-radius: 6px;
      background: var(--mv-ink);
      color: #ffffff;
      padding: 8px 10px;
      box-shadow: 0 8px 24px rgba(12, 25, 27, 0.2);
      font-size: 12px;
      font-weight: 650;
    }
    .picker-bar {
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 44px;
      border: 1px solid #405255;
      border-radius: 8px;
      background: var(--mv-ink);
      color: #ffffff;
      padding: 6px 7px 6px 12px;
      box-shadow: 0 14px 38px rgba(12, 25, 27, 0.28);
    }
    .picker-state { color: #e7efef; font-size: 12px; font-weight: 700; }
    .picker-cancel {
      min-height: 32px;
      border-color: #526568;
      background: #26383b;
      color: #ffffff;
      padding: 5px 9px;
      font-size: 11px;
      font-weight: 700;
    }
    .picker-cancel:hover { border-color: #80c8c0; background: #31494b; }
    .highlight {
      position: fixed;
      z-index: 2147483646;
      pointer-events: none;
      border: 2px solid #0b8d82;
      background: rgba(20, 173, 158, 0.12);
      box-shadow: 0 0 0 1px #ffffff, 0 4px 14px rgba(12, 25, 27, 0.2);
    }
    @media (max-width: 520px) {
      :host { right: 8px; bottom: max(8px, env(safe-area-inset-bottom)); left: 8px; }
      .root { width: 100%; }
      .panel { width: 100%; max-height: min(620px, calc(100vh - 16px - env(safe-area-inset-bottom))); }
      .trigger { min-height: 44px; }
      .picker-cancel { min-height: 44px; }
      .close { width: 44px; min-width: 44px; min-height: 44px; }
      .footer button { min-height: 44px; }
      .header { padding: 12px; }
      .body { padding: 12px; }
      .footer { padding: 10px 12px; }
    }
    @media (prefers-reduced-motion: reduce) {
      button { transition: none; }
    }
  `;

  const root = document.createElement("div");
  root.className = "root";
  const panel = document.createElement("section");
  panel.className = "panel";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Add checkpoint");
  panel.id = `${runtime.hostId}-panel`;
  panel.dataset.testid = "mergevow-checkpoint-panel";

  const header = document.createElement("header");
  header.className = "header";
  const headerCopy = document.createElement("div");
  headerCopy.className = "header-copy";
  const meta = document.createElement("div");
  meta.className = "meta";
  const brand = document.createElement("span");
  brand.className = "brand";
  brand.textContent = "MergeVow";
  const recording = document.createElement("span");
  recording.className = "recording";
  recording.textContent = "Recording";
  meta.append(brand, recording);
  const title = document.createElement("h2");
  title.className = "title";
  title.textContent = "Add checkpoint";
  headerCopy.append(meta, title);
  const close = button("X", "mergevow-checkpoint-close");
  close.className = "close";
  close.setAttribute("aria-label", "Close checkpoint panel");
  close.title = "Close";
  header.append(headerCopy, close);

  const body = document.createElement("div");
  body.className = "body";
  const kindField = document.createElement("div");
  kindField.className = "field";
  const kindLabel = document.createElement("span");
  kindLabel.className = "label";
  kindLabel.textContent = "Assertion";
  const kindModes = document.createElement("div");
  kindModes.className = "mode-grid";
  kindModes.dataset.testid = "mergevow-checkpoint-kind";
  kindModes.setAttribute("role", "group");
  kindModes.setAttribute("aria-label", "Assertion type");
  const modeButtons = new Map<CapturedAssertionKind, HTMLButtonElement>();
  for (const kind of assertionKinds) {
    const mode = button(assertionLabels[kind], `mergevow-checkpoint-kind-${kind}`);
    mode.className = "mode";
    mode.dataset.assertionKind = kind;
    mode.setAttribute("aria-pressed", kind === "visible" ? "true" : "false");
    modeButtons.set(kind, mode);
    kindModes.append(mode);
  }
  kindField.append(kindLabel, kindModes);

  const pick = button("Pick element", "mergevow-checkpoint-pick");
  pick.className = "pick";
  const targetList = document.createElement("div");
  targetList.className = "target-list";
  targetList.hidden = true;
  targetList.dataset.testid = "mergevow-checkpoint-targets";

  const locatorField = document.createElement("div");
  locatorField.className = "field";
  locatorField.hidden = true;
  const locatorLabel = document.createElement("span");
  locatorLabel.className = "label";
  locatorLabel.textContent = "Locator";
  const locatorOptions = document.createElement("div");
  locatorOptions.className = "locator-options";
  locatorOptions.dataset.testid = "mergevow-checkpoint-locator";
  locatorOptions.setAttribute("role", "group");
  locatorOptions.setAttribute("aria-label", "Semantic locator");
  locatorField.append(locatorLabel, locatorOptions);

  const previewField = document.createElement("div");
  previewField.className = "preview-field";
  previewField.hidden = true;
  const previewLabel = document.createElement("span");
  previewLabel.className = "preview-label";
  previewLabel.textContent = "Expected";
  const preview = document.createElement("p");
  preview.className = "preview";
  preview.dataset.testid = "mergevow-checkpoint-preview";
  previewField.append(previewLabel, preview);
  const status = document.createElement("p");
  status.className = "status";
  status.setAttribute("role", "status");
  status.dataset.testid = "mergevow-checkpoint-status";
  body.append(kindField, pick, targetList, locatorField, previewField, status);

  const footer = document.createElement("footer");
  footer.className = "footer";
  const cancel = button("Cancel", "mergevow-checkpoint-cancel");
  cancel.className = "cancel";
  const confirm = button("Add checkpoint", "mergevow-checkpoint-confirm");
  confirm.className = "confirm";
  confirm.disabled = true;
  footer.append(cancel, confirm);
  panel.append(header, body, footer);

  const trigger = button("", "mergevow-checkpoint-trigger");
  trigger.className = "trigger";
  trigger.title = "Add checkpoint";
  trigger.setAttribute("aria-controls", panel.id);
  trigger.setAttribute("aria-expanded", "false");
  const triggerMark = document.createElement("span");
  triggerMark.className = "trigger-mark";
  triggerMark.setAttribute("aria-hidden", "true");
  triggerMark.textContent = "+";
  const triggerLabel = document.createElement("span");
  triggerLabel.textContent = "Checkpoint";
  trigger.append(triggerMark, triggerLabel);
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.hidden = true;
  toast.setAttribute("role", "status");
  toast.textContent = "Checkpoint added";
  toast.dataset.testid = "mergevow-checkpoint-toast";
  const pickerBar = document.createElement("div");
  pickerBar.className = "picker-bar";
  pickerBar.hidden = true;
  pickerBar.dataset.testid = "mergevow-checkpoint-picker-bar";
  const pickerState = document.createElement("span");
  pickerState.className = "picker-state";
  pickerState.textContent = "Selecting target";
  const pickerCancel = button("Cancel", "mergevow-checkpoint-picker-cancel");
  pickerCancel.className = "picker-cancel";
  pickerBar.append(pickerState, pickerCancel);
  const highlight = document.createElement("div");
  highlight.className = "highlight";
  highlight.hidden = true;
  root.append(panel, pickerBar, toast, trigger, highlight);
  shadow.append(style, root);
  const appendHost = (): void => document.documentElement?.append(host);
  if (document.documentElement === null) {
    addEventListener("DOMContentLoaded", appendHost, { once: true });
  } else {
    appendHost();
  }

  let activeCandidates: readonly BrowserLocatorCandidate[] = [];
  let pendingPick: Element | undefined;
  let pendingPickCanceled = false;
  let pendingPickResult: OverlayResult<CheckpointSelection> | undefined;
  let picking = false;
  let selectedCandidateIndex: number | undefined;
  let selectedKind: CapturedAssertionKind = "visible";
  let selection: CheckpointSelection | undefined;
  let suppressTerminalClick = false;
  let terminalClickTimer: ReturnType<typeof setTimeout> | undefined;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  const currentKind = (): CapturedAssertionKind => selectedKind;

  const setStatus = (message: string, error = false): void => {
    status.textContent = message;
    status.classList.toggle("error", error);
  };

  const chosenCandidate = (): BrowserLocatorCandidate | undefined => {
    return selectedCandidateIndex === undefined
      ? undefined
      : activeCandidates[selectedCandidateIndex];
  };

  const updatePreview = (): void => {
    if (selection === undefined) {
      previewField.hidden = true;
      confirm.disabled = true;
      return;
    }
    const candidate = chosenCandidate();
    switch (selection.assertionKind) {
      case "url":
        preview.textContent = selection.path ?? "";
        break;
      case "visible":
        preview.textContent = "Visible";
        break;
      case "hidden":
        preview.textContent = "Hidden";
        break;
      case "count":
        preview.textContent = `${candidate?.matches ?? 0}`;
        break;
      default:
        preview.textContent = JSON.stringify(selection.expected);
        break;
    }
    previewField.hidden = false;
    confirm.disabled = selection.assertionKind !== "url" && candidate === undefined;
  };

  const applySelection = (next: CheckpointSelection): void => {
    selection = next;
    pick.textContent = next.assertionKind === "hidden" ? "Change hidden target" : "Change target";
    targetList.hidden = true;
    targetList.replaceChildren();
    locatorOptions.replaceChildren();
    const candidates = [...(next.candidates ?? [])]
      .filter((candidate) =>
        next.assertionKind === "count" ? candidate.matches > 0 : candidate.matches === 1,
      )
      .sort(
        (left, right) =>
          candidatePriority(next.assertionKind, left) -
          candidatePriority(next.assertionKind, right),
      );
    activeCandidates = candidates;
    selectedCandidateIndex = candidates.length === 0 ? undefined : 0;
    for (const [index, candidate] of candidates.entries()) {
      const option = button(
        locatorDescription(candidate.locator, candidate.matches),
        `mergevow-checkpoint-locator-${index}`,
      );
      option.className = "locator-option";
      option.setAttribute("aria-pressed", index === selectedCandidateIndex ? "true" : "false");
      option.addEventListener("click", () => {
        selectedCandidateIndex = index;
        for (const [candidateIndex, candidateOption] of Array.from(
          locatorOptions.querySelectorAll<HTMLButtonElement>(".locator-option").entries(),
        )) {
          candidateOption.setAttribute(
            "aria-pressed",
            candidateIndex === selectedCandidateIndex ? "true" : "false",
          );
        }
        updatePreview();
      });
      locatorOptions.append(option);
    }
    locatorField.hidden = next.assertionKind === "url";
    if (next.assertionKind !== "url" && candidates.length === 0) {
      selection = undefined;
      setStatus("No eligible semantic locator.", true);
    } else {
      setStatus("");
    }
    updatePreview();
  };

  const clearSelection = (): void => {
    selection = undefined;
    activeCandidates = [];
    selectedCandidateIndex = undefined;
    locatorOptions.replaceChildren();
    locatorField.hidden = true;
    targetList.replaceChildren();
    targetList.hidden = true;
    previewField.hidden = true;
    confirm.disabled = true;
    setStatus("");
  };

  const hideHighlight = (): void => {
    highlight.hidden = true;
  };

  const releaseTerminalClick = (): void => {
    if (terminalClickTimer !== undefined) clearTimeout(terminalClickTimer);
    terminalClickTimer = undefined;
    suppressTerminalClick = false;
    runtime.setPicking(false);
  };

  const armTerminalClick = (): void => {
    suppressTerminalClick = true;
    terminalClickTimer = setTimeout(releaseTerminalClick, 0);
  };

  const restorePanelAfterPicking = (): void => {
    pickerBar.hidden = true;
    panel.hidden = false;
  };

  const exitPicking = (): void => {
    if (!picking && pendingPick === undefined && !suppressTerminalClick) return;
    picking = false;
    hideHighlight();
    if (pendingPick !== undefined) {
      pendingPickCanceled = true;
      pendingPickResult = undefined;
      return;
    }
    releaseTerminalClick();
  };

  const finishPick = (element: Element | undefined, waitForTerminalClick = false): void => {
    const canceled = pendingPickCanceled;
    const retainedResult = canceled ? undefined : pendingPickResult;
    pendingPick = undefined;
    pendingPickCanceled = false;
    pendingPickResult = undefined;
    picking = false;
    hideHighlight();
    if (waitForTerminalClick) armTerminalClick();
    else releaseTerminalClick();
    restorePanelAfterPicking();
    if (canceled) {
      pick.focus();
      return;
    }
    if (element === undefined) {
      setStatus("No element selected.", true);
      return;
    }
    const kind = currentKind();
    if (kind === "hidden" || kind === "url") return;
    const result = retainedResult ?? runtime.captureTarget(element, kind);
    if (result.ok) {
      applySelection(result.value);
      confirm.focus();
    } else {
      setStatus(result.message, true);
      pick.focus();
    }
  };

  const configureKind = (): void => {
    exitPicking();
    clearSelection();
    const kind = currentKind();
    pick.hidden = kind === "url";
    pick.textContent = kind === "hidden" ? "Browse hidden targets" : "Select target";
    if (kind === "url") {
      const result = runtime.captureUrl();
      if (result.ok) applySelection(result.value);
      else setStatus(result.message, true);
    }
  };

  const closePanel = (): void => {
    exitPicking();
    clearSelection();
    pickerBar.hidden = true;
    panel.hidden = true;
    trigger.hidden = false;
    trigger.setAttribute("aria-expanded", "false");
    if (host.isConnected) trigger.focus();
  };

  const openPanel = (): void => {
    if (toastTimer !== undefined) clearTimeout(toastTimer);
    toastTimer = undefined;
    toast.hidden = true;
    pickerBar.hidden = true;
    trigger.hidden = true;
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    configureKind();
    modeButtons.get(selectedKind)?.focus();
  };

  const showToast = (): void => {
    if (toastTimer !== undefined) clearTimeout(toastTimer);
    toast.hidden = false;
    toastTimer = setTimeout(() => {
      toastTimer = undefined;
      toast.hidden = true;
    }, 1_800);
  };

  const renderTargetOptions = (
    result: OverlayResult<readonly CheckpointTargetOption[]>,
    emptyMessage: string,
  ): void => {
    targetList.replaceChildren();
    targetList.hidden = false;
    if (!result.ok) {
      setStatus(result.message, true);
      return;
    }
    if (result.value.length === 0) {
      setStatus(emptyMessage, true);
      return;
    }
    setStatus("");
    for (const target of result.value) {
      const targetButton = button(target.label, "mergevow-checkpoint-target");
      targetButton.className = "target-option";
      targetButton.addEventListener("click", () => {
        applySelection(target.selection);
        confirm.focus();
      });
      targetList.append(targetButton);
    }
  };

  const renderHiddenTargets = (): void =>
    renderTargetOptions(runtime.hiddenTargets(), "No hidden semantic targets.");

  const renderVisibleTargets = (): void => {
    const kind = currentKind();
    if (kind === "hidden" || kind === "url") return;
    renderTargetOptions(runtime.visibleTargets(kind), "No eligible semantic targets.");
    targetList.querySelector<HTMLButtonElement>(".target-option")?.focus();
  };

  const enterPicking = (): void => {
    clearSelection();
    pendingPick = undefined;
    pendingPickCanceled = false;
    pendingPickResult = undefined;
    picking = true;
    runtime.setPicking(true);
    setStatus("Target selection active");
    panel.hidden = true;
    pickerBar.hidden = false;
    pickerCancel.focus();
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (!picking || event.composedPath().includes(host)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    pendingPick = event.composedPath().find((entry): entry is Element => entry instanceof Element);
    const kind = currentKind();
    pendingPickResult =
      pendingPick === undefined || kind === "hidden" || kind === "url"
        ? undefined
        : runtime.captureTarget(pendingPick, kind);
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (pendingPick === undefined) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    finishPick(pendingPick, true);
  };

  const onPointerCancel = (event: PointerEvent): void => {
    if (pendingPick === undefined) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    pendingPick = undefined;
    pendingPickCanceled = false;
    pendingPickResult = undefined;
    picking = false;
    hideHighlight();
    releaseTerminalClick();
    restorePanelAfterPicking();
    setStatus("Target selection canceled");
    pick.focus();
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!picking || event.composedPath().includes(host)) return;
    const element = event
      .composedPath()
      .find((entry): entry is Element => entry instanceof Element);
    if (element === undefined) {
      hideHighlight();
      return;
    }
    const box = element.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) {
      hideHighlight();
      return;
    }
    highlight.hidden = false;
    highlight.style.left = `${box.left}px`;
    highlight.style.top = `${box.top}px`;
    highlight.style.width = `${box.width}px`;
    highlight.style.height = `${box.height}px`;
  };

  const onPick = (event: MouseEvent): void => {
    if (suppressTerminalClick) {
      event.preventDefault();
      event.stopImmediatePropagation();
      releaseTerminalClick();
      return;
    }
    if (!picking || event.composedPath().includes(host)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const element =
      pendingPick ??
      event.composedPath().find((entry): entry is Element => entry instanceof Element);
    finishPick(element);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Tab" && !panel.hidden && event.composedPath().includes(host)) {
      const focusable = Array.from(
        panel.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
      ).filter((element) => element.offsetParent !== null);
      const first = focusable[0];
      const last = focusable.at(-1);
      const active = shadow.activeElement;
      if (first !== undefined && last !== undefined) {
        if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
      return;
    }
    if (event.key !== "Escape") return;
    if (picking) {
      event.preventDefault();
      exitPicking();
      restorePanelAfterPicking();
      setStatus("Target selection canceled");
      pick.focus();
      return;
    }
    if (!panel.hidden) closePanel();
  };

  trigger.addEventListener("click", () => (panel.hidden ? openPanel() : closePanel()));
  close.addEventListener("click", closePanel);
  cancel.addEventListener("click", closePanel);
  pickerCancel.addEventListener("click", () => {
    exitPicking();
    restorePanelAfterPicking();
    setStatus("Target selection canceled");
    pick.focus();
  });
  for (const [kind, mode] of modeButtons) {
    mode.addEventListener("click", () => {
      selectedKind = kind;
      for (const [candidateKind, candidateMode] of modeButtons) {
        candidateMode.setAttribute(
          "aria-pressed",
          candidateKind === selectedKind ? "true" : "false",
        );
      }
      configureKind();
    });
  }
  kindModes.addEventListener("keydown", (event) => {
    if (!["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp"].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
    const currentIndex = assertionKinds.indexOf(selectedKind);
    const nextIndex = (currentIndex + direction + assertionKinds.length) % assertionKinds.length;
    const nextKind = assertionKinds[nextIndex];
    if (nextKind === undefined) return;
    modeButtons.get(nextKind)?.click();
    modeButtons.get(nextKind)?.focus();
  });
  pick.addEventListener("click", (event) => {
    if (currentKind() === "hidden") renderHiddenTargets();
    else if (event.detail === 0) renderVisibleTargets();
    else enterPicking();
  });
  confirm.addEventListener("click", () => {
    if (selection === undefined) return;
    const result = runtime.confirm(selection, chosenCandidate());
    if (result.ok) {
      closePanel();
      showToast();
    } else {
      setStatus(result.message, true);
    }
  });
  const stopOverlayPropagation = (event: Event): void => event.stopPropagation();
  const isolatedEventTypes = [
    "change",
    "click",
    "dblclick",
    "input",
    "keydown",
    "keyup",
    "mousedown",
    "mouseup",
    "pointerdown",
    "pointerup",
  ] as const;
  for (const type of isolatedEventTypes) root.addEventListener(type, stopOverlayPropagation);
  addEventListener("pointermove", onPointerMove, true);
  addEventListener("pointerdown", onPointerDown, true);
  addEventListener("pointerup", onPointerUp, true);
  addEventListener("pointercancel", onPointerCancel, true);
  addEventListener("click", onPick, true);
  addEventListener("keydown", onKeyDown, true);
  addEventListener("scroll", hideHighlight, true);

  return Object.freeze({
    cleanup: () => {
      exitPicking();
      if (toastTimer !== undefined) clearTimeout(toastTimer);
      removeEventListener("DOMContentLoaded", appendHost);
      removeEventListener("pointermove", onPointerMove, true);
      removeEventListener("pointerdown", onPointerDown, true);
      removeEventListener("pointerup", onPointerUp, true);
      removeEventListener("pointercancel", onPointerCancel, true);
      removeEventListener("click", onPick, true);
      removeEventListener("keydown", onKeyDown, true);
      removeEventListener("scroll", hideHighlight, true);
      for (const type of isolatedEventTypes) root.removeEventListener(type, stopOverlayPropagation);
      host.remove();
    },
    host,
  });
}
