/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['marketplace.21labs.app', 'localhost'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'marketplace.21labs.app',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '8420',
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/api/marketplace/:path*',
        destination: process.env.NEXT_PUBLIC_MARKETPLACE_API_URL || 'http://localhost:8420/v1/catalog/:path*',
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;