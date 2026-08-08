/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['argon2'],
  },
  // Monaco is a large client-side dependency; keep it out of server bundles.
  transpilePackages: ['@monaco-editor/react'],
};

export default nextConfig;
