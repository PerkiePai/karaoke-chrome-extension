import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const target = process.env.TARGET;

if (target !== 'content' && target !== 'background') {
  throw new Error(`TARGET must be "content" or "background", got: ${String(target)}`);
}

export default defineConfig({
  // Only the content build copies public/ and clears dist/, so the
  // background build that runs after it does not wipe the output.
  publicDir: target === 'content' ? 'public' : false,
  build: {
    outDir: 'dist',
    emptyOutDir: target === 'content',
    // Readable output in Opera GX devtools is worth more than bytes here.
    minify: false,
    target: 'chrome110',
    lib: {
      entry: resolve(__dirname, `src/${target}/index.ts`),
      // IIFE guarantees no import/export survives into the bundle, which
      // is mandatory for MV3 content scripts.
      formats: ['iife'],
      name: target === 'content' ? 'KaraokeContent' : 'KaraokeBackground',
      fileName: () => `${target}.js`,
    },
  },
});
