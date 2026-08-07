import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'production' ? '/uef-loja-proyecto/' : '/',
  server: {
    port: 5173,
  },
}))
