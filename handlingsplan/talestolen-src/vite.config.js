import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Build from /talestolen-src into ../talestolen (static, production-ready)
export default defineConfig({
  plugins: [react()],
  base: '/talestolen/',                  // app will live under /talestolen/
  build: { outDir: '../talestolen', emptyOutDir: true }
})
