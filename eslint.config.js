import js from '@eslint/js';
import globals from 'globals';

export default [
  // _pipeline/ is the showcase film tooling (CommonJS scripts, a throwaway capture build); showcase/ is media.
  { ignores: ['dist/', 'node_modules/', 'art/', '.wrangler/', 'scratch/', 'playwright-report/', 'test-results/', '_pipeline/', 'showcase/'] },
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.browser, ...globals.node } },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
];
