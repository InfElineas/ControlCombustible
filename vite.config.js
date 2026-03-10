import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

async function loadBase44Plugin() {
  try {
    const mod = await import('@base44/vite-plugin')
    return mod.default({
      legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === 'true',
      hmrNotifier: true,
      navigationNotifier: true,
      analyticsTracker: true,
      visualEditAgent: true,
    })
  } catch {
    return null
  }
}

export default defineConfig(async () => {
  const base44Plugin = await loadBase44Plugin()

  return {
    logLevel: 'error',
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    plugins: [react(), ...(base44Plugin ? [base44Plugin] : [])],
  }
})
