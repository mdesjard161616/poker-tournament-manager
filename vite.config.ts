import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { version } from './package.json';

// The build is one self-contained dist/index.html that opens straight from disk, offline.
export default defineConfig({
  base: './',
  define: {
    __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'),
  },
  plugins: [
    react(),
    viteSingleFile(),
    {
      // The running app compares this file with its own version to offer an update.
      name: 'version-file',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version }) });
      },
    },
  ],
});
