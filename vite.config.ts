import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The build is one self-contained dist/index.html that opens straight from disk, offline.
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
});
