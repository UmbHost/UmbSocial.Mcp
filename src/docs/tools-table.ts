/**
 * The tools table and the refusal hints, as Markdown for the docs.
 *
 * The table is built from the tools themselves: the SDK's `toolToSummary`
 * (slices and annotations) and `toolToJsonSchema` (inputs). Hand-rolled
 * because the SDK lacks it: `formatToolTable` makes an aligned text table for
 * a terminal, cuts each description at 80 characters, and has no column for
 * the verb a tool needs or for Pro. The verb is read by asking each tool's
 * `enabled` about a user with one verb at a time, so it can't drift from the
 * check the server makes.
 */

import { toolToJsonSchema, toolToSummary, type ToolCollectionExport, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { DEFAULT_OFF_SLICES } from "../config/slice-registry.js";
import { REFUSAL_HINTS } from "../session/refusals.js";
import { ALL_VERBS, SOCIAL_SECTION, type SocialVerb } from "../session/social-user.js";

export const TOOLS_TABLE_PATH = "docs/tools-table.md";
export const REFUSAL_HINTS_PATH = "docs/refusal-hints.md";

const EDITIONS: Readonly<Record<string, string>> = { "social-pro": "Pro", "social-ai": "Pro + AI", "social-engage": "Pro + Engage" };

const VERB_LABELS: Readonly<Record<SocialVerb, string>> = {
  View: "View",
  Write: "Write",
  Schedule: "Schedule",
  Approve: "Approve",
  UseAi: "UseAi",
  Resolve: "Resolve",
  ManageSettings: "Manage settings",
};

const cell = (text: string) => text.replace(/\|/g, "\|").replace(/\s+/g, " ").trim();

const inList = (items: readonly string[]) =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;

/** The verbs any one of which lets a user see the tool; the section alone when it has no check. */
function verbsOf(tool: ToolDefinition<any, any>): string {
  if (!tool.enabled) return "Social section";
  const allows = (verbs: readonly SocialVerb[]) =>
    tool.enabled!({ allowedSections: [SOCIAL_SECTION], fallbackPermissions: verbs.map((verb) => `UmbSocial.${verb}`) });
  const verbs = ALL_VERBS.filter((verb) => allows([verb]));
  // None alone is enough: the verbs it needs together are the ones it can't do without.
  if (verbs.length === 0) {
    return ALL_VERBS.filter((verb) => !allows(ALL_VERBS.filter((other) => other !== verb)))
      .map((verb) => VERB_LABELS[verb])
      .join(" and ");
  }
  return inList(verbs.map((verb) => VERB_LABELS[verb]));
}

function slicesOf(slices: readonly string[]): string {
  const off = DEFAULT_OFF_SLICES as readonly string[];
  return slices.length === 0 ? "other" : slices.map((slice) => (off.includes(slice) ? `${slice} (off)` : slice)).join(", ");
}

function inputsOf(tool: ToolDefinition<any, any>): string {
  const schema = toolToJsonSchema(tool) as { properties?: Record<string, unknown>; required?: string[] };
  const required = new Set(schema.required ?? []);
  const names = Object.keys(schema.properties ?? {}).map((name) => `\`${name}${required.has(name) ? "" : "?"}\``);
  return names.length > 0 ? names.join(", ") : "none";
}

/** The description's first sentence. */
function firstSentence(description: string): string {
  const match = /^.*?[.!?](?=\s|$)/s.exec(description.trim());
  return match ? match[0] : description.trim();
}

/**
 * Every tool of every collection, as offline listings show them (no user, so
 * no tool is hidden), one Markdown table row each.
 */
export function renderToolsTable(collections: readonly ToolCollectionExport[]): string {
  const lines = [
    "| Tool | What it does | Needs | Slice | Edition | Hints | Inputs |",
    "| ---- | ------------ | ----- | ----- | ------- | ----- | ------ |",
  ];
  for (const collection of collections) {
    const collectionName = collection.metadata.name;
    for (const tool of collection.tools(undefined)) {
      const summary = toolToSummary(tool, collectionName);
      const hints = [summary.readOnly ? "read-only" : "", summary.destructive ? "destructive" : ""].filter(Boolean).join(", ");
      lines.push(
        `| \`${summary.name}\` | ${cell(firstSentence(tool.description))} | ${verbsOf(tool)} | ${slicesOf(summary.slices)} | ${
          EDITIONS[collectionName] ?? "Any"
        } | ${hints || "–"} | ${inputsOf(tool)} |`,
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

/** Every refusal hint this server adds, by code. */
export function renderRefusalHints(): string {
  const lines = ["| Code | Hint |", "| ---- | ---- |"];
  for (const [code, hint] of Object.entries(REFUSAL_HINTS).sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`| \`${code}\` | ${cell(hint)} |`);
  }
  return `${lines.join("\n")}\n`;
}
