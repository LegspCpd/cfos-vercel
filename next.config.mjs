/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Monaco is a large client-side dependency; keep it out of server bundles.
  transpilePackages: ['@monaco-editor/react'],

  // ssh2 (and its optional native dep cpu-features) load platform-specific .node binaries
  // at runtime. They must stay out of the webpack bundle — webpack cannot parse the native
  // binaries and fails with "Module parse failed". Treating them as server external packages
  // makes Next require() them at runtime instead of bundling, which is what serverless
  // functions support.
  serverComponentsExternalPackages: ['ssh2', 'cpu-features'],

  // Belt-and-suspenders: force ssh2 (and its optional native dep cpu-features) to stay
  // external in server bundles too, so webpack never tries to parse their .node binaries.
  // This covers any require() path inside ssh2 that webpack might otherwise chase.
  webpack(config, { isServer }) {
    if (isServer) {
      const ext = config.externals || [];
      config.externals = [...(Array.isArray(ext) ? ext : [ext]), 'ssh2', 'cpu-features'];
    }
    return config;
  },

  // Long-lived cache headers for immutable public assets. These are served from
  // the site origin (which sits behind Cloudflare), so Cloudflare caches them at
  // the edge and repeat visitors never hit Vercel for them.
  async headers() {
    const immutable = {
      key: 'Cache-Control',
      value: 'public, max-age=31536000, immutable',
    };
    return [
      {
        // Vendored third-party assets (Waline) — rebuilt per deploy, immutable.
        source: '/vendor/:path*',
        headers: [immutable],
      },
      {
        // Favicon / PWA icons / manifest — stable per deploy, safe to cache long.
        source: '/(site-icon|apple-touch-icon|app-icon|icon-192|icon-512|app-icon|logo).(png|jpg|jpeg|webp|svg|ico)',
        headers: [immutable],
      },
      {
        source: '/manifest.webmanifest',
        headers: [immutable],
      },
      {
        // PWA service worker: must be served fresh so updates propagate.
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }],
      },
      {
        // Published sites (/p/:token) render user-supplied HTML on the app origin.
        // The CSP `sandbox` directive (WITHOUT allow-same-origin) gives the document
        // an opaque origin: inline scripts still run, but they cannot read cookies,
        // localStorage, or any same-origin state — closing the stored-XSS → session
        // theft path. base-uri 'none' blocks <base> hijacking; form-action is
        // sandboxed with the page.
        source: '/p/:token',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "sandbox allow-scripts allow-forms allow-popups",
              "default-src 'none'",
              "script-src 'unsafe-inline' 'unsafe-eval'",
              "style-src 'unsafe-inline'",
              "img-src http: https: data:",
              "font-src http: https: data:",
              "media-src http: https: data:",
              "connect-src http: https:",
              "base-uri 'none'",
              "form-action http: https:",
            ].join('; '),
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
    ];
  },
};

export default nextConfig;
