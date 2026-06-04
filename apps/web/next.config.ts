import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // OCR (rasterisation de PDF scannés via unpdf + @napi-rs/canvas) : exécuté UNIQUEMENT côté
  // serveur (chemin OCR vision). @napi-rs/canvas tire un binaire natif `.node` que webpack ne
  // sait pas parser → on l'externalise côté serveur et on l'ignore côté client (jamais utilisé
  // dans le navigateur ; atteint par le barrel @zarya/extraction). Cf. extraction/rasterize-pdf.ts.
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Serveur : ne pas bundler le binaire natif — require() au runtime.
      config.externals = [
        ...(Array.isArray(config.externals)
          ? config.externals
          : [config.externals].filter(Boolean)),
        { "@napi-rs/canvas": "commonjs @napi-rs/canvas" },
      ];
    } else {
      // Client : jamais utilisé dans le navigateur — résoudre à vide.
      config.resolve.alias = { ...config.resolve.alias, "@napi-rs/canvas": false };
    }
    return config;
  },
};

export default nextConfig;
