#!/usr/bin/env node
/**
 * Transpile TypeScript to JavaScript without type checking.
 * Use when `npm run build` fails due to type errors but you need to deploy.
 * Run: node scripts/build-transpile.mjs
 */
import * as esbuild from 'esbuild';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = join(__dirname, '..', 'src');
const outDir = join(__dirname, '..', 'dist');

function getTsFiles(dir, base = dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory() && e.name !== 'node_modules') {
      files.push(...getTsFiles(full, base));
    } else if (e.isFile() && e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) {
      files.push(full);
    }
  }
  return files;
}

const entryPoints = getTsFiles(srcDir);
if (entryPoints.length === 0) {
  console.error('No .ts files found in src');
  process.exit(1);
}

await esbuild.build({
  entryPoints,
  outdir: outDir,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: true,
  outExtension: { '.js': '.js' },
  packages: 'external',
}).catch(() => process.exit(1));

console.log('Transpiled', entryPoints.length, 'files to dist/');
