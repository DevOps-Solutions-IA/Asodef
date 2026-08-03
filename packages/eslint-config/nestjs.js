import { baseConfig } from "./base.js";

export const nestjsConfig = [
  ...baseConfig,
  {
    rules: {
      "@typescript-eslint/interface-name-prefix": "off",
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
];

export default nestjsConfig;
