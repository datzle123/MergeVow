interface DetachedJsonValue {
  readonly ok: true;
  readonly value: unknown;
}

interface DetachmentFailure {
  readonly ok: false;
}

export type DetachJsonValueResult = DetachedJsonValue | DetachmentFailure;

interface MaskedSerializationHook {
  readonly descriptor: PropertyDescriptor | undefined;
  readonly value: object;
}

interface MaskedObjectPrototype {
  readonly prototype: object | null;
  readonly value: object;
}

export function detachJsonValue(value: unknown): DetachJsonValueResult {
  try {
    return { ok: true, value: structuredClone(value) };
  } catch {
    return { ok: false };
  }
}

export function withSerializationHooksMasked<T>(root: unknown, operation: () => T): T {
  const masked: MaskedSerializationHook[] = [];
  const pending = [root];

  try {
    while (pending.length > 0) {
      const current = pending.pop();
      if (current === null || typeof current !== "object") {
        continue;
      }

      masked.push({
        descriptor: Object.getOwnPropertyDescriptor(current, "toJSON"),
        value: current,
      });
      Object.defineProperty(current, "toJSON", {
        configurable: true,
        enumerable: false,
        value: undefined,
        writable: false,
      });

      for (const child of Object.values(current)) {
        pending.push(child);
      }
    }

    return operation();
  } finally {
    for (let index = masked.length - 1; index >= 0; index -= 1) {
      const entry = masked[index];
      if (entry === undefined) {
        continue;
      }
      if (entry.descriptor === undefined) {
        Reflect.deleteProperty(entry.value, "toJSON");
      } else {
        Object.defineProperty(entry.value, "toJSON", entry.descriptor);
      }
    }
  }
}

export function withObjectPrototypesMasked<T>(root: unknown, operation: () => T): T {
  const masked: MaskedObjectPrototype[] = [];
  const pending = [root];

  try {
    while (pending.length > 0) {
      const current = pending.pop();
      if (current === null || typeof current !== "object") {
        continue;
      }

      for (const child of Object.values(current)) {
        pending.push(child);
      }

      if (!Array.isArray(current)) {
        masked.push({ prototype: Object.getPrototypeOf(current), value: current });
        Object.setPrototypeOf(current, null);
      }
    }

    return operation();
  } finally {
    for (let index = masked.length - 1; index >= 0; index -= 1) {
      const entry = masked[index];
      if (entry !== undefined) {
        Object.setPrototypeOf(entry.value, entry.prototype);
      }
    }
  }
}
