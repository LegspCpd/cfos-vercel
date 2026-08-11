import { NextResponse } from 'next/server';

// GET /api/deploy/available — whether the Deploy feature is enabled. It requires BOTH
// PAGES_KEY (CF API token) and PAGES_ACCOUNT_ID. The Workspaces page uses this to show the
// "Deploy" button only when deployment is actually configured — otherwise it would offer a
// button that always errors.
export async function GET() {
  const available = Boolean(process.env.PAGES_KEY && process.env.PAGES_ACCOUNT_ID);
  return NextResponse.json({ available });
}
