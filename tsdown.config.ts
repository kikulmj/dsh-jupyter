/**
 * tsdown build for @dsh-local/dsh-jupyter — two artifacts:
 *
 * 1. `lib/index.js`  — the node half (ESM): workspace-gated notebook fs
 *    routes + the Jupyter kernel bridge. @deepseek-ai/* stay external: they
 *    resolve at runtime from the profile's flat module fallback.
 * 2. `lib/client.js` — the browser half: a closure-factory bundle calling
 *    `window.__ModuleLoader__.load({ id, factory })`; react and the platform
 *    module-table entries stay external, everything else inlines.
 *
 * This mirrors the repo's `clientBundle` preset (packages/client/tsdown.client.ts)
 * without depending on it, so the plugin builds standalone in the user home.
 */

/** Platform module-table entries the loader answers (mirror of PLATFORM_MODULES). */
const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
]

/** The documented runtime store exemption (lazy CJS table entry). */
const RUNTIME_STORE_EXEMPTION = '@deepseek-ai/dsh-client-runtime/client'

/** Externals resolved from the loader module table. */
export const CLIENT_EXTERNALS: readonly string[] = [...PLATFORM_MODULES, RUNTIME_STORE_EXEMPTION]

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
    // node-pty is a native module — externalized too, resolved at runtime via
    // createRequire from the plugin node_modules (the profile's built copy).
    external: [/^@deepseek-ai\//, 'node-pty'],
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
    external: [...CLIENT_EXTERNALS],
    define: {
      'process.env.NODE_ENV': JSON.stringify(NODE_ENV),
      'import.meta.env.MODE': JSON.stringify(NODE_ENV),
      'import.meta.env': JSON.stringify({ MODE: NODE_ENV }),
    },
    noExternal: (id: string) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
    outputOptions: {
      entryFileNames: 'client.js',
      banner: 'window.__ModuleLoader__.load({ id: "@dsh-local/dsh-jupyter", factory: (require) => {',
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
]
