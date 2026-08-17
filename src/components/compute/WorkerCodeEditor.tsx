'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import '@/lib/client/monaco';

// Monaco editor for the Worker deploy modal — JS syntax highlighting + Cloudflare
// Workers autocompletion (fetch/Request/Response/EventContext, env bindings, etc.).
// Loaded dynamically so the heavy monaco bundle only ships when the deploy modal opens.
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="mt-1 h-56 w-full animate-pulse rounded-md border bg-secondary/40" />
  ),
});

// Cloudflare Workers completion snippets (JS). Inserted via Tab when the user types a
// prefix. These cover the most common Worker entry points and bindings.
const WORKER_SNIPPETS: { label: string; detail: string; insertText: string }[] = [
  {
    label: 'fetch handler',
    detail: 'export default { async fetch(request, env, ctx) { … } }',
    insertText: [
      'export default {',
      '\tasync fetch(request, env, ctx) {',
      '\t\treturn new Response("Hello from Cloudflare OS!", {',
      '\t\t\theaders: { "content-type": "text/plain" },',
      '\t\t});',
      '\t},',
      '};',
    ].join('\n'),
  },
  {
    label: 'scheduled handler',
    detail: 'export default { async scheduled(controller, env, ctx) { … } }',
    insertText: [
      'export default {',
      '\tasync scheduled(controller, env, ctx) {',
      '\t\t// Runs on the cron schedule you configure in the dashboard.',
      '\t},',
      '};',
    ].join('\n'),
  },
  {
    label: 'fetch + route',
    detail: 'Route requests by URL path',
    insertText: [
      'export default {',
      '\tasync fetch(request, env, ctx) {',
      '\t\tconst url = new URL(request.url);',
      '\t\tif (url.pathname === "/api") {',
      '\t\t\treturn new Response("api");',
      '\t\t}',
      '\t\treturn new Response("not found", { status: 404 });',
      '\t},',
      '};',
    ].join('\n'),
  },
  {
    label: 'KV binding',
    detail: 'Read/write a KV namespace from env',
    insertText: [
      '// Bind a KV namespace named MY_KV in the dashboard, then:',
      'export default {',
      '\tasync fetch(request, env, ctx) {',
      '\t\tconst value = await env.MY_KV.get("key");',
      '\t\tawait env.MY_KV.put("key", "value");',
      '\t\treturn new Response(value ?? "empty");',
      '\t},',
      '};',
    ].join('\n'),
  },
  {
    label: 'CORS response',
    detail: 'Add CORS headers to every response',
    insertText: [
      'export default {',
      '\tasync fetch(request, env, ctx) {',
      '\t\tconst res = new Response("ok");',
      '\t\tres.headers.set("Access-Control-Allow-Origin", "*");',
      '\t\tres.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");',
      '\t\treturn res;',
      '\t},',
      '};',
    ].join('\n'),
  },
  {
    label: 'redirect',
    detail: 'Redirect a request to another URL',
    insertText: [
      'export default {',
      '\tasync fetch(request, env, ctx) {',
      '\t\treturn Response.redirect("https://example.com", 301);',
      '\t},',
      '};',
    ].join('\n'),
  },
];

// Extra completion items: Worker globals + common Web APIs.
const WORKER_GLOBALS: { label: string; detail: string; insertText: string }[] = [
  { label: 'fetch', detail: 'fetch(input, init?) → Promise<Response>', insertText: 'fetch(' },
  { label: 'Request', detail: 'new Request(input, init?)', insertText: 'new Request(' },
  { label: 'Response', detail: 'new Response(body?, init?)', insertText: 'new Response(' },
  { label: 'URL', detail: 'new URL(input, base?)', insertText: 'new URL(' },
  { label: 'Headers', detail: 'new Headers(init?)', insertText: 'new Headers(' },
  { label: 'crypto', detail: 'Web Crypto (subtle, randomUUID, …)', insertText: 'crypto.' },
  { label: 'atob', detail: 'Decode base64', insertText: 'atob(' },
  { label: 'btoa', detail: 'Encode base64', insertText: 'btoa(' },
  { label: 'console', detail: 'console.log / warn / error', insertText: 'console.' },
  { label: 'addEventListener', detail: 'addEventListener(type, listener)', insertText: 'addEventListener(' },
];

interface WorkerCodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Editor height (CSS). Defaults to 240px (deploy modal). The fullscreen IDE passes "100%". */
  height?: string;
}

export default function WorkerCodeEditor({ value, onChange, height = '240px' }: WorkerCodeEditorProps) {
  // Follow the app theme (light/dark/system) so the editor matches the surrounding UI.
  const [dark, setDark] = useState(true);
  useEffect(() => {
    const update = () => setDark(document.documentElement.classList.contains('dark'));
    update();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Stable completion provider across re-renders.
  const completionProvider = useMemo(
    () => ({
      provideCompletionItems: () => {
        const snippets = WORKER_SNIPPETS.map((s) => ({
          label: s.label,
          kind: 4, // Snippet
          detail: s.detail,
          insertText: s.insertText,
          insertTextRules: 4, // InsertAsSnippet
        }));
        const globals = WORKER_GLOBALS.map((g) => ({
          label: g.label,
          kind: 6, // Function
          detail: g.detail,
          insertText: g.insertText,
        }));
        return { suggestions: [...snippets, ...globals] };
      },
    }),
    [],
  );

  return (
    <div className={clsx('overflow-hidden rounded-md border bg-background', height === '100%' ? 'h-full' : 'mt-1')}>
      <MonacoEditor
        height={height}
        language="javascript"
        theme={dark ? 'vs-dark' : 'vs'}
        value={value}
        onChange={(v) => onChange(v ?? '')}
        beforeMount={(monaco) => {
          // Register the Cloudflare Workers completion provider once per editor instance.
          // beforeMount runs once per mount, so this cannot double-register on re-renders;
          // the provider is disposed with the editor when the modal closes.
          monaco.languages.registerCompletionItemProvider('javascript', completionProvider);
        }}
        options={{
          minimap: { enabled: false },
          fontSize: 12,
          lineNumbers: 'on',
          wordWrap: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          suggestOnTriggerCharacters: true,
          quickSuggestions: { other: true, comments: false, strings: false },
          tabCompletion: 'on',
          scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
        }}
      />
    </div>
  );
}