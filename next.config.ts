import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // El controlador ODBC es nativo de Windows y debe cargarse desde node_modules,
  // no desde el empaquetado de Turbopack.
  serverExternalPackages: ["mssql", "msnodesqlv8"],
};

export default nextConfig;
