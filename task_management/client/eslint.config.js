import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

const importRules = [
  {
    group: ["../../*"],
    message: 'Use the "@/" alias for imports outside the current module.',
  },
  {
    group: ["@/features/*/*"],
    message: 'Import a feature through its public index, e.g. "@/features/auth".',
  },
];

const sharedLayerRules = [
  {
    group: ["@/features/*", "@/pages/*", "@/app/*"],
    message: "shared/ must not depend on features, pages or app.",
  },
];

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: { "simple-import-sort": simpleImportSort },
    rules: {
      "no-restricted-imports": ["error", { patterns: importRules }],
      // Order: side-effect imports, packages (React first), the "@/" alias, then relative paths.
      "simple-import-sort/imports": [
        "error",
        { groups: [["^\\u0000"], ["^react", "^@?\\w"], ["^@/"], ["^\\."]] },
      ],
      "simple-import-sort/exports": "error",
    },
  },
  {
    files: ["src/shared/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [...importRules, ...sharedLayerRules] }],
    },
  },
]);
