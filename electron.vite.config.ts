import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/main/index.ts') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/preload/index.ts') },
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs'
        }
      }
    }
  },
  renderer: {
    // Root must be project root because index.html lives there.
    root: '.',
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src'),
        '@shared': resolve(__dirname, 'shared')
      }
    },
    build: {
      // electron-vite leaves the renderer unminified by default; Chromium keeps
      // every loaded script's source in memory, and parses it at startup.
      minify: 'esbuild',
      // Fonts always ship as files. Vite inlines assets under 4 KB as data: URLs, and the CSP in
      // index.html (default-src 'self', no data: fonts) refuses those: the small @fontsource subsets
      // (extended Cyrillic such as Ukrainian Ґ, Vietnamese) never loaded and their letters fell back.
      assetsInlineLimit: (filePath) => (/\.(woff2?|ttf|otf)$/i.test(filePath) ? false : undefined),
      rollupOptions: {
        input: { index: resolve(__dirname, 'index.html') }
      }
    },
    plugins: [react()]
  }
})
