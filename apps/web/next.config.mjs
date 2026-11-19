/** @type {import('next').NextConfig} */
const apiTarget = process.env.API_PROXY_TARGET;

const nextConfig = {
  output: 'standalone',
  async rewrites() {
    if (!apiTarget) return [];
    return [{ source: '/api/:path*', destination: `${apiTarget}/api/:path*` }];
  },
};

export default nextConfig;
