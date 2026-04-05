import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@core": resolve(__dirname, "src/core"),
      "@engine": resolve(__dirname, "src/engine"),
      "@rendering": resolve(__dirname, "src/rendering"),
      "@physics": resolve(__dirname, "src/physics"),
      "@utils": resolve(__dirname, "src/utils"),
      "@ui": resolve(__dirname, "src/ui"),
      "@vehicles": resolve(__dirname, "src/vehicles"),
      "@data": resolve(__dirname, "src/data"),
      "@audio": resolve(__dirname, "src/audio"),
    },
  },
  base: "./",
  build: {
    target: "es2022",
    minify: "esbuild",
    sourcemap: false,
    outDir: resolve(__dirname, "../nolaws"),
    emptyOutDir: true,
  },
});
