import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    define: {
      SUPABASE_URL: JSON.stringify(env.SUPABASE_URL ?? process.env.SUPABASE_URL ?? ''),
      SUPABASE_ANON_KEY: JSON.stringify(env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? ''),
    }
  }
})
