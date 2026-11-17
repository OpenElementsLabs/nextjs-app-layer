import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": "warn",
    },
  },
  {
    // Storage throws or is missing in hardened browsers; every access must be guarded.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/page-size.ts", "src/**/__tests__/**", "src/test/**"],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "localStorage", message: "Storage can throw in hardened browsers; guard it." },
        { name: "sessionStorage", message: "Storage can throw in hardened browsers; guard it." },
      ],
      "no-restricted-properties": [
        "error",
        { object: "window", property: "localStorage", message: "Guard storage access." },
        { object: "window", property: "sessionStorage", message: "Guard storage access." },
      ],
    },
  },
  {
    ignores: ["node_modules/", "dist/"],
  },
);
