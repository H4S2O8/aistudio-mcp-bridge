import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist');
cpSync('public', 'dist', { recursive: true });
// --dev keeps a reload hook so an AI Studio tab can reload the extension after a rebuild.
const dev = process.argv.includes('--dev');
const common = { bundle: true, target: 'chrome120', logLevel: 'info', legalComments: 'none', define: { __DEV__: String(dev) } };
await build({ ...common, entryPoints: { background: 'src/background.ts' }, outdir: 'dist', format: 'esm' });
await build({ ...common, entryPoints: { content: 'src/content.ts', options: 'src/options.ts' }, outdir: 'dist', format: 'iife' });
