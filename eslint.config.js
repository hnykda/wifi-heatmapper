import reactPlugin from "eslint-plugin-react";
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import unusedImports from "eslint-plugin-unused-imports";
import reactHooks from "eslint-plugin-react-hooks";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";

export default [
  {
    ...eslint.configs.recommended,
    files: ["src/**/*.{js,jsx,mjs,cjs,ts,tsx}"],
  },
  ...tseslint.configs.recommended,
  eslintPluginPrettierRecommended,
  {
    ...reactPlugin.configs.flat.recommended,
    files: ["src/**/*.{js,jsx,mjs,cjs,ts,tsx}"],
    rules: {
      "react/prop-types": "off",
    },
  },
  {
    files: ["src/**/*.{js,jsx,mjs,cjs,ts,tsx}", "e2e/**/*.ts", "playwright.config.ts"],
    ignores: ["src/components/ui/**"],
    plugins: {
      "unused-imports": unusedImports,
      "react-hooks": reactHooks,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      semi: "error",
      "prefer-const": "error",
      "react/react-in-jsx-scope": "off",
      "@typescript-eslint/no-unused-expressions": [
        "error",
        {
          allowShortCircuit: true,
          allowTernary: true,
        },
      ],
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "@typescript-eslint/no-explicit-any": "off",
      "unused-imports/no-unused-vars": [
        "error",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
];
