// Empacota main.ts (+ src/parser.js) em main.js, no formato que o Obsidian carrega (CommonJS).
// "node esbuild.config.mjs" observa mudanças; com "production", gera uma vez, minificado.
import esbuild from 'esbuild';
import process from 'process';
import builtins from 'builtin-modules';

const prod = process.argv[2] === 'production';

const context = await esbuild.context({
  banner: { js: '/* Persist Notes for Obsidian. MIT License. Source: https://github.com/Controlled/obsidian-persist-notes */' },
  entryPoints: ['main.ts'],
  bundle: true,
  external: ['obsidian', 'electron', '@codemirror/autocomplete', '@codemirror/collab', '@codemirror/commands', '@codemirror/language',
    '@codemirror/lint', '@codemirror/search', '@codemirror/state', '@codemirror/view', '@lezer/common', '@lezer/highlight', '@lezer/lr', ...builtins],
  format: 'cjs',
  target: 'es2018',
  logLevel: 'info',
  sourcemap: prod ? false : 'inline',
  treeShaking: true,
  minify: prod,
  outfile: 'main.js',
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
