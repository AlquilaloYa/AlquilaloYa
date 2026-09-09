import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export const sharedConfig = [
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/.next/**", "**/out/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
];

export default sharedConfig;