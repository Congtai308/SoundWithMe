/** @type {import('jest').Config} */
module.exports = {
  rootDir: ".",
  testEnvironment: "node",
  roots: ["<rootDir>/test"],
  testRegex: ".*\\.(spec|int-spec|e2e-spec)\\.ts$",
  setupFiles: ["<rootDir>/test/setup-env.ts"],
  // Integration suites share one Redis/Mongo; run them one at a time.
  maxWorkers: 1,
  moduleFileExtensions: ["ts", "js", "json"],
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "<rootDir>/test/tsconfig.json" }],
  },
};
