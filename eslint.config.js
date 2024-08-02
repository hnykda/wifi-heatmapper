import reactPlugin from "eslint-plugin-react";

export default [
  reactPlugin.configs.flat.recommended,
  {
    rules: {
      semi: "error",
      "prefer-const": "error",
      "@next/next/no-img-element": "off",
    },
  },
];
