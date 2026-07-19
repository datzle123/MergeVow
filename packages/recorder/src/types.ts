import type { ContractV1, Locator } from "@mergevow/contract";
import type { LoopbackReadinessOptions } from "@mergevow/playwright-driver";
import type { Browser, Page } from "playwright";

export const RECORDER_ISSUE_CODES = {
  ambiguousLocator: "AMBIGUOUS_LOCATOR",
  browserPolicy: "BROWSER_POLICY_FAILURE",
  contractInvalid: "RECORDED_CONTRACT_INVALID",
  eventLimit: "RECORDER_EVENT_LIMIT",
  malformedEvent: "MALFORMED_RECORDER_EVENT",
  pageTopology: "UNSUPPORTED_PAGE_TOPOLOGY",
  recorderFailure: "RECORDER_FAILURE",
  sensitiveControl: "SENSITIVE_CONTROL",
  stepLimit: "RECORDER_STEP_LIMIT",
  unsupportedAction: "UNSUPPORTED_ACTION",
  unsupportedLocator: "UNSUPPORTED_LOCATOR",
  valueLimit: "RECORDER_VALUE_LIMIT",
} as const;

export type RecorderIssueCode = (typeof RECORDER_ISSUE_CODES)[keyof typeof RECORDER_ISSUE_CODES];

export const RECORDER_LIMITS = Object.freeze({
  maxCandidatesPerEvent: 24,
  maxElementsScanned: 10_000,
  maxIssueMessageLength: 4_096,
  maxMarkerLength: 128,
  maxPendingEvents: 128,
  maxSemanticComputations: 2_000,
});

export interface RecorderIssue {
  readonly code: RecorderIssueCode;
  readonly message: string;
}

export class ActionRecorderStartError extends Error {
  readonly issue: RecorderIssue;

  constructor(value: RecorderIssue) {
    super(value.message);
    this.name = "ActionRecorderStartError";
    this.issue = value;
    Object.freeze(this);
  }
}

export interface ActionRecorderSuccess {
  readonly contract: ContractV1;
  readonly ok: true;
}

export interface ActionRecorderFailure {
  readonly issue: RecorderIssue;
  readonly ok: false;
}

export type ActionRecorderResult = ActionRecorderSuccess | ActionRecorderFailure;

export interface StartActionRecorderOptions {
  readonly browser: Browser;
  readonly flow: string;
  readonly origin: string;
  readonly readiness?: LoopbackReadinessOptions;
  readonly startPath: string;
}

export interface ActionRecorderSession {
  readonly page: Page;
  readonly stop: () => Promise<ActionRecorderResult>;
}

export type CapturedActionKind = "check" | "click" | "fill" | "select";

export interface BrowserLocatorCandidate {
  readonly locator: Locator;
  readonly matches: number;
}

export interface BrowserActionEvent {
  readonly candidates: readonly BrowserLocatorCandidate[];
  readonly documentToken: string;
  readonly kind: CapturedActionKind;
  readonly marker: string;
  readonly mayNavigate?: boolean;
  readonly value?: string;
}

export interface BrowserNavigationEvent {
  readonly documentToken: string;
  readonly kind: "navigation";
  readonly navigationType: "back_forward" | "navigate" | "reload";
  readonly ownerMarker?: string;
  readonly origin: string;
  readonly path: string;
}

export interface BrowserNavigationIntentEvent {
  readonly documentToken: string;
  readonly kind: "navigationIntent";
  readonly ownerMarker: string;
  readonly phase: "begin" | "end";
}

export interface BrowserRejectedEvent {
  readonly kind:
    | "eventLimit"
    | "pageLimit"
    | "sensitive"
    | "uncheck"
    | "unsupported"
    | "valueLimit";
  readonly reason: string;
}

export type BrowserRecorderEvent =
  | BrowserActionEvent
  | BrowserNavigationEvent
  | BrowserNavigationIntentEvent
  | BrowserRejectedEvent;
