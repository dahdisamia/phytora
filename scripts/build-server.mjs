import { build } from "esbuild";

await build({
  entryPoints: ["server/index.ts"],
  outfile: "dist-server/index.js",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: false,
  packages: "external",
  banner: {
    js: "import { createRequire as __createRequire } from 'module'; const require = __createRequire(import.meta.url);"
  },
  logLevel: "info"
});
