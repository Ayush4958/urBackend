import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  target: "node20",
  outDir: "dist",
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  banner: {
    js: "// @urbackend/cli — Official urBackend CLI",
  },
});
