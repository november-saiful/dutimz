import { build } from 'esbuild';

await build({
  entryPoints: ['src/scripts/client.ts'],
  bundle: true,
  minify: true,
  sourcemap: false,
  format: 'esm',
  target: ['es2022'],
  outfile: 'dist/client.js',
  logLevel: 'info',
});
