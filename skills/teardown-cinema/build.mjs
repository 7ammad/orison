#!/usr/bin/env node
// Bundles a film or page folder (any folder with a main.js) into one self-contained HTML file:
// ./teardown-out/dist/<folder name>.html. No HUD, no fonts, no panels. Images are inlined as data URLs so the page can
// run from file:// (a file:// image would taint the WebGL canvas).
//
//   node "$SKILL_DIR/build.mjs" ./my-film ./my-page
//
// Optional files beside main.js: style.css (inlined), body.html (markup placed before the script).
// Three.js and esbuild come from the sibling teardown skill's node_modules; override with TEARDOWN_DEPS.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEPS = process.env.TEARDOWN_DEPS || path.resolve(HERE, '../teardown/node_modules');
const OUT = path.resolve(process.env.TEARDOWN_OUT || 'teardown-out');
const DIST = path.join(OUT, 'dist');
const esbuild = createRequire(path.join(DEPS, 'x.js'))('esbuild');
fs.mkdirSync(DIST, {recursive: true});

const kitPlugin = {
  name: 'cinema-kit',
  setup(b) {
    b.onResolve({filter: /^cinema-kit\//}, (args) => ({path: path.join(HERE, 'kit', args.path.slice('cinema-kit/'.length))}));
  },
};

// Exactly one three.js in the bundle, whatever node_modules sit near the film. Two copies do not fail loudly: the
// reflection environment quietly loses its blur levels.
const oneThree = {
  name: 'one-three',
  setup(b) {
    b.onResolve({filter: /^three($|\/)/}, (args) => {
      if (args.pluginData?.oneThree) return undefined;
      return b.resolve(args.path, {resolveDir: path.dirname(DEPS), kind: args.kind, pluginData: {oneThree: true}});
    });
  },
};

const BASE_CSS = `html,body{margin:0;height:100%;background:#000;overflow:hidden}
canvas#gl{position:fixed;inset:0;width:100%;height:100%;display:block}`;

for (const arg of process.argv.slice(2)) {
  const dir = path.resolve(arg);
  if (!fs.existsSync(path.join(dir, 'main.js'))) {
    console.error(`no main.js in ${dir}`);
    process.exit(1);
  }
  const name = path.basename(dir);
  const t0 = Date.now();
  const res = await esbuild.build({
    plugins: [kitPlugin, oneThree],
    entryPoints: [path.join(dir, 'main.js')],
    bundle: true,
    nodePaths: [DEPS],
    format: 'esm',
    minify: !process.env.SIMS_DEBUG,
    write: false,
    target: 'es2022',
    legalComments: 'none',
    loader: {'.jpg': 'dataurl', '.jpeg': 'dataurl', '.png': 'dataurl', '.webp': 'dataurl', '.glb': 'base64', '.json': 'json'},
    logLevel: 'warning',
  });
  const js = res.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
  const read = (f) => (fs.existsSync(path.join(dir, f)) ? fs.readFileSync(path.join(dir, f), 'utf8') : '');
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${process.env.PAGE_TITLE || name}</title>
<link rel="icon" href="data:,">
<style>
${BASE_CSS}
${read('style.css')}
</style>
</head>
<body>
${read('body.html')}
<script type="module">
${js}
</script>
</body>
</html>
`;
  const out = path.join(DIST, `${name}.html`);
  fs.writeFileSync(out, html);
  // FRAGMENT=1 also writes the page without a document skeleton, for hosts that add their own (Claude Artifacts).
  if (process.env.FRAGMENT) {
    const frag = `<title>${process.env.PAGE_TITLE || name}</title>
<style>
${BASE_CSS}
${read('style.css')}
</style>
${read('body.html')}
<script type="module">
${js}
</script>
`;
    fs.writeFileSync(path.join(DIST, `${name}.fragment.html`), frag);
  }
  console.log(`${out}  ${(html.length / 1024).toFixed(0)} KB  ${Date.now() - t0} ms`);
}
