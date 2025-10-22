import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ command, mode }) => {
  console.log('⚙️ Build executado com config ativa:', { command, mode })

  return {
    base: './',
    plugins: [
      react(),
      {
        name: 'inject-adsense',
        transformIndexHtml(html) {
          console.log('🚀 Injetando Google AdSense no index.html...')
          return html.replace(
            /<head>/i,
            `<head>
    <!-- ✅ Google AdSense (injetado automaticamente no build) -->
    <meta name="google-adsense-account" content="ca-pub-9448427657221443" />
    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9448427657221443" crossorigin="anonymous"></script>
    `
          )
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      port: 5173,
      open: true,
    },
  }
})
