import { describe, it, expect, vi } from 'vitest';

// The agent module pulls in server-only deps (openai, prisma, credentials). Mock them
// so the pure helpers (tool-call parsing, tool registry) can be tested in isolation.
vi.mock('@/lib/llm', () => ({
  complete: vi.fn(),
  streamCompletion: vi.fn(),
}));
vi.mock('@/lib/github', () => ({
  githubListRepos: vi.fn(),
  githubReadFile: vi.fn(),
  githubCreateIssue: vi.fn(),
  githubWriteGranted: vi.fn(),
}));
vi.mock('@/lib/gitlab-tools', () => ({
  gitlabListProjects: vi.fn(),
  gitlabCreateIssue: vi.fn(),
  gitlabWriteGranted: vi.fn(),
}));

import { parseToolCall, AGENT_TOOLS } from '@/lib/agent';

describe('agent: tool call parsing', () => {
  it('parses a bare tool call', () => {
    const call = parseToolCall('{"tool": "github_list_repos"}');
    expect(call).toEqual({ tool: 'github_list_repos', args: {} });
  });

  it('parses a tool call with args', () => {
    const call = parseToolCall(
      '{"tool": "github_read_file", "args": {"repo": "a/b", "path": "src/index.ts"}}',
    );
    expect(call).toEqual({
      tool: 'github_read_file',
      args: { repo: 'a/b', path: 'src/index.ts' },
    });
  });

  it('tolerates markdown fences', () => {
    const call = parseToolCall('```json\n{"tool": "gitlab_list_projects"}\n```');
    expect(call).toEqual({ tool: 'gitlab_list_projects', args: {} });
  });

  it('returns null for a final answer (not a tool call)', () => {
    expect(parseToolCall('{"message": "done", "files": []}')).toBeNull();
    expect(parseToolCall('plain text')).toBeNull();
    expect(parseToolCall('')).toBeNull();
    expect(parseToolCall('{"tool": 42}')).toBeNull();
  });
});

describe('agent: tool registry', () => {
  it('declares the expected tools with write flags', () => {
    const names = AGENT_TOOLS.map((t) => t.name);
    expect(names).toContain('github_list_repos');
    expect(names).toContain('github_read_file');
    expect(names).toContain('github_create_issue');
    expect(names).toContain('gitlab_list_projects');
    expect(names).toContain('gitlab_create_issue');
  });

  it('marks write tools correctly', () => {
    const write = AGENT_TOOLS.filter((t) => t.write).map((t) => t.name);
    expect(write).toEqual(['github_create_issue', 'gitlab_create_issue']);
  });
});