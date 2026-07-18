import { Ajv2020, type ErrorObject } from "ajv/dist/2020.js";
import { type JSONPath, printParseErrorCode, visit } from "jsonc-parser";

import { CONTRACT_LIMITS } from "./limits.js";
import { contractV1Schema } from "./schema.js";
import type { ContractV1 } from "./types.js";

export const CONTRACT_ISSUE_CODES = {
  dangerousKey: "DANGEROUS_KEY",
  duplicateKey: "DUPLICATE_KEY",
  invalidEncoding: "INVALID_ENCODING",
  invalidJson: "INVALID_JSON",
  invalidJsonValue: "INVALID_JSON_VALUE",
  maxBytesExceeded: "MAX_BYTES_EXCEEDED",
  maxDepthExceeded: "MAX_DEPTH_EXCEEDED",
  maxNodesExceeded: "MAX_NODES_EXCEEDED",
  schemaViolation: "SCHEMA_VIOLATION",
} as const;

export type ContractIssueCode = (typeof CONTRACT_ISSUE_CODES)[keyof typeof CONTRACT_ISSUE_CODES];

export interface ContractValidationIssue {
  readonly code: ContractIssueCode;
  readonly message: string;
  readonly path: string;
}

export type ContractValidationResult =
  | {
      readonly ok: true;
      readonly value: ContractV1;
    }
  | {
      readonly issues: readonly ContractValidationIssue[];
      readonly ok: false;
    };

const textDecoder = new TextDecoder("utf-8", { fatal: true });
const textEncoder = new TextEncoder();

const ajv = new Ajv2020({
  allErrors: true,
  coerceTypes: false,
  messages: true,
  removeAdditional: false,
  strict: true,
  useDefaults: false,
  validateFormats: false,
});

const validateSchema = ajv.compile<ContractV1>(contractV1Schema);

const dangerousKeys = new Set(["__proto__", "constructor", "prototype"]);

interface PendingValue {
  readonly depth: number;
  readonly path: string;
  readonly value: unknown;
}

function failure(issue: ContractValidationIssue): ContractValidationResult {
  return { issues: [issue], ok: false };
}

function pointerSegment(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function jsonPathPointer(path: JSONPath, property?: string): string {
  const segments = property === undefined ? path : [...path, property];
  return segments.map((segment) => `/${pointerSegment(String(segment))}`).join("");
}

function inspectJsonSource(json: string): ContractValidationIssue | undefined {
  const objectKeys: Set<string>[] = [];
  let duplicateIssue: ContractValidationIssue | undefined;
  let parseIssue: ContractValidationIssue | undefined;

  try {
    visit(
      json,
      {
        onError(error, offset) {
          parseIssue ??= {
            code: CONTRACT_ISSUE_CODES.invalidJson,
            message: `Invalid JSON (${printParseErrorCode(error)}) at offset ${offset}.`,
            path: "",
          };
        },
        onObjectBegin() {
          objectKeys.push(new Set());
        },
        onObjectEnd() {
          objectKeys.pop();
        },
        onObjectProperty(property, _offset, _length, _line, _character, pathSupplier) {
          const keys = objectKeys.at(-1);
          if (keys === undefined) {
            return;
          }
          if (keys.has(property)) {
            duplicateIssue ??= {
              code: CONTRACT_ISSUE_CODES.duplicateKey,
              message: `Duplicate property name ${JSON.stringify(property)} is not allowed.`,
              path: jsonPathPointer(pathSupplier(), property),
            };
          }
          keys.add(property);
        },
      },
      {
        allowEmptyContent: false,
        allowTrailingComma: false,
        disallowComments: true,
      },
    );
  } catch {
    return {
      code: CONTRACT_ISSUE_CODES.invalidJson,
      message: "Contract source could not be parsed as JSON.",
      path: "",
    };
  }

  return parseIssue ?? duplicateIssue;
}

function containsLoneSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        return true;
      }
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function invalidJsonValue(path: string, message: string): ContractValidationIssue {
  return {
    code: CONTRACT_ISSUE_CODES.invalidJsonValue,
    message,
    path,
  };
}

function inspectJsonTree(root: unknown): ContractValidationIssue | undefined {
  const pending: PendingValue[] = [{ depth: 1, path: "", value: root }];
  const seen = new WeakSet<object>();
  let nodeCount = 0;

  try {
    while (pending.length > 0) {
      const current = pending.pop();
      if (current === undefined) {
        break;
      }

      nodeCount += 1;
      if (nodeCount > CONTRACT_LIMITS.maxNodes) {
        return {
          code: CONTRACT_ISSUE_CODES.maxNodesExceeded,
          message: `Contract exceeds the ${CONTRACT_LIMITS.maxNodes} node limit.`,
          path: current.path,
        };
      }
      if (current.depth > CONTRACT_LIMITS.maxDepth) {
        return {
          code: CONTRACT_ISSUE_CODES.maxDepthExceeded,
          message: `Contract exceeds the ${CONTRACT_LIMITS.maxDepth} level depth limit.`,
          path: current.path,
        };
      }

      const valueType = typeof current.value;
      if (current.value === null || valueType === "boolean") {
        continue;
      }
      if (valueType === "string") {
        if (containsLoneSurrogate(current.value as string)) {
          return invalidJsonValue(
            current.path,
            "Strings must contain valid Unicode scalar values.",
          );
        }
        continue;
      }
      if (valueType === "number") {
        if (!Number.isFinite(current.value)) {
          return invalidJsonValue(current.path, "Numbers must be finite JSON numbers.");
        }
        continue;
      }
      if (valueType !== "object") {
        return invalidJsonValue(
          current.path,
          `Values of type ${valueType} are not valid JSON data.`,
        );
      }

      const objectValue = current.value as object;
      if (seen.has(objectValue)) {
        return invalidJsonValue(
          current.path,
          "Contracts must be JSON trees without cycles or aliases.",
        );
      }
      seen.add(objectValue);

      if (Object.getOwnPropertySymbols(objectValue).length > 0) {
        return invalidJsonValue(current.path, "Symbol properties are not valid JSON data.");
      }

      if (Array.isArray(objectValue)) {
        const ownNames = Object.getOwnPropertyNames(objectValue);
        if (
          ownNames.some(
            (name) =>
              name !== "length" &&
              (!/^(0|[1-9][0-9]*)$/.test(name) || Number(name) >= objectValue.length),
          )
        ) {
          return invalidJsonValue(current.path, "Arrays cannot contain named properties.");
        }

        for (let index = objectValue.length - 1; index >= 0; index -= 1) {
          const descriptor = Object.getOwnPropertyDescriptor(objectValue, String(index));
          if (descriptor === undefined || !("value" in descriptor)) {
            return invalidJsonValue(current.path, "Arrays cannot contain holes or accessors.");
          }
          pending.push({
            depth: current.depth + 1,
            path: `${current.path}/${index}`,
            value: descriptor.value,
          });
        }
        continue;
      }

      const prototype = Object.getPrototypeOf(objectValue);
      if (prototype !== Object.prototype && prototype !== null) {
        return invalidJsonValue(current.path, "Objects must use a plain or null prototype.");
      }

      const descriptors = Object.getOwnPropertyDescriptors(objectValue);
      for (const [key, descriptor] of Object.entries(descriptors)) {
        const keyPath = `${current.path}/${pointerSegment(key)}`;
        if (dangerousKeys.has(key)) {
          return {
            code: CONTRACT_ISSUE_CODES.dangerousKey,
            message: `Property name ${JSON.stringify(key)} is not allowed.`,
            path: keyPath,
          };
        }
        if (containsLoneSurrogate(key)) {
          return invalidJsonValue(
            keyPath,
            "Property names must contain valid Unicode scalar values.",
          );
        }
        if (!("value" in descriptor)) {
          return invalidJsonValue(keyPath, "Accessor properties are not valid JSON data.");
        }
        pending.push({
          depth: current.depth + 1,
          path: keyPath,
          value: descriptor.value,
        });
      }
    }
  } catch {
    return invalidJsonValue("", "The value could not be inspected as inert JSON data.");
  }

  return undefined;
}

function schemaIssues(errors: ErrorObject[] | null | undefined): ContractValidationIssue[] {
  if (errors === null || errors === undefined || errors.length === 0) {
    return [
      {
        code: CONTRACT_ISSUE_CODES.schemaViolation,
        message: "Contract does not match schema v1.",
        path: "",
      },
    ];
  }

  return errors.map((error) => ({
    code: CONTRACT_ISSUE_CODES.schemaViolation,
    message: `${error.keyword}: ${error.message ?? "schema validation failed"}`,
    path: error.instancePath,
  }));
}

export function validateContract(value: unknown): ContractValidationResult {
  const treeIssue = inspectJsonTree(value);
  if (treeIssue !== undefined) {
    return failure(treeIssue);
  }

  let serialized: string;
  try {
    const result = JSON.stringify(value);
    if (result === undefined) {
      return failure(invalidJsonValue("", "The contract is not serializable JSON data."));
    }
    serialized = result;
  } catch {
    return failure(invalidJsonValue("", "The contract is not serializable JSON data."));
  }

  if (textEncoder.encode(serialized).byteLength > CONTRACT_LIMITS.maxBytes) {
    return failure({
      code: CONTRACT_ISSUE_CODES.maxBytesExceeded,
      message: `Contract exceeds the ${CONTRACT_LIMITS.maxBytes} byte limit.`,
      path: "",
    });
  }

  if (!validateSchema(value)) {
    return { issues: schemaIssues(validateSchema.errors), ok: false };
  }

  return { ok: true, value: value as ContractV1 };
}

export function parseContract(source: string | Uint8Array): ContractValidationResult {
  let json: string;

  if (typeof source === "string") {
    if (containsLoneSurrogate(source)) {
      return failure({
        code: CONTRACT_ISSUE_CODES.invalidEncoding,
        message: "Contract source contains invalid Unicode scalar values.",
        path: "",
      });
    }
    json = source;
  } else {
    try {
      json = textDecoder.decode(source);
    } catch {
      return failure({
        code: CONTRACT_ISSUE_CODES.invalidEncoding,
        message: "Contract bytes are not valid UTF-8.",
        path: "",
      });
    }
  }

  const byteLength = textEncoder.encode(json).byteLength;
  if (byteLength > CONTRACT_LIMITS.maxBytes) {
    return failure({
      code: CONTRACT_ISSUE_CODES.maxBytesExceeded,
      message: `Contract exceeds the ${CONTRACT_LIMITS.maxBytes} byte limit.`,
      path: "",
    });
  }

  const sourceIssue = inspectJsonSource(json);
  if (sourceIssue !== undefined) {
    return failure(sourceIssue);
  }

  let value: unknown;
  try {
    value = JSON.parse(json) as unknown;
  } catch {
    return failure({
      code: CONTRACT_ISSUE_CODES.invalidJson,
      message: "Contract source is not valid JSON.",
      path: "",
    });
  }

  return validateContract(value);
}
