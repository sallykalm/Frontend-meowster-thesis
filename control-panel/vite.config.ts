import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiHost = env.VITE_API_HOST ?? 'localhost'
  const apiPort = env.VITE_API_PORT ?? '15567'
  const backendOrigin = `http://${apiHost}:${apiPort}`

  return {
    plugins: [react()],
    server: {
      port: 5174,
      proxy: {
        '/api': backendOrigin,
        '/audio': backendOrigin,
      },
    },
  }
})
