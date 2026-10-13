/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  reactStrictMode: true,
  images: {
    unoptimized: true,
    domains: ['marketplace.otoyin.app', 'localhost'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'marketplace.otoyin.app',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '8420',
      },
    ],
  },
};

module.exports = nextConfig;
