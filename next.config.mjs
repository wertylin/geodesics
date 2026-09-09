/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  transpilePackages: [
    "@dynamic-labs-sdk/client",
    "@dynamic-labs-sdk/evm",
    "@dynamic-labs-sdk/react-hooks",
  ],
}

export default nextConfig
