import type { InterpreterRunResult } from "@mergevow/interpreter";

const UNSAFE_TERMINAL_CHARACTER = /[\p{Cc}\p{Cf}\u2028\u2029]/gu;

function escapedCodePoint(value: string): string {
  const codePoint = value.codePointAt(0);
  if (codePoint === undefined) {
    return "";
  }
  if (codePoint <= 0xffff) {
    return `\\u${codePoint.toString(16).padStart(4, "0")}`;
  }
  const adjusted = codePoint - 0x1_0000;
  const high = 0xd800 + (adjusted >> 10);
  const low = 0xdc00 + (adjusted & 0x3ff);
  return `\\u${high.toString(16)}\\u${low.toString(16)}`;
}

function quoted(value: unknown): string {
  const serialized = JSON.stringify(value) ?? "null";
  return serialized.replace(UNSAFE_TERMINAL_CHARACTER, escapedCodePoint);
}

export function formatLocalRunSummary(result: InterpreterRunResult): string {
  const lines = [
    "MergeVow Local Cooperative",
    `flow: ${quoted(result.flow ?? null)}`,
    `verdict: ${result.executionVerdict}`,
    `steps: ${result.completedSteps}/${result.totalSteps}`,
  ];

  if (result.executionVerdict === "REGRESSION") {
    lines.push(
      `failure.step: ${result.failure.stepIndex}`,
      `failure.code: ${quoted(result.failure.code)}`,
      `failure.message: ${quoted(result.failure.message)}`,
    );
    if (Object.hasOwn(result.failure, "expected")) {
      lines.push(`failure.expected: ${quoted(result.failure.expected)}`);
    }
    if (Object.hasOwn(result.failure, "actual")) {
      lines.push(`failure.actual: ${quoted(result.failure.actual)}`);
    }
  } else if (result.executionVerdict === "INFRA_ERROR") {
    lines.push(
      `error.code: ${quoted(result.error.code)}`,
      `error.message: ${quoted(result.error.message)}`,
    );
    if (result.error.stepIndex !== undefined) {
      lines.push(`error.step: ${result.error.stepIndex}`);
    }
  }

  return `${lines.join("\n")}\n`;
}
