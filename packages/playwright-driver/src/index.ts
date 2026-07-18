export {
  inspectLocatorMatches,
  LOCATOR_RESOLUTION_CODES,
  type LocatorMatchObservation,
  type LocatorResolutionCode,
  type LocatorResolutionIssue,
  type LocatorResolutionOptions,
  type LocatorResolutionResult,
  type LocatorStrategy,
  type ResolvedLocator,
  resolveUniqueLocator,
} from "./locator.js";
export {
  createGuardedBrowserContext,
  type GuardedBrowserContext,
  NETWORK_GUARD_CODES,
  NETWORK_TRANSPORT_FAILURE_CODE,
  type NetworkGuardCode,
  type NetworkGuardViolation,
  type NetworkTransportFailure,
} from "./network.js";
