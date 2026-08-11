// Shared deploy pipeline for the Cloudflare Pages deploy feature. Runs the whole
// deploy inside one serverless invocation, invoking `log(line)` as it goes so the
// caller can stream real-time output to the client (e.g. via SSE).
//
// Note: the workspace editor produces static output files directly (it is a "vibe
// coded" static site builder), so this pipeline does not shell out to npm. The build /
// install / deploy command fields are captured as configuration and logged for
// transparency; the actual work is: collect files → apply extra env vars → create the
// Pages project → upload files → mint a short link. The streaming logs make the deploy
// feel live and give the user a place to watch progress / failures.

import { ensureProject, deployFiles, type PagesFile } from '@/lib/cf-pages';
import { createShortLink } from '@/lib/short-link';

export interface DeployConfig {
  buildCommand?: string | null;
  installCommand?: string | null;
  outputDir?: string | null;
  envJson?: string | null; // JSON string map of extra env vars
}

export interface DeployInput {
  projectName: string;
  files: PagesFile[];
  config: DeployConfig;
  makeShortLink: boolean;
}

export interface DeployResult {
  project: string;
  deploymentId: string;
  pagesUrl: string;
  shortUrl: string | null;
}

// Parse the user-supplied env vars JSON into a map. Best-effort: invalid JSON yields {}.
function parseEnv(envJson?: string | null): Record<string, string> {
  if (!envJson) return {};
  try {
    const raw = JSON.parse(envJson);
    if (raw && typeof raw === 'object') {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof v === 'string' || typeof v === 'number') out[k] = String(v);
      }
      return out;
    }
  } catch {
    /* ignore */
  }
  return {};
}

// Substitute "$ENV" / "${ENV}" placeholders in file contents with the supplied env map.
function applyEnv(files: PagesFile[], env: Record<string, string>): PagesFile[] {
  if (Object.keys(env).length === 0) return files;
  const sub = (content: Buffer): Buffer => {
    const text = content.toString('utf8');
    const out = text.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (m, braced: string, plain: string) => {
      const key = braced || plain;
      return key in env ? env[key] : m;
    });
    return Buffer.from(out, 'utf8');
  };
  return files.map((f) => ({ ...f, content: sub(f.content) }));
}

// Run the deploy. `log` is called with human-readable lines as work progresses.
export async function runDeploy(input: DeployInput, log: (line: string) => void): Promise<DeployResult> {
  const { projectName, config } = input;
  const env = parseEnv(config.envJson);

  if (config.installCommand) log(`[install] ${config.installCommand}`);
  if (config.buildCommand) log(`[build] ${config.buildCommand}`);
  if (config.outputDir) log(`[output] ${config.outputDir}`);
  if (Object.keys(env).length > 0) log(`[env] applying ${Object.keys(env).length} variable(s)`);

  log(`[pages] resolving project "${projectName}"`);
  const { name, subdomain } = await ensureProject(projectName);

  const envFiles = applyEnv(input.files, env);
  log(`[pages] uploading ${envFiles.length} file(s)`);

  const { deploymentId } = await deployFiles(name, envFiles);
  // The real pages.dev host is the project's `subdomain` (e.g. "abc-123.xyz"), NOT
  // "<name>.pages.dev" — constructing the URL from the project name alone yields a
  // non-existent host and the site 404s. Fall back to the name if no subdomain is known.
  const host = subdomain && !subdomain.endsWith('.pages.dev') ? `${subdomain}.pages.dev` : subdomain || `${name}.pages.dev`;
  const pagesUrl = `https://${host}`;
  log(`[pages] deployed → ${pagesUrl}`);

  let shortUrl: string | null = null;
  if (input.makeShortLink) {
    log('[link] minting short link…');
    try {
      shortUrl = await createShortLink(pagesUrl);
      log(`[link] ${shortUrl}`);
    } catch (e) {
      log(`[link] skipped: ${(e as Error).message}`);
      shortUrl = null;
    }
  }

  return { project: name, deploymentId, pagesUrl, shortUrl };
}
