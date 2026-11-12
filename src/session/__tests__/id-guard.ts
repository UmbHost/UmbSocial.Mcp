/**
 * The id guard's walker: finds every id-like input of a tool and checks that
 * `ID_SOURCES` names a tool that lists it.
 */

import { z } from "zod";
import type { ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { CMS_TOOLS } from "../../config/mcp-servers.js";
import { ID_SOURCES } from "../id-sources.js";

const ID_LIKE = /(Key|Keys|Id|Code|Version)$/;

function isIdField(name: string): boolean {
  return name === "key" || name === "version" || ID_LIKE.test(name);
}

/** Every property name in a JSON schema, nested objects and array items included. */
function propertyNames(schema: unknown, names = new Set<string>()): Set<string> {
  if (Array.isArray(schema)) {
    for (const item of schema) propertyNames(item, names);
    return names;
  }
  if (!schema || typeof schema !== "object") return names;
  const node = schema as Record<string, unknown>;
  if (node.properties && typeof node.properties === "object") {
    for (const [name, child] of Object.entries(node.properties)) {
      names.add(name);
      propertyNames(child, names);
    }
  }
  for (const key of ["items", "anyOf", "oneOf", "allOf", "additionalProperties"]) {
    if (key in node) propertyNames(node[key], names);
  }
  if (node.$defs && typeof node.$defs === "object") propertyNames(Object.values(node.$defs), names);
  return names;
}

/** "<tool>.<field>: <problem>" for every id input without a registered source. */
export function idGuardProblems(
  tools: readonly ToolDefinition<any, any>[],
  registered: ReadonlySet<string>,
): string[] {
  const problems: string[] = [];
  for (const tool of tools) {
    if (!tool.inputSchema) continue;
    const json = z.toJSONSchema(z.object(tool.inputSchema), { unrepresentable: "any" });
    for (const field of propertyNames(json)) {
      if (!isIdField(field)) continue;
      const source = ID_SOURCES[field];
      if (source === undefined) {
        problems.push(`${tool.name}.${field}: not in ID_SOURCES`);
      } else if (typeof source === "string") {
        if (!registered.has(source)) problems.push(`${tool.name}.${field}: ${source} isn't registered`);
      } else if (source.length === 0 || source.some((name) => !CMS_TOOLS.includes(name))) {
        problems.push(`${tool.name}.${field}: not a list of chained cms tools`);
      }
    }
  }
  return problems;
}
