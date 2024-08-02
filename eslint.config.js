import reactPlugin from "eslint-plugin-react";
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import unusedImports from "eslint-plugin-unused-imports";

export default [
  {
    ...eslint.configs.recommended,
    files: ["src/**/*.{js,jsx,mjs,cjs,ts,tsx}"],
  },
  ...tseslint.configs.recommended,
  {
    ...reactPlugin.configs.flat.recommended,
    files: ["src/**/*.{js,jsx,mjs,cjs,ts,tsx}"],
    rules: {
      "react/prop-types": "off",
    },
  },
  {
    files: ["src/**/*.{js,jsx,mjs,cjs,ts,tsx}"],
    ignores: ["src/components/ui/**"],
    plugins: {
      "unused-imports": unusedImports,
    },
    rules: {
      semi: "error",
      "prefer-const": "error",
      "react/react-in-jsx-scope": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
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
