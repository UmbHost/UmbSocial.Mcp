// Loads .env, so the target-major stamp (below) can ask the site which Umbraco
// it is. Only `scripts/generate.ps1` turns the stamp on.
import "./src/load-env.js";

import { defineConfig, type HookFunction } from "orval";
import {
  orvalImportFixer,
  relaxUntypedArrays,
  postProcessZodFiles,
  createUmbracoTargetMajorTransformer,
} from "@umbraco-cms/mcp-server-sdk/orval";

/**
 * Orval configuration, following Umbraco's MCP server template.
 *
 * The input is the committed snapshot of the site's `umbsocial` Swagger
 * document, so `npm run generate` needs no site and CI never calls one.
 * `scripts/generate.ps1` refreshes the snapshot from a running site.
 *
 * The SDK's target-major stamp needs an authenticated, running site and has no
 * offline fallback, by design. It runs only when `UMBSOCIAL_STAMP_TARGET_MAJOR`
 * is `true` (set by `generate.ps1`); otherwise the committed constant, written
 * by the last run against a site, is left as it is.
 */
const SPEC = "./src/umbraco-api/api/umbsocial.swagger.json";

const stampTargetMajor =
  process.env.UMBSOCIAL_STAMP_TARGET_MAJOR === "true"
    ? createUmbracoTargetMajorTransformer({ outputPath: "./src/config/umbraco-target.generated.ts" })
    : null;

export default defineConfig({
  umbSocialApi: {
    input: {
      target: SPEC,
      unsafeDisableValidation: true,
      override: {
        transformer: (spec) => {
          const relaxed = relaxUntypedArrays(spec);
          return stampTargetMajor ? stampTargetMajor(relaxed) : relaxed;
        },
      },
    },
    output: {
      target: "./src/umbraco-api/api/generated/umbSocialApi.ts",
      client: "axios",
      mode: "single",
      clean: false,
      override: {
        mutator: {
          path: "./src/umbraco-api/api/client.ts",
          name: "customInstance",
        },
      },
    },
    hooks: {
      afterAllFilesWrite: orvalImportFixer as HookFunction,
    },
  },

  umbSocialApiZod: {
    input: {
      target: SPEC,
      unsafeDisableValidation: true,
      override: {
        transformer: relaxUntypedArrays,
      },
    },
    output: {
      target: "./src/umbraco-api/api/generated/umbSocialApi.zod.ts",
      client: "zod",
      mode: "single",
      clean: false,
      override: {
        zod: {
          dateTimeOptions: {
            local: true,
            offset: true,
          },
          coerce: {
            query: ["number", "boolean"],
          },
        },
      },
    },
    hooks: {
      afterAllFilesWrite: postProcessZodFiles as HookFunction,
    },
  },
});
