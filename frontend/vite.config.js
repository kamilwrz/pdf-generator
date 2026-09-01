import process from 'node:process'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { assertBuildEnvironment } from './src/config/buildEnvironment.js'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // Vite does not inject `.env*` values into `process.env` while evaluating
  // this file. Loading them explicitly makes the production API validation a
  // real build-time gate instead of relying on client code to throw at runtime.
  const env = loadEnv(mode, process.cwd(), '')
  assertBuildEnvironment({ command, mode, env })

  return {
    plugins: [react()],
    build: {
      // CI reads the manifest graph to measure each route together with every
      // transitive static dependency instead of relying on chunk filenames.
      manifest: true,
    },
    server: mode === 'development'
      ? {
          proxy: {
            '/api': {
              target: env.VITE_DEV_API_TARGET || 'http://localhost:8000',
              changeOrigin: true,
              rewrite: (path) => path.replace(/^\/api/, ''),
            },
          },
        }
      : undefined,
  }
})
