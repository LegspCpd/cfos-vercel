// Central brand logo URL (fallback when the admin hasn't configured a custom logo).
// Override with NEXT_PUBLIC_LOGO_URL (inlined by Next at build time for client components).
export const LOGO_URL =
  process.env.NEXT_PUBLIC_LOGO_URL || 'https://placehold.co/96x96?text=OS';
