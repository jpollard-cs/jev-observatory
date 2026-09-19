import fs from 'node:fs/promises';
import { build } from 'esbuild';
import { buildWorkspace, runtimePlugin } from './workspace/build.mjs';
import { makeCatalog, makeExample } from './catalog.mjs';
const workspaceAssets = await buildWorkspace();
const catalog = await makeCatalog();
await fs.writeFile('catalog/generated.json', JSON.stringify(catalog));
await fs.writeFile('catalog/example.json', JSON.stringify(makeExample(catalog)));
await fs.mkdir('dist/server', { recursive: true });
await fs.mkdir('dist/.openai', { recursive: true });
await build({
  entryPoints: ['src/worker.mjs'],
  outfile: 'dist/server/index.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  loader: { '.html': 'text', '.css': 'text' },
  minify: false,
  inject: ['src/workspace/globals.mjs'],
  plugins: [
    runtimePlugin,
    {
      name: 'workspace-assets',
      setup(b) {
        b.onLoad({ filter: /\/community-site\/public\/(app|landing)\.js$/ }, async (args) => ({
          contents: await fs.readFile(args.path, 'utf8'),
          loader: 'text',
        }));
        b.onResolve({ filter: /^workspace:assets$/ }, () => ({
          path: 'workspace:assets',
          namespace: 'workspace-assets',
        }));
        b.onLoad({ filter: /.*/, namespace: 'workspace-assets' }, () => ({
          contents: JSON.stringify(workspaceAssets),
          loader: 'json',
        }));
      },
    },
  ],
});
await fs.copyFile('.openai/hosting.json', 'dist/.openai/hosting.json');
await fs.cp('drizzle', 'dist/.openai/drizzle', { recursive: true });
console.log('Built portable community Worker; preserved Observatory runtime.');
