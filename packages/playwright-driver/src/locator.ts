import type {
  Locator as ContractLocator,
  LabelLocator,
  RoleLocator,
  TestIdLocator,
} from "@mergevow/contract";
import type { Page, Locator as PlaywrightLocator } from "playwright";

export const LOCATOR_RESOLUTION_CODES = {
  ambiguous: "LOCATOR_AMBIGUOUS",
  missing: "LOCATOR_MISSING",
} as const;

export type LocatorResolutionCode =
  (typeof LOCATOR_RESOLUTION_CODES)[keyof typeof LOCATOR_RESOLUTION_CODES];

export type LocatorStrategy = "label" | "role" | "testId";

export interface LocatorResolutionOptions {
  readonly includeHidden?: boolean;
}

export interface LocatorMatchObservation {
  readonly description: string;
  readonly locator: PlaywrightLocator;
  readonly matchCount: number;
  readonly strategy: LocatorStrategy;
}

export interface ResolvedLocator extends Omit<LocatorMatchObservation, "matchCount"> {
  readonly matchCount: 1;
}

export interface LocatorResolutionIssue {
  readonly code: LocatorResolutionCode;
  readonly description: string;
  readonly matchCount: number;
  readonly message: string;
  readonly strategy: LocatorStrategy;
}

export type LocatorResolutionResult =
  | {
      readonly ok: true;
      readonly value: ResolvedLocator;
    }
  | {
      readonly issues: readonly LocatorResolutionIssue[];
      readonly ok: false;
    };

interface SemanticLocatorQuery {
  readonly description: string;
  readonly locator: PlaywrightLocator;
  readonly strategy: LocatorStrategy;
}

function semanticLocatorQuery(
  page: Page,
  locator: ContractLocator,
  options: LocatorResolutionOptions,
): SemanticLocatorQuery {
  const hasRole = Object.hasOwn(locator, "role");
  const hasLabel = Object.hasOwn(locator, "label");
  const hasTestId = Object.hasOwn(locator, "testId");
  if (Number(hasRole) + Number(hasLabel) + Number(hasTestId) !== 1) {
    throw new TypeError("A semantic locator must contain exactly one own strategy.");
  }

  if (hasRole) {
    const roleLocator = locator as RoleLocator;
    return {
      description: `role ${JSON.stringify(roleLocator.role)} with accessible name ${JSON.stringify(roleLocator.name)}`,
      locator: page.getByRole(roleLocator.role, {
        exact: true,
        includeHidden: options.includeHidden ?? false,
        name: roleLocator.name,
      }),
      strategy: "role",
    };
  }
  if (hasLabel) {
    const labelLocator = locator as LabelLocator;
    return {
      description: `label ${JSON.stringify(labelLocator.label)}`,
      locator: page.getByLabel(labelLocator.label, { exact: true }),
      strategy: "label",
    };
  }
  const testIdLocator = locator as TestIdLocator;
  return {
    description: `test ID ${JSON.stringify(testIdLocator.testId)}`,
    locator: page.getByTestId(testIdLocator.testId),
    strategy: "testId",
  };
}

export async function inspectLocatorMatches(
  page: Page,
  locator: ContractLocator,
  options: LocatorResolutionOptions = {},
): Promise<LocatorMatchObservation> {
  const query = semanticLocatorQuery(page, locator, options);
  return {
    ...query,
    matchCount: await query.locator.count(),
  };
}

/**
 * Observes the current DOM once. SW-005 owns waiting and timeout policy; Playwright failures remain
 * errors so the interpreter can classify infrastructure separately from locator mismatch.
 */
export async function resolveUniqueLocator(
  page: Page,
  locator: ContractLocator,
  options: LocatorResolutionOptions = {},
): Promise<LocatorResolutionResult> {
  const observation = await inspectLocatorMatches(page, locator, options);
  if (observation.matchCount === 1) {
    return {
      ok: true,
      value: {
        ...observation,
        matchCount: 1,
      },
    };
  }

  const code =
    observation.matchCount === 0
      ? LOCATOR_RESOLUTION_CODES.missing
      : LOCATOR_RESOLUTION_CODES.ambiguous;
  return {
    issues: [
      {
        code,
        description: observation.description,
        matchCount: observation.matchCount,
        message: `${observation.matchCount} elements matched ${observation.description}; expected exactly one.`,
        strategy: observation.strategy,
      },
    ],
    ok: false,
  };
}
