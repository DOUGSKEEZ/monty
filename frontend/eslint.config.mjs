// ESLint flat config — the standard Vite + React setup.
// (Create React App ran ESLint inside react-scripts; Vite doesn't lint, so it lives here.)
// .mjs because this package is CommonJS (postcss/tailwind configs use module.exports).
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['build', 'build.cra-backup', 'src/vendor']),   // vendor = third-party (go2rtc player)

  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Capitalized names (components, React) are used via JSX
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },

  // Build tooling runs in Node
  { files: ['vite.config.js'], languageOptions: { globals: globals.node } },
  { files: ['postcss.config.js', 'tailwind.config.js'], languageOptions: { sourceType: 'commonjs', globals: globals.node } },

  // Jest-style test setup (testing-library)
  { files: ['src/setupTests.js', 'src/**/*.test.{js,jsx}'], languageOptions: { globals: globals.jest } },
]);
