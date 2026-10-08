import { defineConfig, transformWithOxc } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    {
      name: "community-jsx-in-js",
      enforce: "pre",
      transform(code, id) {
        if (/\/src\/.*\.js$/.test(id)) {
          return transformWithOxc(code, id.replace(/\.js$/, ".jsx"), {
            jsx: { runtime: "classic" },
          });
        }
      },
    },
    react({
      jsxRuntime: "classic",
    }),
  ],
  server: {
    host: "::",
    port: 3002,
    strictPort: true,
    open: false,
  },
  build: {
    outDir: "build",
    sourcemap: true,
  },
  envPrefix: "VITE_",
  oxc: {
    include: /src\/.*\.[jt]sx?$/,
    jsx: { runtime: "classic" },
  },
  define: {
    global: "globalThis",
  },
  optimizeDeps: {
    rolldownOptions: {
      moduleTypes: {
        ".js": "jsx",
      },
    },
    include: [
      "mic-recorder-to-mp3",
      "@material-ui/core",
      "@material-ui/icons",
      "@material-ui/lab",
    ],
    exclude: [],
  },
  resolve: {
    alias: {
      "jss-plugin-globalThis": "jss-plugin-global",
    },
  },
});
