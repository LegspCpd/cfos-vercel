import { NextResponse } from 'next/server';

// GET /api/connections/available — which external providers are configured in the
// environment. A provider is only "available" when its OAuth client credentials are set;
// otherwise the connect flow would 500. The Connections page uses this to hide providers
// the deployment hasn't enabled, instead of showing a dead card.
export async function GET() {
  return NextResponse.json({
    github: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    gitlab: Boolean(process.env.GITLAB_CLIENT_ID && process.env.GITLAB_CLIENT_SECRET),
  });
}
