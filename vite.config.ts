import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // Rolldown does not split dynamic imports into their own chunks by
        // default, which silently defeats the point of writing one. pdfjs is
        // ~420 kB raw and is loaded on demand by exactly one screen (signing a
        // fillable agreement); without this it rode along in the main bundle
        // for every visitor on every page.
        codeSplitting: true,
      },
    },
  },
})
