/**
 * tsdown build for @dsh-local/dsh-jupyter — two artifacts:
 *
 * 1. `lib/index.js`  — the node half (ESM): session-scoped notebook file
 *    routes and the Python kernel bridge manager. @deepseek-ai/* stay
 *    external: they resolve at runtime from the profile's flat module
 *    fallback.
 * 2. `lib/client.js` — the browser half: a closure-factory bundle calling
 *    `window.__ModuleLoader__.load({ id, factory })`; only the platform
 *    module-table entries stay external, everything else inlines.
 */

/** Platform module-table entries the loader answers (dsh 0.2.x table). */
const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  'zod',
  '@tanstack/react-virtual',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

const NODE_ENV = process.env.NODE_ENV ?? 'production'

export default [
  {
    name: '@dsh-local/dsh-jupyter',
    entry: ['src/index.ts'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    dts: false,
    clean: false,
    // Keep the .js extension (package.json main/exports point at lib/index.js).
    fixedExtension: false,
    // Auto-externalized peers (cordis, dsh-*) resolve from the flat fallback;
    // keep the rule explicit so a stray value import cannot inline a duplicate.
    external: [/^@deepseek-ai\//],
  },
  {
    name: '@dsh-local/dsh-jupyter/client',
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    dts: false,
    clean: false,
    sourcemap: true,
    external: [...PLATFORM_MODULES],
    define: {
      'process.env.NODE_ENV': JSON.stringify(NODE_ENV),
      'import.meta.env.MODE': JSON.stringify(NODE_ENV),
      'import.meta.env': JSON.stringify({ MODE: NODE_ENV }),
    },
    noExternal: (id: string) => (PLATFORM_MODULES.includes(id) ? undefined : true),
    outputOptions: {
      entryFileNames: 'client.js',
      banner: 'window.__ModuleLoader__.load({ id: "@dsh-local/dsh-jupyter", factory: (require) => {',
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
]
