// electron.vite.config.ts
import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
var __electron_vite_injected_dirname = "C:\\Users\\yadav\\OneDrive\\Desktop\\projects\\Edge-Drop";
var electron_vite_config_default = defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__electron_vite_injected_dirname, "electron/main/index.ts") }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__electron_vite_injected_dirname, "electron/preload/index.ts") },
        output: {
          format: "cjs",
          entryFileNames: "[name].cjs"
        }
      }
    }
  },
  renderer: {
    // Root must be project root because index.html lives there.
    root: ".",
    resolve: {
      alias: {
        "@renderer": resolve(__electron_vite_injected_dirname, "src"),
        "@shared": resolve(__electron_vite_injected_dirname, "shared")
      }
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__electron_vite_injected_dirname, "index.html") }
      }
    },
    plugins: [react()]
  }
});
export {
  electron_vite_config_default as default
};
