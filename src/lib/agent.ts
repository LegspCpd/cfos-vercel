import { complete, streamCompletion, type ChatMessageIn } from './llm';
import { githubListRepos, githubReadFile, githubCreateIssue, githubWriteGranted } from './github';
import { gitlabListProjects, gitlabCreateIssue, gitlabWriteGranted } from './gitlab-tools';

// ---------------------------------------------------------------------------
// The "Code Mode" agent: it performs tasks by writing and applying code to the
// workspace's files. This is a simplified, Vercel-friendly version of the
// Cloudflare OS agent loop — no Dynamic Workers, no sandboxed processes.
// The agent edits files in the Postgres-backed workspace, and the frontend
// renders the result in an iframe preview.
//
// Multi-turn tool loop: the agent may call external tools (GitHub/GitLab) by
// emitting a tool-call JSON block. The server executes the call (respecting the
// per-connection writeAccess gate) and feeds the result back, then the agent
// continues until it emits a final answer. This mirrors the original OS's
// gatekeeper capability model: read tools run freely, write tools need an
// explicit grant.
// ---------------------------------------------------------------------------

export interface WorkspaceFileDraft {
  path: string;
  content: string;
}

// The tools the agent may call. Only predefined endpoints (GitHub/GitLab APIs) —
// no arbitrary URLs, so there is no SSRF surface.
export interface AgentTool {
  name: string;
  description: string;
  // Whether this tool mutates the external service (requires writeAccess grant).
  write: boolean;
}

export const AGENT_TOOLS: AgentTool[] = [
  {
    name: 'github_list_repos',
    description: 'List the user\'s GitHub repositories (read-only). No arguments.',
    write: false,
  },
  {
    name: 'github_read_file',
    description: 'Read a file from one of the user\'s own GitHub repositories (read-only). Arguments: {"repo": "owner/repo", "path": "src/index.ts"}',
    write: false,
  },
  {
    name: 'github_create_issue',
    description: 'Create an issue in one of the user\'s own GitHub repositories (WRITE — requires the user to have granted write access). Arguments: {"repo": "owner/repo", "title": "...", "body": "..."}',
    write: true,
  },
  {
    name: 'gitlab_list_projects',
    description: 'List the user\'s GitLab projects (read-only). No arguments.',
    write: false,
  },
  {
    name: 'gitlab_create_issue',
    description: 'Create an issue in one of the user\'s own GitLab projects (WRITE — requires the user to have granted write access). Arguments: {"project": "group/project", "title": "...", "body": "..."}',
    write: true,
  },
];

const TOOL_DESCRIPTIONS = AGENT_TOOLS.map((t) => `- ${t.name}: ${t.description}`).join('\n');

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

You have access to these tools (call them when the user's task needs external data):
${TOOL_DESCRIPTIONS}

To call a tool, emit a JSON block in your response like this (you may emit at most one tool call
per turn):
{"tool": "github_list_repos"}

After the tool result comes back, continue working toward the task. When you are done, respond
with a final JSON object in this exact shape:
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
  // Total tokens consumed by this agent run (from the provider's usage response).
  tokens?: number | null;
  // Tool calls made during this run, for the UI to display.
  toolCalls?: { tool: string; summary: string }[];
}

// The maximum number of tool-call turns in one agent run, bounding cost.
const MAX_TOOL_TURNS = 4;

// Execute one tool call. Returns a string result to feed back to the model.
// Write tools are gated on the per-connection writeAccess grant.
export async function executeAgentTool(
  userId: string,
  tool: string,
  args: Record<string, unknown>,
): Promise<{ result: string; summary: string }> {
  switch (tool) {
    case 'github_list_repos': {
      const result = await githubListRepos(userId);
      return { result, summary: 'Listed GitHub repositories' };
    }
    case 'github_read_file': {
      const repo = String(args.repo ?? '');
      const path = String(args.path ?? '');
      if (!repo || !path) return { result: 'Error: repo and path are required.', summary: 'GitHub read_file (missing args)' };
      const result = await githubReadFile(userId, repo, path);
      return { result, summary: `Read ${path} from ${repo}` };
    }
    case 'github_create_issue': {
      const repo = String(args.repo ?? '');
      const title = String(args.title ?? '');
      if (!repo || !title) return { result: 'Error: repo and title are required.', summary: 'GitHub create_issue (missing args)' };
      if (!(await githubWriteGranted(userId))) {
        return { result: 'Permission denied: this connection is read-only. Enable write access in Connections (Gatekeeper) first.', summary: 'GitHub create_issue (denied)' };
      }
      const result = await githubCreateIssue(userId, repo, title, String(args.body ?? ''));
      return { result, summary: `Created issue in ${repo}` };
    }
    case 'gitlab_list_projects': {
      const result = await gitlabListProjects(userId);
      return { result, summary: 'Listed GitLab projects' };
    }
    case 'gitlab_create_issue': {
      const project = String(args.project ?? '');
      const title = String(args.title ?? '');
      if (!project || !title) return { result: 'Error: project and title are required.', summary: 'GitLab create_issue (missing args)' };
      if (!(await gitlabWriteGranted(userId))) {
        return { result: 'Permission denied: this connection is read-only. Enable write access in Connections (Gatekeeper) first.', summary: 'GitLab create_issue (denied)' };
      }
      const result = await gitlabCreateIssue(userId, project, title, String(args.body ?? ''));
      return { result, summary: `Created issue in ${project}` };
    }
    default:
      return { result: `Error: unknown tool "${tool}".`, summary: `Unknown tool ${tool}` };
  }
}

// Parse a tool-call block from the model's raw output. Returns null when the output
// is a final answer rather than a tool call.
export function parseToolCall(raw: string): { tool: string; args: Record<string, unknown> } | null {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === 'object' && typeof parsed.tool === 'string') {
      return { tool: parsed.tool, args: parsed.args && typeof parsed.args === 'object' ? parsed.args : {} };
    }
  } catch {
    // Not JSON — not a tool call.
  }
  return null;
}

// Run the agent to (re)generate the app. `files` is the current workspace state,
// `prompt` is the user's instruction. `providerId` optionally selects which AI provider to use.
// `model` optionally overrides the provider's default model. `extraSystem` appends to the system prompt.
// `formatHint` is the workspace's output-format agent hint (e.g. "prefer for documents...").
// `userId` enables the multi-turn tool loop (GitHub/GitLab tools).
export async function runAgent(
  prompt: string,
  currentFiles: WorkspaceFileDraft[],
  history: { role: 'user' | 'assistant'; content: string }[] = [],
  providerId?: string,
  model?: string,
  extraSystem?: string,
  formatHint?: string,
  userId?: string,
): Promise<AgentResult> {
  const currentFileList = currentFiles
    .map((f) => `\n===== ${f.path} =====\n${f.content}`)
    .join('');

  const parts = [SYSTEM_PROMPT];
  if (formatHint) {
    parts.push(`\nThis workspace was created as a specific output format. When the task fits that format, prefer producing it:\n${formatHint}`);
  }
  if (extraSystem) {
    parts.push(`\nAdditional instructions from the site admin:\n${extraSystem}`);
  }
  const systemContent = parts.join('\n');

  const messages: ChatMessageIn[] = [
    { role: 'system', content: systemContent },
    ...history.map((h) => ({ role: h.role, content: h.content })),
    {
      role: 'user',
      content: `Current workspace files:${currentFileList || '\n(empty workspace)'}\n\nTask: ${prompt}`,
    },
  ];

  const toolCalls: { tool: string; summary: string }[] = [];
  let totalTokens: number | null = null;

  // Multi-turn tool loop: the model may emit a tool call; we execute it and feed the
  // result back, up to MAX_TOOL_TURNS times, then require a final answer.
  for (let turn = 0; turn <= MAX_TOOL_TURNS; turn++) {
    const { text, tokens } = await complete(messages, providerId, model);
    if (tokens) totalTokens = (totalTokens ?? 0) + tokens;

    const toolCall = parseToolCall(text);
    if (!toolCall) {
      const result = parseAgentResult(text);
      return { ...result, tokens: totalTokens, toolCalls };
    }

    if (!userId) {
      // No user context — can't execute tools; treat the tool call as a message.
      return {
        message: text,
        files: [],
        tokens: totalTokens,
        toolCalls,
      };
    }

    const { result, summary } = await executeAgentTool(userId, toolCall.tool, toolCall.args);
    toolCalls.push({ tool: toolCall.tool, summary });
    messages.push(
      { role: 'assistant', content: text },
      { role: 'user', content: `Tool "${toolCall.tool}" result:\n${result}\n\nContinue working toward the task. When done, respond with the final JSON shape.` },
    );
  }

  // Exhausted tool turns without a final answer — force one more completion.
  const { text, tokens } = await complete(messages, providerId, model);
  if (tokens) totalTokens = (totalTokens ?? 0) + tokens;
  const result = parseAgentResult(text);
  return { ...result, tokens: totalTokens, toolCalls };
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
