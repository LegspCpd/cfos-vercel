import { complete, streamCompletion, type ChatMessageIn } from './llm';

// ---------------------------------------------------------------------------
// The "Code Mode" agent: it performs tasks by writing and applying code to the
// workspace's files. This is a simplified, Vercel-friendly version of the
// Cloudflare OS agent loop — no Dynamic Workers, no sandboxed processes.
// The agent edits files in the Postgres-backed workspace, and the frontend
// renders the result in an iframe preview.
// ---------------------------------------------------------------------------

export interface WorkspaceFileDraft {
  path: string;
  content: string;
}

const SYSTEM_PROMPT = `You are a coding agent inside a workspace. You help the user build small
web applications by writing the source code directly.

The workspace supports plain HTML/CSS/JS single-page apps. You should produce a set of files.
Follow these rules:

- Always produce an entry HTML file at "index.html" that loads your CSS and JS.
- Prefer a single self-contained index.html, or split into index.html, style.css, app.js as it
  makes sense.
- Do NOT use npm, build tools, or external frameworks that require a server. You may use CDN
  <script> tags only if truly needed (e.g. a chart library), but prefer vanilla JS.
- The app runs entirely in the user's browser inside an iframe. Keep it self-contained.
- If the user wants a multi-file setup, that is fine.

You must respond with a JSON object in this exact shape:
{
  "message": "a short message to the user explaining what you did",
  "files": [
    { "path": "index.html", "content": "..." },
    { "path": "style.css", "content": "..." }
  ]
}

Only output valid JSON. No markdown fences, no extra text.`;

export interface AgentResult {
  message: string;
  files: WorkspaceFileDraft[];
}

// Run the agent once to (re)generate the app. `files` is the current workspace state,
// `prompt` is the user's instruction.
export async function runAgent(
  prompt: string,
  currentFiles: WorkspaceFileDraft[],
  history: { role: 'user' | 'assistant'; content: string }[] = [],
): Promise<AgentResult> {
  const currentFileList = currentFiles
    .map((f) => `\n===== ${f.path} =====\n${f.content}`)
    .join('');

  const messages: ChatMessageIn[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.map((h) => ({ role: h.role, content: h.content })),
    {
      role: 'user',
      content: `Current workspace files:${currentFileList || '\n(empty workspace)'}\n\nTask: ${prompt}`,
    },
  ];

  const raw = await complete(messages);
  return parseAgentResult(raw);
}

function parseAgentResult(raw: string): AgentResult {
  // Strip accidental markdown fences.
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed.files)) {
      throw new Error('response.files must be an array');
    }
    const files = parsed.files
      .map((f: { path?: string; content?: string }) => ({
        path: String(f.path ?? 'index.html'),
        content: String(f.content ?? ''),
      }))
      .filter((f: WorkspaceFileDraft) => f.path);
    return {
      message: String(parsed.message ?? 'Done.'),
      files,
    };
  } catch (e) {
    // If JSON parsing failed, treat the whole output as a chat-only message.
    return {
      message: raw,
      files: [],
    };
  }
}

// A streaming variant used by the chat endpoint. It streams the model's text output,
// and also performs file edits when the agent emits them. For simplicity the first
// version streams the agent's natural-language "message" field and applies files
// non-streamed after. To keep the client simple, this returns the full result.
export { streamCompletion };
