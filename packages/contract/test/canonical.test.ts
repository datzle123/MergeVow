import { describe, expect, it } from "vitest";

import {
  CONTRACT_ISSUE_CODES,
  canonicalizeContract,
  hashContract,
  parseContract,
} from "../src/index.js";

const smokeContract = {
  flow: "smoke",
  steps: [{ visit: "/" }],
  version: 1,
} as const;

describe("RFC 8785 contract canonicalization", () => {
  it("sorts object keys recursively without changing array order", () => {
    const result = canonicalizeContract({
      version: 1,
      steps: [
        {
          assertVisible: {
            role: "heading",
            name: "Ready",
          },
        },
      ],
      flow: "locator-order",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        canonicalJson:
          '{"flow":"locator-order","steps":[{"assertVisible":{"name":"Ready","role":"heading"}}],"version":1}',
        contract: expect.any(Object),
      },
    });
  });

  it("produces one golden SHA-256 identity for equivalent property order", () => {
    const reordered = {
      version: 1,
      steps: [{ visit: "/" }],
      flow: "smoke",
    };

    const first = hashContract(smokeContract);
    const second = hashContract(reordered);

    expect(first).toEqual(second);
    expect(first).toEqual({
      ok: true,
      value: {
        canonicalJson: '{"flow":"smoke","steps":[{"visit":"/"}],"version":1}',
        contract: smokeContract,
        hash: "sha256:7880947da8f9beb989ea29780701a65e51366508ba89ae787b5bb070ba5564b5",
      },
    });
  });

  it("produces the same hash after parsing differently formatted JSON", () => {
    const compact = parseContract('{"version":1,"flow":"smoke","steps":[{"visit":"/"}]}');
    const spaced = parseContract(`{
      "steps": [{ "visit": "/" }],
      "flow": "smoke",
      "version": 1
    }`);
    expect(compact.ok).toBe(true);
    expect(spaced.ok).toBe(true);
    if (!compact.ok || !spaced.ok) {
      throw new Error("Expected valid contract controls.");
    }

    expect(hashContract(compact.value)).toEqual(hashContract(spaced.value));
  });

  it("normalizes JSON negative zero consistently", () => {
    const withCount = (equals: number) => ({
      flow: "zero-count",
      steps: [{ assertCount: { equals, locator: { testId: "items" } } }],
      version: 1,
    });

    const negativeZero = hashContract(withCount(-0));
    const positiveZero = hashContract(withCount(0));
    expect(negativeZero.ok).toBe(true);
    expect(positiveZero.ok).toBe(true);
    if (negativeZero.ok && positiveZero.ok) {
      expect(negativeZero.value.canonicalJson).toBe(positiveZero.value.canonicalJson);
      expect(negativeZero.value.hash).toBe(positiveZero.value.hash);
    }
  });

  it("matches RFC 8785 string escaping for valid contract content", () => {
    const result = canonicalizeContract({
      flow: '\u20ac$\u000f\nA\'B"\\"/',
      steps: [
        {
          assertCount: {
            equals: Number.MAX_SAFE_INTEGER,
            locator: { testId: "items" },
          },
        },
      ],
      version: 1,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        canonicalJson:
          '{"flow":"\u20ac$\\u000f\\nA\'B\\"\\\\\\"/","steps":[{"assertCount":{"equals":9007199254740991,"locator":{"testId":"items"}}}],"version":1}',
        contract: expect.any(Object),
      },
    });
  });

  it("changes identity when behavior changes", () => {
    const changed = {
      ...smokeContract,
      steps: [{ visit: "/changed" }],
    };

    const original = hashContract(smokeContract);
    const modified = hashContract(changed);
    expect(original.ok).toBe(true);
    expect(modified.ok).toBe(true);
    if (original.ok && modified.ok) {
      expect(modified.value.hash).not.toBe(original.value.hash);
    }
  });

  it("fails closed before canonicalizing non-JSON or schema-invalid values", () => {
    const cycle: { self?: unknown } = {};
    cycle.self = cycle;

    for (const value of [undefined, Number.NaN, cycle, { ...smokeContract, extra: true }]) {
      const result = hashContract(value);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues[0]?.code).not.toBe(CONTRACT_ISSUE_CODES.canonicalizationFailed);
      }
    }
  });

  it("ignores inherited serialization hooks by hashing a detached inert snapshot", () => {
    const original = Object.getOwnPropertyDescriptor(Object.prototype, "toJSON");
    let result: ReturnType<typeof hashContract>;
    let oversizedResult: ReturnType<typeof hashContract>;

    try {
      Object.defineProperty(Object.prototype, "toJSON", {
        configurable: true,
        value: () => "forged",
      });
      result = hashContract(smokeContract);
      oversizedResult = hashContract({
        flow: "oversized",
        steps: Array.from({ length: 20 }, () => ({
          fill: {
            locator: { testId: "field" },
            value: "x".repeat(4096),
          },
        })),
        version: 1,
      });
    } finally {
      if (original === undefined) {
        Reflect.deleteProperty(Object.prototype, "toJSON");
      } else {
        Object.defineProperty(Object.prototype, "toJSON", original);
      }
    }

    expect(result).toEqual({
      ok: true,
      value: {
        canonicalJson: '{"flow":"smoke","steps":[{"visit":"/"}],"version":1}',
        contract: smokeContract,
        hash: "sha256:7880947da8f9beb989ea29780701a65e51366508ba89ae787b5bb070ba5564b5",
      },
    });
    expect(oversizedResult.ok).toBe(false);
    if (!oversizedResult.ok) {
      expect(oversizedResult.issues[0]?.code).toBe(CONTRACT_ISSUE_CODES.maxBytesExceeded);
    }
  });

  it("never satisfies required contract fields through inherited properties", () => {
    const originalFlow = Object.getOwnPropertyDescriptor(Object.prototype, "flow");
    const originalVisit = Object.getOwnPropertyDescriptor(Object.prototype, "visit");
    let flowReads = 0;
    let visitReads = 0;
    let rootResult: ReturnType<typeof hashContract>;
    let nestedResult: ReturnType<typeof hashContract>;

    try {
      Object.defineProperties(Object.prototype, {
        flow: {
          configurable: true,
          get() {
            flowReads += 1;
            Object.defineProperty(this, "flow", {
              configurable: true,
              enumerable: true,
              value: "injected-flow",
              writable: true,
            });
            return "injected-flow";
          },
        },
        visit: {
          configurable: true,
          get() {
            visitReads += 1;
            throw new Error("Inherited property trap must not execute.");
          },
        },
      });
      rootResult = hashContract({ steps: [{ visit: "/" }], version: 1 });
      nestedResult = hashContract({ flow: "missing-step-field", steps: [{}], version: 1 });
    } finally {
      if (originalFlow === undefined) {
        Reflect.deleteProperty(Object.prototype, "flow");
      } else {
        Object.defineProperty(Object.prototype, "flow", originalFlow);
      }
      if (originalVisit === undefined) {
        Reflect.deleteProperty(Object.prototype, "visit");
      } else {
        Object.defineProperty(Object.prototype, "visit", originalVisit);
      }
    }

    expect(flowReads).toBe(0);
    expect(visitReads).toBe(0);
    for (const result of [rootResult, nestedResult]) {
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues.map((issue) => issue.code)).toContain(
          CONTRACT_ISSUE_CODES.schemaViolation,
        );
      }
    }
  });

  it("fails closed when a stateful Proxy cannot be detached", () => {
    let serializationReads = 0;
    let forged = false;
    const proxy = new Proxy(
      {
        flow: "smoke",
        steps: [{ visit: "/" }],
        version: 1,
      },
      {
        get(target, property, receiver) {
          if (property === "toJSON") {
            serializationReads += 1;
            forged = serializationReads > 1;
            return undefined;
          }
          if (property === "flow" && forged) {
            return 42;
          }
          return Reflect.get(target, property, receiver);
        },
      },
    );

    const result = hashContract(proxy);

    expect(serializationReads).toBe(0);
    expect(result).toEqual({
      issues: [
        {
          code: CONTRACT_ISSUE_CODES.invalidJsonValue,
          message: "The contract could not be detached into inert JSON data.",
          path: "",
        },
      ],
      ok: false,
    });
  });

  it("returns the frozen detached contract represented by the identity", () => {
    const mutable = {
      flow: "before",
      steps: [{ visit: "/before" }],
      version: 1,
    };
    const result = hashContract(mutable);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected a valid mutable contract control.");
    }

    mutable.flow = "after";
    mutable.steps[0] = { visit: "/after" };

    expect(result.value.contract.flow).toBe("before");
    expect(result.value.contract.steps[0]).toEqual({ visit: "/before" });
    expect(Object.isFrozen(result.value.contract)).toBe(true);
    expect(Object.isFrozen(result.value.contract.steps)).toBe(true);
    expect(Object.isFrozen(result.value.contract.steps[0])).toBe(true);
    expect(Reflect.set(result.value.contract, "flow", "forged")).toBe(false);
    expect(hashContract(result.value.contract)).toEqual(result);
  });

  it("does not silently normalize distinct Unicode strings", () => {
    const composed = hashContract({ ...smokeContract, flow: "caf\u00e9" });
    const decomposed = hashContract({ ...smokeContract, flow: "cafe\u0301" });

    expect(composed.ok).toBe(true);
    expect(decomposed.ok).toBe(true);
    if (composed.ok && decomposed.ok) {
      expect(composed.value.hash).not.toBe(decomposed.value.hash);
    }
  });
});
