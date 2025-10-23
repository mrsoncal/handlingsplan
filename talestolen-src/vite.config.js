import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/talestolen-src/_build/',         // so assets resolve correctly from subpath
  build: { outDir: './_build', emptyOutDir: true }
})
