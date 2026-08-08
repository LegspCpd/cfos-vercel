import { prisma } from './db';

// Settings keys
export const SETTING_SIGNUPS_ENABLED = 'signupsEnabled';

// Default: signups are DISABLED until an admin turns them on (secure default).
const DEFAULTS: Record<string, string> = {
  [SETTING_SIGNUPS_ENABLED]: 'false',
};

export async function getSetting(key: string): Promise<string> {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  return row?.value ?? DEFAULTS[key] ?? '';
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

export async function areSignupsEnabled(): Promise<boolean> {
  const v = await getSetting(SETTING_SIGNUPS_ENABLED);
  return v === 'true';
}
