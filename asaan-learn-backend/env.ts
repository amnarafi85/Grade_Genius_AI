import 'dotenv/config'

function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env: ${name}`)
  return v
}

export const env = {
  PORT: Number(process.env.PORT || 8787),
  SUPABASE_URL: required("SUPABASE_URL"),
  SUPABASE_SERVICE_ROLE: required("SUPABASE_SERVICE_ROLE"),
  OPENAI_API_KEY: required("OPENAI_API_KEY"),
  PUBLIC_ASSET_BASE: required("PUBLIC_ASSET_BASE"),
  STORAGE_BUCKET: process.env.STORAGE_BUCKET || "lessons",
}
