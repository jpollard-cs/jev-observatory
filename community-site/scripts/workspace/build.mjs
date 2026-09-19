import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { parse } from 'acorn';
import { simple } from 'acorn-walk';
import { executionSources } from '../../../workbench/src/sources.mjs';
import { evidenceLibrary } from '../../../workbench/src/evidence-library.mjs';
import { splitFor } from '../../../workbench/vendor/original-catalog/harness/corpus.mjs';
import { verifyOriginalSources } from '../../../workbench/src/history/catalog.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)),
  app = path.resolve(here, '../..'),
  root = path.resolve(app, '..'),
  workbench = path.join(root, 'workbench');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sourcePaths = executionSources();
const files = Object.fromEntries(
  await Promise.all(
    [...new Set([...Object.keys(sourcePaths), 'replay.mjs'])].map(async (name) => [
      '/workbench/' + name,
      await fs.readFile(path.join(workbench, name), 'utf8'),
    ]),
  ),
);
verifyOriginalSources();
const reportFiles = {
  'consumer-admission-v1': 'data/consumer-admission-v1.report.json',
  'original-campaign': 'data/history/original-campaign.report.json',
  'original-encoding': 'data/history/original-encoding.report.json',
  'boundary-fewshot-v2': 'data/history/boundary-fewshot-v2.report.json',
  'prompt-variant-lab-v1': 'data/history/prompt-variant-lab-v1.report.json',
  'compact-single-pass-48-v1': 'data/history/compact-single-pass-48-v1.report.json',
};
// Sites source storage caps individual Git objects. Its checkout may carry the
// byte-identical report as .gz; materialize only these six known build inputs.
for (const name of Object.values(reportFiles)) {
  const target = path.join(workbench, name);
  try {
    await fs.access(target);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await fs.writeFile(target, gunzipSync(await fs.readFile(target + '.gz')));
  }
}
const records = evidenceLibrary().map((record) => ({ ...record, file: reportFiles[record.id] }));
const archived = await fs.readFile(
  path.join(workbench, 'data/history/original-extra-requests.json.gz'),
);
const release = {
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  sourceStamp: digest(JSON.stringify(sourcePaths)),
  archivedRequestsHash: digest(archived),
};
const aliases = { 'node:crypto': 'crypto.mjs', 'node:fs': 'files.mjs', 'node:url': 'urls.mjs' };
const runtimePlugin = {
  name: 'browser-workspace-boundaries',
  setup(b) {
    b.onResolve({ filter: /^workspace:/ }, (args) => ({ path: args.path, namespace: 'workspace' }));
    b.onLoad({ filter: /.*/, namespace: 'workspace' }, (args) => ({
      contents: JSON.stringify(
        { 'workspace:files': files, 'workspace:records': records, 'workspace:release': release }[
          args.path
        ],
      ),
      loader: 'json',
    }));
    b.onResolve({ filter: /^node:/ }, (args) =>
      args.path === 'node:path'
        ? { path: path.join(app, 'node_modules/path-browserify/index.js') }
        : aliases[args.path]
          ? { path: path.join(app, 'src/workspace', aliases[args.path]) }
          : null,
    );
    b.onLoad({ filter: /\/workbench\/.*\.mjs$/ }, async (args) => ({
      contents: (await fs.readFile(args.path, 'utf8'))
        .replaceAll(
          'import.meta.url',
          JSON.stringify('file:///workbench/' + path.relative(workbench, args.path)),
        )
        .replaceAll('splitFor.toString()', JSON.stringify(splitFor.toString())),
      loader: 'js',
    }));
  },
};
const safeMarkup = {
  name: 'sanitize-workbench-template-sinks',
  setup(b) {
    b.onResolve({ filter: /^\.\/transport\.js$/ }, () => ({
      path: path.join(app, 'src/workspace/transport.js'),
    }));
    b.onLoad({ filter: /\/workbench\/public\/.*\.js$/ }, async (args) => {
      let contents = await fs.readFile(args.path, 'utf8');
      const edits = [];
      simple(parse(contents, { ecmaVersion: 'latest', sourceType: 'module' }), {
        AssignmentExpression(node) {
          if (node.left.type === 'MemberExpression' && node.left.property.name === 'innerHTML')
            edits.push(node.right);
        },
        CallExpression(node) {
          if (
            node.callee.type === 'MemberExpression' &&
            node.callee.property.name === 'insertAdjacentHTML'
          )
            edits.push(node.arguments[1]);
        },
      });
      for (const node of edits.sort((a, b) => b.start - a.start))
        contents =
          contents.slice(0, node.start) +
          '__safeHTML(' +
          contents.slice(node.start, node.end) +
          ')' +
          contents.slice(node.end);
      if (edits.length)
        contents =
          'import { safeHTML as __safeHTML } from ' +
          JSON.stringify(path.join(app, 'src/workspace/safe-html.js')) +
          ';\n' +
          contents;
      return { contents, loader: 'js' };
    });
  },
};
export async function buildWorkspace() {
  const output = path.join(app, 'dist/workspace');
  await fs.mkdir(output, { recursive: true });
  await build({
    entryPoints: [path.join(app, 'src/workspace/engine.mjs')],
    outfile: path.join(output, 'engine.js'),
    bundle: true,
    platform: 'browser',
    format: 'esm',
    target: 'es2022',
    minify: true,
    plugins: [runtimePlugin],
    inject: [path.join(app, 'src/workspace/globals.mjs')],
  });
  await build({
    entryPoints: [path.join(workbench, 'public/app.js')],
    outfile: path.join(output, 'app.js'),
    bundle: true,
    platform: 'browser',
    format: 'esm',
    target: 'es2022',
    minify: true,
    plugins: [safeMarkup],
  });
  const assets = {};
  const add = (route, bytes, type, compress = true) => {
    assets[route] = {
      body: (compress ? gzipSync(bytes) : bytes).toString('base64'),
      type,
      encoding: compress ? 'gzip' : null,
    };
  };
  let html = (await fs.readFile(path.join(workbench, 'public/index.html'), 'utf8'))
    .replaceAll('href="/', 'href="/workspace/')
    .replaceAll('src="/', 'src="/workspace/')
    .replace('Loading local workbench', 'Opening your browser workspace');
  html = html.replace(
    '</head>',
    '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22%3E%3Ctext y=%2233%22 font-size=%2236%22%3E✧%3C/text%3E%3C/svg%3E"></head>',
  );
  add('/', Buffer.from(html), 'text/html');
  add('/workspace', Buffer.from(html), 'text/html');
  for (const name of ['app.js', 'engine.js'])
    add('/workspace/' + name, await fs.readFile(path.join(output, name)), 'text/javascript');
  for (const name of (await fs.readdir(path.join(workbench, 'public'))).filter((x) =>
    x.endsWith('.css'),
  ))
    add('/workspace/' + name, await fs.readFile(path.join(workbench, 'public', name)), 'text/css');
  for (const record of records)
    add(
      '/workspace/data/' + record.id + '.json',
      await fs.readFile(path.join(workbench, record.file)),
      'application/json',
    );
  add('/workspace/data/original-extra-requests.gz', archived, 'application/gzip', false);
  await fs.writeFile(path.join(output, 'assets.json'), JSON.stringify(assets));
  return assets;
}
