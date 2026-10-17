import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Firebase SDK загружается отдельным чанком только при настроенном облаке
    chunkSizeWarningLimit: 700,
  },
})
