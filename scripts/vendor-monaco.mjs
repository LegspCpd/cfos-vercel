#!/usr/bin/env node
/**
 * Build-time Monaco editor asset vendor.
 *
 * Copies the monaco-editor AMD build from node_modules into public/monaco/vs so the
 * editor is served from THIS deployment's own origin instead of the jsdelivr CDN.
 * The CDN is unreachable in some networks (and adds a third-party runtime dependency),
 * so both the Worker deploy editor and the workspace Code panel configure
 * @monaco-editor/react's loader to point at /monaco/vs.
 *
 * Result:
 *   - public/monaco/vs/loader.js
 *   - public/monaco/vs/editor/editor.main.js
 *   - ... (workers, basic-languages, language features)
 *
 * The copy is idempotent and cheap (a few MB of static files), so it runs on every
 * build. If node_modules is missing the package the build still succeeds — the editor
 * components fall back to the remote CDN via @monaco-editor/react's default loader.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'node_modules', 'monaco-editor', 'min', 'vs');
const OUT = path.join(ROOT, 'public', 'monaco', 'vs');

async function copyDir(src, out) {
  await fs.mkdir(out, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const s = path.join(src, entry.name);
    const o = path.join(out, entry.name);
    if (entry.isDirectory()) {
      await copyDir(s, o);
    } else {
      await fs.copyFile(s, o);
    }
  }
}

try {
  await fs.access(SRC);
} catch {
  console.error('[monaco] node_modules/monaco-editor not found — skipping vendor copy (editor will fall back to CDN).');
  process.exit(0);
}

await copyDir(SRC, OUT);
console.log(`[monaco] vendored monaco-editor AMD build → public/monaco/vs`);