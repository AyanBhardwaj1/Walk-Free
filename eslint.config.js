// Lint: correctness (TypeScript), React hook rules and accessibility.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "android",
      "ios",
      "public",
      ".cache",
      ".ui-improve",
      ".taste-skill",
      "coverage",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["**/*.{js,mjs}"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["src/**/*.tsx"],
    plugins: { "react-hooks": reactHooks, "jsx-a11y": jsxA11y },
    rules: {
      // The classic hook rules. The React Compiler rules in the plugin's
      // recommended set assume the compiler, which this app doesn't use.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      ...jsxA11y.flatConfigs.recommended.rules,
      // Listbox options are driven by their combobox's arrow keys and
      // aria-activedescendant, the WAI-ARIA pattern; clicks are for mice.
      "jsx-a11y/click-events-have-key-events": "off",
    },
  },
);
