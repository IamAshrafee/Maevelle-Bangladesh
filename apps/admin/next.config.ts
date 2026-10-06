import os from 'node:os';
import type { NextConfig } from 'next';

function getAllowedDevOrigins(): string[] {
  const origins = new Set<string>(['localhost', '127.0.0.1']);

  if (process.env.ALLOWED_DEV_ORIGINS) {
    for (const origin of process.env.ALLOWED_DEV_ORIGINS.split(',')) {
      const trimmed = origin.trim();
      if (trimmed) origins.add(trimmed);
    }
  }

  if (process.env.AUTH_TRUSTED_ORIGINS) {
    for (const item of process.env.AUTH_TRUSTED_ORIGINS.split(',')) {
      const trimmed = item.trim();
      if (!trimmed) continue;
      try {
        const url = new URL(trimmed);
        if (url.hostname) origins.add(url.hostname);
      } catch {
        const host = trimmed.replace(/^https?:\/\//, '').split(':')[0].split('/')[0];
        if (host) origins.add(host);
      }
    }
  }

  try {
    const interfaces = os.networkInterfaces();
    for (const iface of Object.values(interfaces)) {
      if (!iface) continue;
      for (const net of iface) {
        if ((net.family === 'IPv4' || (net as { family: string | number }).family === 4) && !net.internal) {
          origins.add(net.address);
        }
      }
    }
  } catch {
    // Ignore interface resolution errors
  }

  return Array.from(origins);
}

const nextConfig: NextConfig = {
  allowedDevOrigins: getAllowedDevOrigins(),
  basePath: '/admin',
  output: 'standalone',
  images: {
    unoptimized: true,
  },
  async redirects() {
    return [
      {
        source: '/',
        destination: '/admin',
        basePath: false,
        permanent: false,
      },
    ];
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
