import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
  plugins: [
    tailwindcss(),
    react()
  ],
  server: {
    proxy: {
      '/icase-api': {
        target: env.API_PROXY_TARGET || 'http://127.0.0.1:5000',
        changeOrigin: true,
        // La API conserva su lista CORS para accesos directos. El proxy local
        // es servidor a servidor, no un nuevo origen autorizado públicamente.
        configure(proxy) {
          proxy.on('proxyReq', (proxyReq) => proxyReq.removeHeader('origin'));
        },
        rewrite: (path) => path.replace(/^\/icase-api(?=\/|$)/, ''),
      },
    },
  },
  };
})
