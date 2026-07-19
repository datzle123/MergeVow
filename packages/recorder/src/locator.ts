import type { Locator } from "@mergevow/contract";
import { resolveUniqueLocator } from "@mergevow/playwright-driver";
import type { Page } from "playwright";

import type { BrowserActionEvent, BrowserLocatorCandidate } from "./types.js";

const LIVE_REVALIDATION_TIMEOUT_MS = 250;

export interface LocatorSelectionSuccess {
  readonly locator: Locator;
  readonly ok: true;
}

export interface LocatorSelectionFailure {
  readonly ambiguous: boolean;
  readonly ok: false;
}

export type LocatorSelectionResult = LocatorSelectionSuccess | LocatorSelectionFailure;

function locatorKey(locator: Locator): string {
  if ("label" in locator) return `label:${locator.label}`;
  if ("testId" in locator) return `testId:${locator.testId}`;
  return `role:${locator.role}:${locator.name}`;
}

function candidatePriority(event: BrowserActionEvent, candidate: BrowserLocatorCandidate): number {
  const locator = candidate.locator;
  if (event.kind === "click") {
    if ("role" in locator) return 0;
    if ("label" in locator) return 1;
    return 2;
  }
  if ("label" in locator) return 0;
  if ("role" in locator) return 1;
  return 2;
}

function rankedUniqueCandidates(event: BrowserActionEvent): readonly BrowserLocatorCandidate[] {
  const seen = new Set<string>();
  return [...event.candidates]
    .filter((candidate) => candidate.matches === 1)
    .sort((left, right) => candidatePriority(event, left) - candidatePriority(event, right))
    .filter((candidate) => {
      const key = locatorKey(candidate.locator);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

async function documentToken(page: Page, stateName: string): Promise<string | undefined> {
  try {
    return await page.evaluate((name) => {
      const state = (globalThis as Record<string, unknown>)[name];
      if (state === null || typeof state !== "object") return undefined;
      const token = (state as { readonly documentToken?: unknown }).documentToken;
      return typeof token === "string" ? token : undefined;
    }, stateName);
  } catch {
    return undefined;
  }
}

export async function selectCapturedLocator(
  page: Page,
  event: BrowserActionEvent,
  markerAttribute: string,
  stateName: string,
): Promise<LocatorSelectionResult> {
  const candidates = rankedUniqueCandidates(event);
  if (candidates.length === 0) {
    return Object.freeze({
      ambiguous: event.candidates.some((candidate) => candidate.matches > 1),
      ok: false,
    });
  }

  const currentDocumentToken = await documentToken(page, stateName);
  if (currentDocumentToken !== undefined && currentDocumentToken !== event.documentToken) {
    const candidate = candidates[0];
    if (candidate === undefined) return Object.freeze({ ambiguous: false, ok: false });
    return Object.freeze({ locator: candidate.locator, ok: true });
  }

  let ambiguous = false;
  for (const candidate of candidates) {
    try {
      const resolution = await resolveUniqueLocator(page, candidate.locator);
      if (!resolution.ok) {
        ambiguous ||= resolution.issues.some((issue) => issue.matchCount > 1);
        continue;
      }
      if (
        (await resolution.value.locator.getAttribute(markerAttribute, {
          timeout: LIVE_REVALIDATION_TIMEOUT_MS,
        })) === event.marker
      ) {
        return Object.freeze({ locator: candidate.locator, ok: true });
      }
    } catch {
      const tokenAfterFailure = await documentToken(page, stateName);
      if (tokenAfterFailure !== undefined && tokenAfterFailure !== event.documentToken) {
        return Object.freeze({ locator: candidate.locator, ok: true });
      }
    }
  }

  const eventTimeCandidate = candidates[0];
  return eventTimeCandidate === undefined
    ? Object.freeze({ ambiguous, ok: false })
    : Object.freeze({ locator: eventTimeCandidate.locator, ok: true });
}
