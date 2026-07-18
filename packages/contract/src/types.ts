export const CONTRACT_VERSION = 1 as const;

export const ACTION_OPCODES = ["visit", "click", "fill", "select", "check", "reload"] as const;

export const ASSERTION_OPCODES = [
  "assertVisible",
  "assertHidden",
  "assertUrl",
  "assertText",
  "assertValue",
  "assertCount",
  "assertChecked",
  "assertDisabled",
] as const;

export const ARIA_ROLES = [
  "alert",
  "alertdialog",
  "application",
  "article",
  "banner",
  "blockquote",
  "button",
  "caption",
  "cell",
  "checkbox",
  "code",
  "columnheader",
  "combobox",
  "complementary",
  "contentinfo",
  "definition",
  "deletion",
  "dialog",
  "directory",
  "document",
  "emphasis",
  "feed",
  "figure",
  "form",
  "generic",
  "grid",
  "gridcell",
  "group",
  "heading",
  "img",
  "insertion",
  "link",
  "list",
  "listbox",
  "listitem",
  "log",
  "main",
  "marquee",
  "math",
  "meter",
  "menu",
  "menubar",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "navigation",
  "none",
  "note",
  "option",
  "paragraph",
  "presentation",
  "progressbar",
  "radio",
  "radiogroup",
  "region",
  "row",
  "rowgroup",
  "rowheader",
  "scrollbar",
  "search",
  "searchbox",
  "separator",
  "slider",
  "spinbutton",
  "status",
  "strong",
  "subscript",
  "superscript",
  "switch",
  "tab",
  "table",
  "tablist",
  "tabpanel",
  "term",
  "textbox",
  "time",
  "timer",
  "toolbar",
  "tooltip",
  "tree",
  "treegrid",
  "treeitem",
] as const;

export type ActionOpcode = (typeof ACTION_OPCODES)[number];
export type AssertionOpcode = (typeof ASSERTION_OPCODES)[number];
export type ContractOpcode = ActionOpcode | AssertionOpcode;
export type AriaRole = (typeof ARIA_ROLES)[number];

export interface RoleLocator {
  readonly role: AriaRole;
  readonly name: string;
}

export interface LabelLocator {
  readonly label: string;
}

export interface TestIdLocator {
  readonly testId: string;
}

export type Locator = RoleLocator | LabelLocator | TestIdLocator;

export interface LocatorValuePayload {
  readonly locator: Locator;
  readonly value: string;
}

export interface LocatorEqualsPayload<T extends string | number | boolean> {
  readonly locator: Locator;
  readonly equals: T;
}

export interface VisitStep {
  readonly visit: string;
}

export interface ClickStep {
  readonly click: Locator;
}

export interface FillStep {
  readonly fill: LocatorValuePayload;
}

export interface SelectStep {
  readonly select: LocatorValuePayload;
}

export interface CheckStep {
  readonly check: Locator;
}

export interface ReloadStep {
  readonly reload: Record<string, never>;
}

export interface AssertVisibleStep {
  readonly assertVisible: Locator;
}

export interface AssertHiddenStep {
  readonly assertHidden: Locator;
}

export interface AssertUrlStep {
  readonly assertUrl: string;
}

export interface AssertTextStep {
  readonly assertText: LocatorEqualsPayload<string>;
}

export interface AssertValueStep {
  readonly assertValue: LocatorEqualsPayload<string>;
}

export interface AssertCountStep {
  readonly assertCount: LocatorEqualsPayload<number>;
}

export interface AssertCheckedStep {
  readonly assertChecked: LocatorEqualsPayload<boolean>;
}

export interface AssertDisabledStep {
  readonly assertDisabled: LocatorEqualsPayload<boolean>;
}

export type ActionStep = VisitStep | ClickStep | FillStep | SelectStep | CheckStep | ReloadStep;

export type AssertionStep =
  | AssertVisibleStep
  | AssertHiddenStep
  | AssertUrlStep
  | AssertTextStep
  | AssertValueStep
  | AssertCountStep
  | AssertCheckedStep
  | AssertDisabledStep;

export type ContractStep = ActionStep | AssertionStep;

export interface ContractV1 {
  readonly version: typeof CONTRACT_VERSION;
  readonly flow: string;
  readonly steps: readonly ContractStep[];
}
