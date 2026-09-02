import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    ignores: ['api/**'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  // 🔧 Vercel Serverless Functions (api/*.js): corren en Node, no en
  // el navegador — necesitan `globals.node` (process, console, etc.)
  // en vez de `globals.browser`. Sin este bloque, ESLint marcaba
  // 'process' is not defined en enviar-push.js, upload-image.js y
  // sitemap.js aunque el código sea correcto (falso positivo).
  {
    files: ['api/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
  },
])