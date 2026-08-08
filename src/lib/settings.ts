import { prisma } from './db';

// Settings keys
export const SETTING_SIGNUPS_ENABLED = 'signupsEnabled';
export const SETTING_SITE_NAME = 'siteName';
export const SETTING_SITE_TAGLINE = 'siteTagline';
export const SETTING_BANNER_TEXT = 'bannerText';
export const SETTING_BANNER_ENABLED = 'bannerEnabled';
export const SETTING_BANNER_COLOR = 'bannerColor'; // e.g. "blue" | "amber" | "red" | "green"
export const SETTING_FOOTER_TEXT = 'footerText';
export const SETTING_DEFAULT_MODEL = 'defaultModel';
export const SETTING_AGENT_INSTRUCTIONS = 'agentInstructions';

// Defaults. Signups default OFF (secure). Site name defaults to the product name.
const DEFAULTS: Record<string, string> = {
  [SETTING_SIGNUPS_ENABLED]: 'false',
  [SETTING_SITE_NAME]: 'Cloudflare OS',
  [SETTING_SITE_TAGLINE]: 'AI 生产力工作区',
  [SETTING_BANNER_TEXT]: '',
  [SETTING_BANNER_ENABLED]: 'false',
  [SETTING_BANNER_COLOR]: 'blue',
  [SETTING_FOOTER_TEXT]: '',
  [SETTING_DEFAULT_MODEL]: '',
  [SETTING_AGENT_INSTRUCTIONS]: '',
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

export async function getSiteName(): Promise<string> {
  return (await getSetting(SETTING_SITE_NAME)) || 'Cloudflare OS';
}

export async function getSiteTagline(): Promise<string> {
  return (await getSetting(SETTING_SITE_TAGLINE)) || 'AI 生产力工作区';
}

export interface SiteSettings {
  signupsEnabled: boolean;
  siteName: string;
  siteTagline: string;
  bannerText: string;
  bannerEnabled: boolean;
  bannerColor: string;
  footerText: string;
  defaultModel: string;
  agentInstructions: string;
}

export async function getSiteSettings(): Promise<SiteSettings> {
  const [signupsEnabled, siteName, siteTagline, bannerText, bannerEnabled, bannerColor, footerText, defaultModel, agentInstructions] =
    await Promise.all([
      getSetting(SETTING_SIGNUPS_ENABLED),
      getSetting(SETTING_SITE_NAME),
      getSetting(SETTING_SITE_TAGLINE),
      getSetting(SETTING_BANNER_TEXT),
      getSetting(SETTING_BANNER_ENABLED),
      getSetting(SETTING_BANNER_COLOR),
      getSetting(SETTING_FOOTER_TEXT),
      getSetting(SETTING_DEFAULT_MODEL),
      getSetting(SETTING_AGENT_INSTRUCTIONS),
    ]);
  return {
    signupsEnabled: signupsEnabled === 'true',
    siteName,
    siteTagline,
    bannerText,
    bannerEnabled: bannerEnabled === 'true',
    bannerColor,
    footerText,
    defaultModel,
    agentInstructions,
  };
}

// Update a partial set of site settings. Values are stored as strings.
export async function updateSiteSettings(patch: Partial<SiteSettings>): Promise<void> {
  const writes: Promise<void>[] = [];
  if (patch.signupsEnabled !== undefined) writes.push(setSetting(SETTING_SIGNUPS_ENABLED, String(patch.signupsEnabled)));
  if (patch.siteName !== undefined) writes.push(setSetting(SETTING_SITE_NAME, patch.siteName));
  if (patch.siteTagline !== undefined) writes.push(setSetting(SETTING_SITE_TAGLINE, patch.siteTagline));
  if (patch.bannerText !== undefined) writes.push(setSetting(SETTING_BANNER_TEXT, patch.bannerText));
  if (patch.bannerEnabled !== undefined) writes.push(setSetting(SETTING_BANNER_ENABLED, String(patch.bannerEnabled)));
  if (patch.bannerColor !== undefined) writes.push(setSetting(SETTING_BANNER_COLOR, patch.bannerColor));
  if (patch.footerText !== undefined) writes.push(setSetting(SETTING_FOOTER_TEXT, patch.footerText));
  if (patch.defaultModel !== undefined) writes.push(setSetting(SETTING_DEFAULT_MODEL, patch.defaultModel));
  if (patch.agentInstructions !== undefined) writes.push(setSetting(SETTING_AGENT_INSTRUCTIONS, patch.agentInstructions));
  await Promise.all(writes);
}
