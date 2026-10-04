import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  globalIgnores([
    ".next/**",
    ".next-*/**",
    "node_modules/**",
    "**/.venv/**",
    "**/__pycache__/**",
    "out/**",
    "build/**",
    "next-env.d.ts"
  ])
]);
