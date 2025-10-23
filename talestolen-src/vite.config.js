import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/talestolen-src',         // so assets resolve correctly from subpath
  build: { outDir: '../talestolen-src', emptyOutDir: true }
})
