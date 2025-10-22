import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// ⚙️ Ajuste para GitHub Pages
// Troque "megasena-app" pelo NOME exato do seu repositório no GitHub
export default defineConfig({
  base: '/Simulador-mega-sena/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
})
