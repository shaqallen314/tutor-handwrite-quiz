import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl' // 🌟 引入 SSL 套件

export default defineConfig({
  plugins: [
    react(),
    basicSsl() // 🌟 啟動本機 HTTPS
  ],
})