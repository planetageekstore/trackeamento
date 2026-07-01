/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@trk/shared"],
  experimental: {
    // Permite importar o pacote workspace sem pré-build durante o dev.
    externalDir: true,
  },
  webpack: (config) => {
    // O código-fonte de @trk/shared usa imports ESM com extensão `.js` apontando
    // para arquivos `.ts`. Ensina o webpack a resolver `.js` → `.ts` (como o tsc).
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
