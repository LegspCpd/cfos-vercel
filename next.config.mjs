/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Monaco is a large client-side dependency; keep it out of server bundles.
  transpilePackages: ['@monaco-editor/react'],
};

export default nextConfig;
