import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Base rules shared across the monorepo (see packages/config for the
 * intent behind each rule). Kept inline here rather than importing the
 * .mjs export directly to avoid an extra cross-package build-order
 * dependency for something this small — revisit if it drifts from web's
 * config.
 */
export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/ban-ts-comment": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    ignores: ["dist/**", "node_modules/**"],
  },
);
