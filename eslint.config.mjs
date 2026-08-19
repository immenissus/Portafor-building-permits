import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextVitals,
  ...nextTypeScript,
  {
    rules: {
      // New React Compiler-era rules (react-hooks v7) that flag legitimate
      // patterns in this codebase: hydrating form state from async data and
      // checkout redirects. Re-enable incrementally as components are migrated
      // to derived state.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/immutability": "off",
      // Socrata/SQL payloads are arbitrary JSON; keep `any` visible as warnings
      // for targeted cleanup without failing the build.
      "@typescript-eslint/no-explicit-any": "warn"
    }
  }
];

export default eslintConfig;