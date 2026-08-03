import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { baseConfig } from "./base.js";

export const reactConfig = tseslint.config(...baseConfig, {
  plugins: {
    "react-hooks": reactHooks,
    "react-refresh": reactRefresh,
  },
  rules: {
    ...reactHooks.configs.recommended.rules,
    "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
  },
});

export default reactConfig;
