import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// ✅ Plugin para injetar o Google AdSense no <head> automaticamente
function injectAdsense() {
  return {
    name: 'inject-adsense',
    transformIndexHtml(html) {
      return html.replace(
        /<head>/i,
        `<head>
    <!-- ✅ Google AdSense (injetado automaticamente no build) -->
    <meta name="google-adsense-account" content="ca-pub-9448427657221443" />
    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9448427657221443" crossorigin="anonymous"></script>
    `
      )
    },
  }
}

export default defineConfig({
  base: './', // necessário para Netlify
  plugins: [react(), injectAdsense()],
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
