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
  return NextResponse.json({ adminEmail: admin?.email ?? null });
}
