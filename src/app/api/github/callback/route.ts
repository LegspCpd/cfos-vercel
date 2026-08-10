import { NextResponse } from 'next/server';
import { saveGitHubConnection } from '@/lib/github';
import { writeAudit } from '@/lib/audit';
import { siteBaseUrl, siteUrl } from '@/lib/site';

const CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

// GET /api/github/callback — OAuth callback for "connect to GitHub" flow.
// Exchange code for token, store the connection, redirect back to the shares/connections page.
export async function GET(req: Request) {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return NextResponse.json({ error: 'GitHub not configured' }, { status: 500 });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const storedState = req.headers.get('cookie')?.match(/github_oauth_state=([^;]+)/)?.[1];

  if (!state || !storedState || state !== storedState) {
    return redirect('/connections?error=Invalid+OAuth+state');
  }
  if (!state.startsWith('connect:') || !code) {
    return redirect('/connections?error=Connect+flow+expected');
  }

  // userId is embedded in state: "connect:<userId>:<nonce>"
  const userId = state.split(':')[1];
  if (!userId) return redirect('/connections?error=Invalid+state');

  try {
    const redirectUri = siteUrl('/api/github/callback');

    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
      }),
    });
    const tokenJson = (await tokenRes.json()) as { access_token?: string; error?: string };
    if (!tokenJson.access_token) return redirect('/connections?error=Token+failed');

    const login = await saveGitHubConnection(userId, tokenJson.access_token);
    await writeAudit({
      userId,
      action: 'github.connect',
      detail: `Connected GitHub account @${login}`,
    });
    return redirect('/connections?connected=1');
  } catch (e) {
    console.error('github connect error', e);
    return redirect('/connections?error=Connect+failed');
  }
}

function redirect(to: string): Response {
  return NextResponse.redirect(`${siteBaseUrl()}${to}`);
}
