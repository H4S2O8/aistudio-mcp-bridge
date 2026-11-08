import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist');
cpSync('public', 'dist', { recursive: true });
const common = { bundle: true, target: 'chrome120', logLevel: 'info', legalComments: 'none' };
await build({ ...common, entryPoints: { background: 'src/background.ts' }, outdir: 'dist', format: 'esm' });
await build({ ...common, entryPoints: { content: 'src/content.ts', options: 'src/options.ts' }, outdir: 'dist', format: 'iife' });
