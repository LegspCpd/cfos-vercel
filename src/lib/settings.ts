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

// Custom branding
export const SETTING_SITE_FAVICON = 'siteFavicon';
export const SETTING_SITE_LOGO = 'siteLogo';

// CAPTCHA / human verification config (admin-configurable, default off).
// Each stores the corresponding provider's secret (filled via admin panel → env var).
// A provider is "enabled" when BOTH its site key and secret are set.
export const SETTING_TURNSTILE_SITE_KEY = 'turnstileSiteKey';
export const SETTING_TURNSTILE_SECRET_KEY = 'turnstileSecretKey';
export const SETTING_RECAPTCHA_SITE_KEY = 'recaptchaSiteKey';
export const SETTING_RECAPTCHA_SECRET_KEY = 'recaptchaSecretKey';

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
  [SETTING_SITE_FAVICON]: '',
  [SETTING_SITE_LOGO]: '',
  [SETTING_TURNSTILE_SITE_KEY]: '',
  [SETTING_TURNSTILE_SECRET_KEY]: '',
  [SETTING_RECAPTCHA_SITE_KEY]: '',
  [SETTING_RECAPTCHA_SECRET_KEY]: '',
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
  siteFavicon: string;
  siteLogo: string;
  turnstileSiteKey: string;
  turnstileSecretKey: string;
  recaptchaSiteKey: string;
  recaptchaSecretKey: string;
}

// Human-verification provider config, derived from whether keys are present.
export interface CaptchaConfig {
  turnstileEnabled: boolean;
  turnstileSiteKey: string;
  recaptchaEnabled: boolean;
  recaptchaSiteKey: string;
}

export async function getSiteSettings(): Promise<SiteSettings> {
  const [
    signupsEnabled,
    siteName,
    siteTagline,
    bannerText,
    bannerEnabled,
    bannerColor,
    footerText,
    defaultModel,
    agentInstructions,
    siteFavicon,
    siteLogo,
    turnstileSiteKey,
    turnstileSecretKey,
    recaptchaSiteKey,
    recaptchaSecretKey,
  ] = await Promise.all([
    getSetting(SETTING_SIGNUPS_ENABLED),
    getSetting(SETTING_SITE_NAME),
    getSetting(SETTING_SITE_TAGLINE),
    getSetting(SETTING_BANNER_TEXT),
    getSetting(SETTING_BANNER_ENABLED),
    getSetting(SETTING_BANNER_COLOR),
    getSetting(SETTING_FOOTER_TEXT),
    getSetting(SETTING_DEFAULT_MODEL),
    getSetting(SETTING_AGENT_INSTRUCTIONS),
    getSetting(SETTING_SITE_FAVICON),
    getSetting(SETTING_SITE_LOGO),
    getSetting(SETTING_TURNSTILE_SITE_KEY),
    getSetting(SETTING_TURNSTILE_SECRET_KEY),
    getSetting(SETTING_RECAPTCHA_SITE_KEY),
    getSetting(SETTING_RECAPTCHA_SECRET_KEY),
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
    siteFavicon,
    siteLogo,
    turnstileSiteKey,
    turnstileSecretKey,
    recaptchaSiteKey,
    recaptchaSecretKey,
  };
}

// Public captcha config exposed to the signup page (site keys only, never secrets).
export async function getPublicCaptchaConfig(): Promise<CaptchaConfig> {
  const [turnstileSiteKey, turnstileSecretKey, recaptchaSiteKey, recaptchaSecretKey] = await Promise.all([
    getSetting(SETTING_TURNSTILE_SITE_KEY),
    getSetting(SETTING_TURNSTILE_SECRET_KEY),
    getSetting(SETTING_RECAPTCHA_SITE_KEY),
    getSetting(SETTING_RECAPTCHA_SECRET_KEY),
  ]);
  return {
    turnstileEnabled: Boolean(turnstileSiteKey && turnstileSecretKey),
    turnstileSiteKey,
    recaptchaEnabled: Boolean(recaptchaSiteKey && recaptchaSecretKey),
    recaptchaSiteKey,
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
  if (patch.siteFavicon !== undefined) writes.push(setSetting(SETTING_SITE_FAVICON, patch.siteFavicon));
  if (patch.siteLogo !== undefined) writes.push(setSetting(SETTING_SITE_LOGO, patch.siteLogo));
  if (patch.turnstileSiteKey !== undefined) writes.push(setSetting(SETTING_TURNSTILE_SITE_KEY, patch.turnstileSiteKey));
  if (patch.turnstileSecretKey !== undefined) writes.push(setSetting(SETTING_TURNSTILE_SECRET_KEY, patch.turnstileSecretKey));
  if (patch.recaptchaSiteKey !== undefined) writes.push(setSetting(SETTING_RECAPTCHA_SITE_KEY, patch.recaptchaSiteKey));
  if (patch.recaptchaSecretKey !== undefined) writes.push(setSetting(SETTING_RECAPTCHA_SECRET_KEY, patch.recaptchaSecretKey));
  await Promise.all(writes);
}

// Effective captcha secret for a given provider (used server-side to verify tokens).
export async function getCaptchaSecret(provider: 'turnstile' | 'recaptcha'): Promise<string> {
  return getSetting(provider === 'turnstile' ? SETTING_TURNSTILE_SECRET_KEY : SETTING_RECAPTCHA_SECRET_KEY);
}
