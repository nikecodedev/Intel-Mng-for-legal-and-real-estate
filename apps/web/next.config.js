/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@platform/types', '@platform/contracts'],
  output: 'standalone', // Required for Docker deployment
};

module.exports = nextConfig;

