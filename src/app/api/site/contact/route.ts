import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/site/contact — public admin contact email shown in the "appeal" dialog.
// Returns the first admin with a verified email, or null if none is set.
export async function GET() {
  const admin = await prisma.user.findFirst({
    where: {
      email: { not: null },
      OR: [{ isAdmin: true }, { group: { is: { isAdminGroup: true } } }],
    },
    orderBy: { createdAt: 'asc' },
    select: { email: true },
  });
  // Mask the email so bots can't harvest a full address for phishing, while the appeal dialog
  // still shows who to contact (domain + first char).
  return NextResponse.json({ adminEmail: admin?.email ? maskEmail(admin.email) : null });
}

function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 1) return email; // no local part to mask
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const head = local.slice(0, 1);
  return `${head}${'•'.repeat(Math.min(4, Math.max(1, local.length - 1)))}@${domain}`;
}
