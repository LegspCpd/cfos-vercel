'use client';

import { loader } from '@monaco-editor/react';

// Shared Monaco setup for every editor in the app (Worker deploy modal, workspace Code
// panel). Two things are configured here:
//
// 1. The AMD build is served from the vendored local copy (public/monaco/vs, copied from
//    node_modules by scripts/vendor-monaco.mjs) instead of the jsdelivr CDN — the CDN is
//    unreachable in some networks and adds a third-party runtime dependency.
// 2. Web workers are pointed at the same local build. Without this the AMD loader tries
//    to resolve worker URLs from the module graph (which fails under Next.js bundling)
//    and falls back to running worker code on the main thread.
//
// Import this module once from any component that renders a Monaco editor; the loader
// config and MonacoEnvironment are idempotent.
loader.config({ paths: { vs: '/monaco/vs' } });

if (typeof window !== 'undefined') {
  window.MonacoEnvironment = {
    getWorker(_workerId: string, label: string) {
      const langWorker: Record<string, string> = {
        json: '/monaco/vs/language/json/json.worker.js',
        css: '/monaco/vs/language/css/css.worker.js',
        html: '/monaco/vs/language/html/html.worker.js',
        typescript: '/monaco/vs/language/typescript/ts.worker.js',
      };
      return new Worker(langWorker[label] ?? '/monaco/vs/editor/editor.worker.js', { type: 'module' });
    },
  };
}