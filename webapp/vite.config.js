import { defineConfig } from "vite";
import pkg from "./package.json" with { type: "json" };

const buildStamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 12);
const appVersion = `${pkg.version}+${buildStamp}`;

export default defineConfig({
  plugins: [
    {
      name: "inject-app-version-into-html",
      transformIndexHtml(html) {
        return html.replace(/__APP_VERSION__/g, appVersion);
      },
    },
  ],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    allowedHosts: ["penguin.linux.test", "localhost", "127.0.0.1"],
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    strictPort: true,
    allowedHosts: ["penguin.linux.test", "localhost", "127.0.0.1"],
  },
});
