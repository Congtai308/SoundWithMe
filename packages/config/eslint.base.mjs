// Shared base rules. Each app extends this with its own framework-specific
// config (e.g. apps/web adds `eslint-config-next`, apps/api adds Nest rules).
export const baseRules = {
  "@typescript-eslint/no-explicit-any": "error",
  "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
  "@typescript-eslint/ban-ts-comment": "error",
  "no-console": ["warn", { allow: ["warn", "error"] }],
};
