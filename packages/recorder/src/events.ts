import { ARIA_ROLES, type AriaRole, CONTRACT_LIMITS, type Locator } from "@mergevow/contract";

import {
  type BrowserActionEvent,
  type BrowserLocatorCandidate,
  type BrowserNavigationEvent,
  type BrowserNavigationIntentEvent,
  type BrowserRecorderEvent,
  type BrowserRejectedEvent,
  RECORDER_LIMITS,
} from "./types.js";

const ariaRoles = new Set<string>(ARIA_ROLES);
const actionKinds = new Set(["check", "click", "fill", "select"]);
const rejectedKinds = new Set([
  "eventLimit",
  "pageLimit",
  "sensitive",
  "uncheck",
  "unsupported",
  "valueLimit",
]);
const navigationTypes = new Set(["back_forward", "navigate", "reload"]);

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function boundedString(value: unknown, maximum: number, allowEmpty = false): string | undefined {
  return typeof value === "string" && value.length <= maximum && (allowEmpty || value.length > 0)
    ? value
    : undefined;
}

function parseLocator(value: unknown): Locator | undefined {
  const candidate = record(value);
  if (candidate === undefined) return undefined;
  const keys = Object.keys(candidate);
  if (keys.length === 1 && keys[0] === "label") {
    const label = boundedString(candidate.label, CONTRACT_LIMITS.maxLocatorTextLength);
    return label === undefined ? undefined : Object.freeze({ label });
  }
  if (keys.length === 1 && keys[0] === "testId") {
    const testId = boundedString(candidate.testId, CONTRACT_LIMITS.maxLocatorTextLength);
    return testId === undefined ? undefined : Object.freeze({ testId });
  }
  if (keys.length === 2 && keys.includes("name") && keys.includes("role")) {
    const name = boundedString(candidate.name, CONTRACT_LIMITS.maxLocatorTextLength);
    const role = boundedString(candidate.role, 64);
    return name === undefined || role === undefined || !ariaRoles.has(role)
      ? undefined
      : Object.freeze({ name, role: role as AriaRole });
  }
  return undefined;
}

function parseCandidate(value: unknown): BrowserLocatorCandidate | undefined {
  const candidate = record(value);
  if (
    candidate === undefined ||
    !hasOnlyKeys(candidate, ["locator", "matches"]) ||
    !Number.isSafeInteger(candidate.matches) ||
    (candidate.matches as number) < 0 ||
    (candidate.matches as number) > RECORDER_LIMITS.maxElementsScanned
  ) {
    return undefined;
  }
  const locator = parseLocator(candidate.locator);
  return locator === undefined
    ? undefined
    : Object.freeze({ locator, matches: candidate.matches as number });
}

function parseAction(value: Record<string, unknown>): BrowserActionEvent | undefined {
  if (
    !hasOnlyKeys(value, [
      "candidates",
      "documentToken",
      "kind",
      "marker",
      "mayNavigate",
      "value",
    ]) ||
    !actionKinds.has(value.kind as string) ||
    !Array.isArray(value.candidates) ||
    value.candidates.length > RECORDER_LIMITS.maxCandidatesPerEvent
  ) {
    return undefined;
  }
  const documentToken = boundedString(value.documentToken, RECORDER_LIMITS.maxMarkerLength);
  const marker = boundedString(value.marker, RECORDER_LIMITS.maxMarkerLength);
  const candidates = value.candidates.map(parseCandidate);
  if (
    documentToken === undefined ||
    marker === undefined ||
    candidates.some((candidate) => candidate === undefined)
  ) {
    return undefined;
  }
  const kind = value.kind as BrowserActionEvent["kind"];
  const requiresValue = kind === "fill" || kind === "select";
  const parsedValue = boundedString(value.value, CONTRACT_LIMITS.maxValueLength, true);
  const mayNavigate = value.mayNavigate;
  const parsedMayNavigate = typeof mayNavigate === "boolean" ? mayNavigate : undefined;
  if (
    (requiresValue && parsedValue === undefined) ||
    (!requiresValue && value.value !== undefined) ||
    (kind === "click" ? typeof mayNavigate !== "boolean" : mayNavigate !== undefined)
  ) {
    return undefined;
  }
  return Object.freeze({
    candidates: Object.freeze(candidates as BrowserLocatorCandidate[]),
    documentToken,
    kind,
    marker,
    ...(parsedMayNavigate === undefined ? {} : { mayNavigate: parsedMayNavigate }),
    ...(parsedValue === undefined ? {} : { value: parsedValue }),
  });
}

function parseNavigation(value: Record<string, unknown>): BrowserNavigationEvent | undefined {
  if (
    !hasOnlyKeys(value, [
      "documentToken",
      "kind",
      "navigationType",
      "origin",
      "ownerMarker",
      "path",
    ]) ||
    value.kind !== "navigation" ||
    !navigationTypes.has(value.navigationType as string)
  ) {
    return undefined;
  }
  const documentToken = boundedString(value.documentToken, RECORDER_LIMITS.maxMarkerLength);
  const ownerMarker =
    value.ownerMarker === undefined
      ? undefined
      : boundedString(value.ownerMarker, RECORDER_LIMITS.maxMarkerLength);
  const origin = boundedString(value.origin, CONTRACT_LIMITS.maxUrlLength);
  const path = boundedString(value.path, CONTRACT_LIMITS.maxUrlLength);
  return documentToken === undefined ||
    origin === undefined ||
    path === undefined ||
    (value.ownerMarker !== undefined && ownerMarker === undefined)
    ? undefined
    : Object.freeze({
        documentToken,
        kind: "navigation",
        navigationType: value.navigationType as BrowserNavigationEvent["navigationType"],
        ...(ownerMarker === undefined ? {} : { ownerMarker }),
        origin,
        path,
      });
}

function parseNavigationIntent(
  value: Record<string, unknown>,
): BrowserNavigationIntentEvent | undefined {
  if (!hasOnlyKeys(value, ["documentToken", "kind", "ownerMarker", "phase"])) return undefined;
  const documentToken = boundedString(value.documentToken, RECORDER_LIMITS.maxMarkerLength);
  const ownerMarker = boundedString(value.ownerMarker, RECORDER_LIMITS.maxMarkerLength);
  return documentToken === undefined ||
    ownerMarker === undefined ||
    value.kind !== "navigationIntent" ||
    (value.phase !== "begin" && value.phase !== "end")
    ? undefined
    : Object.freeze({
        documentToken,
        kind: "navigationIntent",
        ownerMarker,
        phase: value.phase,
      });
}

function parseRejected(value: Record<string, unknown>): BrowserRejectedEvent | undefined {
  if (!hasOnlyKeys(value, ["kind", "reason"]) || !rejectedKinds.has(value.kind as string)) {
    return undefined;
  }
  const reason = boundedString(value.reason, 1_024);
  return reason === undefined
    ? undefined
    : Object.freeze({ kind: value.kind as BrowserRejectedEvent["kind"], reason });
}

export function parseBrowserRecorderEvent(value: unknown): BrowserRecorderEvent | undefined {
  const candidate = record(value);
  if (candidate === undefined || typeof candidate.kind !== "string") return undefined;
  if (actionKinds.has(candidate.kind)) return parseAction(candidate);
  if (candidate.kind === "navigation") return parseNavigation(candidate);
  if (candidate.kind === "navigationIntent") return parseNavigationIntent(candidate);
  if (rejectedKinds.has(candidate.kind)) return parseRejected(candidate);
  return undefined;
}
