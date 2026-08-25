module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react-hooks/recommended",
    "plugin:storybook/recommended",
  ],
  // vendor/ is upstream generated code with hand-applied patches — reformatting
  // or "fixing" it would lose the property that makes it reviewable, namely that
  // it still matches what protoc-gen-ts_proto emits.
  ignorePatterns: ["dist", "vendor", ".eslintrc.cjs"],
  parser: "@typescript-eslint/parser",
  plugins: ["react-refresh"],
  rules: {
    "react-refresh/only-export-components": [
      "warn",
      { allowConstantExport: true },
    ],
  },
};
