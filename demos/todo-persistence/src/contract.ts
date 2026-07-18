import type { ContractV1 } from "@mergevow/contract";

export const TODO_PERSISTENCE_CONTRACT = {
  flow: "todo-persistence",
  steps: [
    { visit: "/todos" },
    { click: { name: "Add task", role: "button" } },
    { fill: { locator: { label: "Title" }, value: "Ship release" } },
    { click: { name: "Create", role: "button" } },
    { assertVisible: { name: "Ship release", role: "listitem" } },
    { reload: {} },
    { assertVisible: { name: "Ship release", role: "listitem" } },
  ],
  version: 1,
} as const satisfies ContractV1;
