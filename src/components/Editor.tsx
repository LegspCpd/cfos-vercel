'use client';

import { Editor as MonacoEditor } from '@monaco-editor/react';
import type { OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';

interface EditorProps {
  path: string;
  value: string;
  onChange: (value: string) => void;
}

function languageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    html: 'html',
    htm: 'html',
    css: 'css',
    scss: 'scss',
    json: 'json',
    md: 'markdown',
    py: 'python',
    rs: 'rust',
    go: 'go',
  };
  return map[ext] ?? 'plaintext';
}

export default function CodeEditor({ path, value, onChange }: EditorProps) {
  const handleMount: OnMount = (editor, monaco) => {
    // Optional: register a dark theme matching the app.
    monaco.editor.defineTheme('cfos-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#121212',
        'editor.lineHighlightBackground': '#1a1a1a',
      },
    });
    monaco.editor.setTheme('cfos-dark');
  };

  const options: editor.IStandaloneEditorConstructionOptions = {
    fontSize: 13,
    minimap: { enabled: true },
    scrollBeyondLastLine: false,
    automaticLayout: true,
    tabSize: 2,
    wordWrap: 'on',
    padding: { top: 12 },
    renderWhitespace: 'selection',
  };

  return (
    <MonacoEditor
      path={path}
      language={languageFromPath(path)}
      value={value}
      onChange={(v) => onChange(v ?? '')}
      onMount={handleMount}
      theme="cfos-dark"
      options={options}
      loading={<div className="p-4 text-sm text-muted-foreground">Loading editor...</div>}
    />
  );
}
