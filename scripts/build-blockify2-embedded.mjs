import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const repoRoot = process.cwd();
const sourcePath = path.join(repoRoot, 'textify-and-blockify-2', 'blockify-turbowarp-2.js');
const grammarPath = path.join(repoRoot, 'IR_GRAMMAR.md');
const outDir = path.join(repoRoot, 'textify-and-blockify-2');
const outFile = path.join(outDir, 'blockify-turbowarp-2.embedded.js');

const source = await readFile(sourcePath, 'utf8');
const grammar = await readFile(grammarPath, 'utf8');

// TB2_PROXY_URL is set at Railway deploy time so the Claude proxy URL is baked in.
// Defaults to localhost bridge for local development.
const proxyUrl = process.env.TB2_PROXY_URL || 'http://localhost:7331/proxy/claude';

const entry = `
import * as ScratchBlocks from 'scratch-blocks';

globalThis.__tb2ScratchBlocks = ScratchBlocks;

const __IR_GRAMMAR_TEXT__ = ${JSON.stringify(grammar)};
const TB2_CLAUDE_PROXY_URL = ${JSON.stringify(proxyUrl)};

${source}
`;

await mkdir(outDir, { recursive: true });

await build({
  stdin: {
    contents: entry,
    resolveDir: repoRoot,
    sourcefile: 'blockify-turbowarp-2.embedded.entry.js',
    loader: 'js'
  },
  bundle: true,
  outfile: outFile,
  format: 'iife',
  platform: 'browser',
  target: ['es2020']
});

console.log(`Built ${outFile}`);
