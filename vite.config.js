import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  root: ".",
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        legal: resolve(__dirname, "legal.html"),
        admin: resolve(__dirname, "admin/index.html"),
      },
      output: {
        manualChunks(id) {
          const moduleId = id.replaceAll("\\", "/");
          if (
            moduleId.includes("@firebase/app-check")
            || moduleId.includes("firebase/app-check")
          ) {
            return "firebase-app-check";
          }
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    open: false,
  },
});
