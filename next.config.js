/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle for the container image.
  output: 'standalone',
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    config.resolve.alias.encoding = false;
    return config;
  },
  experimental: {
    serverComponentsExternalPackages: ['pdfjs-dist']
  }
};

module.exports = nextConfig;
