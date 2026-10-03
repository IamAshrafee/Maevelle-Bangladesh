import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  basePath: '/admin',
  output: 'standalone',
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3002/:path*',
        basePath: false,
      },
    ];
  },
};

export default nextConfig;
