import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  ARIA_ROLES,
  CONTRACT_ISSUE_CODES,
  CONTRACT_LIMITS,
  contractV1Schema,
  parseContract,
  validateContract,
} from "../src/index.js";

const fixtureRoot = new URL("./fixtures/", import.meta.url);

function fixture(path: string): string {
  return readFileSync(new URL(path, fixtureRoot), "utf8");
}

function expectIssue(source: string | Uint8Array, code: string): void {
  const result = parseContract(source);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.issues.map((issue) => issue.code)).toContain(code);
  }
}

describe("contract schema v1", () => {
  it.each(["minimal.json", "all-opcodes.json", "todo-persistence.json"])(
    "accepts valid fixture %s",
    (name) => {
      const result = parseContract(fixture(`valid/${name}`));
      expect(result).toEqual(expect.objectContaining({ ok: true }));
    },
  );

  it.each([
    "unknown-top-level.json",
    "multiple-opcodes.json",
    "mixed-locator.json",
    "external-navigation.json",
    "missing-version.json",
  ])("rejects invalid fixture %s", (name) => {
    expectIssue(fixture(`invalid/${name}`), CONTRACT_ISSUE_CODES.schemaViolation);
  });

  it.each(["executable-fields.json", "selector-regex.json", "scheme-navigation.json"])(
    "rejects malicious fixture %s",
    (name) => {
      expectIssue(fixture(`malicious/${name}`), CONTRACT_ISSUE_CODES.schemaViolation);
    },
  );

  it("rejects prototype-affecting property names before schema validation", () => {
    expectIssue(fixture("malicious/prototype-key.json"), CONTRACT_ISSUE_CODES.dangerousKey);
  });

  it("rejects duplicate keys before JSON parsing can hide the first value", () => {
    expectIssue(fixture("malicious/duplicate-key.json.txt"), CONTRACT_ISSUE_CODES.duplicateKey);
    expectIssue(
      '{"version":1,"flow":"nested-duplicate","steps":[{"fill":{"locator":{"label":"first","\\u006cabel":"second"},"value":"x"}}]}',
      CONTRACT_ISSUE_CODES.duplicateKey,
    );
  });

  it("keeps executable-looking input text inert instead of filtering keywords", () => {
    const result = validateContract({
      flow: "inert-input-text",
      steps: [
        { visit: "/form" },
        {
          fill: {
            locator: { label: "Command shown as text" },
            value: "javascript:alert(1); rm -rf /; (a+)+$",
          },
        },
      ],
      version: 1,
    });

    expect(result.ok).toBe(true);
  });

  it.each([
    "https://example.com/path",
    "http://example.com/path",
    "//example.com/path",
    "javascript:alert(1)",
    "data:text/html,hello",
    "/\\\\example.com/path",
  ])("rejects explicit external or scheme navigation %s", (visit) => {
    const result = validateContract({
      flow: "bad-navigation",
      steps: [{ visit }],
      version: 1,
    });
    expect(result.ok).toBe(false);
  });

  it("does not coerce, default, remove, or mutate input", () => {
    const value = {
      extra: true,
      flow: "no-mutation",
      steps: [{ visit: "/" }],
      version: "1",
    };
    const before = structuredClone(value);

    const result = validateContract(value);

    expect(result.ok).toBe(false);
    expect(value).toEqual(before);
  });

  it("rejects more than the configured step count", () => {
    const result = validateContract({
      flow: "too-many-steps",
      steps: Array.from({ length: CONTRACT_LIMITS.maxSteps + 1 }, () => ({ reload: {} })),
      version: 1,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.code)).toContain(
        CONTRACT_ISSUE_CODES.schemaViolation,
      );
    }
  });

  it("rejects raw input above the byte limit before parsing", () => {
    expectIssue(" ".repeat(CONTRACT_LIMITS.maxBytes + 1), CONTRACT_ISSUE_CODES.maxBytesExceeded);
  });

  it("rejects values above the depth limit before schema validation", () => {
    let value: unknown = "leaf";
    for (let depth = 0; depth <= CONTRACT_LIMITS.maxDepth; depth += 1) {
      value = { nested: value };
    }

    const result = validateContract(value);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.code).toBe(CONTRACT_ISSUE_CODES.maxDepthExceeded);
    }
  });

  it("rejects values above the node limit before schema validation", () => {
    const result = validateContract(Array.from({ length: CONTRACT_LIMITS.maxNodes }, () => null));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.code).toBe(CONTRACT_ISSUE_CODES.maxNodesExceeded);
    }
  });

  it("rejects invalid UTF-8 byte input", () => {
    expectIssue(new Uint8Array([0xc3, 0x28]), CONTRACT_ISSUE_CODES.invalidEncoding);
  });

  it("rejects lone Unicode surrogate values", () => {
    expectIssue(
      '{"version":1,"flow":"bad-unicode","steps":[{"fill":{"locator":{"label":"Title"},"value":"\\ud800"}}]}',
      CONTRACT_ISSUE_CODES.invalidJsonValue,
    );
  });

  it("rejects cyclic and aliased programmatic objects", () => {
    const cycle: { self?: unknown } = {};
    cycle.self = cycle;
    expect(validateContract(cycle)).toEqual(
      expect.objectContaining({
        issues: [expect.objectContaining({ code: CONTRACT_ISSUE_CODES.invalidJsonValue })],
        ok: false,
      }),
    );

    const shared = { value: "same object" };
    expect(validateContract({ left: shared, right: shared })).toEqual(
      expect.objectContaining({
        issues: [expect.objectContaining({ code: CONTRACT_ISSUE_CODES.invalidJsonValue })],
        ok: false,
      }),
    );
  });

  it("closes every object boundary in the published schema", () => {
    const pending: Array<{ path: string; value: unknown }> = [
      { path: "#", value: contractV1Schema },
    ];
    let objectSchemaCount = 0;

    while (pending.length > 0) {
      const current = pending.pop();
      if (current === undefined || current.value === null || typeof current.value !== "object") {
        continue;
      }
      if (Array.isArray(current.value)) {
        current.value.forEach((value, index) => {
          pending.push({ path: `${current.path}/${index}`, value });
        });
        continue;
      }

      const record = current.value as Record<string, unknown>;
      if (record.type === "object") {
        objectSchemaCount += 1;
        expect(record.additionalProperties, current.path).toBe(false);
      }
      for (const [key, value] of Object.entries(record)) {
        pending.push({ path: `${current.path}/${key}`, value });
      }
    }

    expect(objectSchemaCount).toBeGreaterThan(10);
  });

  it("keeps published schema bounds and role values aligned with TypeScript constants", () => {
    const schema = contractV1Schema as {
      $defs: Record<string, Record<string, unknown>>;
      properties: { steps: Record<string, unknown> };
    };

    expect(schema.properties.steps.minItems).toBe(CONTRACT_LIMITS.minSteps);
    expect(schema.properties.steps.maxItems).toBe(CONTRACT_LIMITS.maxSteps);
    expect(schema.$defs.flow?.maxLength).toBe(CONTRACT_LIMITS.maxFlowLength);
    expect(schema.$defs.sameOriginPath?.maxLength).toBe(CONTRACT_LIMITS.maxUrlLength);
    expect(schema.$defs.locatorText?.maxLength).toBe(CONTRACT_LIMITS.maxLocatorTextLength);
    expect(schema.$defs.value?.maxLength).toBe(CONTRACT_LIMITS.maxValueLength);

    const roleLocator = schema.$defs.roleLocator as {
      properties: { role: { enum: readonly string[] } };
    };
    expect(roleLocator.properties.role.enum).toEqual(ARIA_ROLES);
  });
});
