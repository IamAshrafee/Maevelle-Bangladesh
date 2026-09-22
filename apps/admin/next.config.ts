import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  basePath: '/admin',
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3002/:path*',
      },
    ];
  },
};

export default nextConfig;
