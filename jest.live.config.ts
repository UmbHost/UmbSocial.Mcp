import type { JestConfigWithTsJest } from "ts-jest";

/**
 * The live checks (`npm run test:live`): the built server against running
 * sites. No MSW here, so real requests go out; see tests/live/README.md.
 */
const config: JestConfigWithTsJest = {
  displayName: "umbsocial-mcp-live",
  preset: "ts-jest/presets/js-with-ts-esm",
  testEnvironment: "node",
  maxWorkers: 1,
  testTimeout: 180_000,
  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { useESM: true, tsconfig: "<rootDir>/tests/live/tsconfig.json" }],
  },
  testMatch: ["<rootDir>/tests/live/**/*.test.ts"],
  testPathIgnorePatterns: ["/node_modules/"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
};

export default config;
