import { createHash } from "node:crypto";

import canonicalize from "canonicalize";

import { withSerializationHooksMasked } from "./snapshot.js";
import type { ContractV1 } from "./types.js";
import {
  CONTRACT_ISSUE_CODES,
  type ContractValidationIssue,
  parseContract,
  validateContract,
} from "./validate.js";

export type ContractHash = `sha256:${string}`;

export interface CanonicalContract {
  readonly canonicalJson: string;
  readonly contract: ContractV1;
}

export interface HashedContract extends CanonicalContract {
  readonly hash: ContractHash;
}

export type CanonicalContractResult =
  | {
      readonly ok: true;
      readonly value: CanonicalContract;
    }
  | {
      readonly issues: readonly ContractValidationIssue[];
      readonly ok: false;
    };

export type HashContractResult =
  | {
      readonly ok: true;
      readonly value: HashedContract;
    }
  | {
      readonly issues: readonly ContractValidationIssue[];
      readonly ok: false;
    };

function canonicalizationFailure(message: string): CanonicalContractResult {
  return {
    issues: [
      {
        code: CONTRACT_ISSUE_CODES.canonicalizationFailed,
        message,
        path: "",
      },
    ],
    ok: false,
  };
}

function deepFreezeContract(contract: ContractV1): ContractV1 {
  const pending: object[] = [contract];

  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || Object.isFrozen(current)) {
      continue;
    }

    for (const child of Object.values(current)) {
      if (child !== null && typeof child === "object") {
        pending.push(child);
      }
    }
    Object.freeze(current);
  }

  return contract;
}

export function canonicalizeContract(value: unknown): CanonicalContractResult {
  const validated = validateContract(value);
  if (!validated.ok) {
    return validated;
  }

  try {
    const canonicalJson = withSerializationHooksMasked(validated.value, () =>
      canonicalize(validated.value),
    );
    if (canonicalJson === undefined) {
      return canonicalizationFailure("Validated contract did not produce canonical JSON.");
    }

    const reparsed = parseContract(canonicalJson);
    if (!reparsed.ok) {
      return reparsed;
    }

    return {
      ok: true,
      value: {
        canonicalJson,
        contract: deepFreezeContract(reparsed.value),
      },
    };
  } catch {
    return canonicalizationFailure("Validated contract could not be canonicalized.");
  }
}

export function hashContract(value: unknown): HashContractResult {
  const canonical = canonicalizeContract(value);
  if (!canonical.ok) {
    return canonical;
  }

  const digest = createHash("sha256").update(canonical.value.canonicalJson, "utf8").digest("hex");
  return {
    ok: true,
    value: {
      ...canonical.value,
      hash: `sha256:${digest}`,
    },
  };
}
