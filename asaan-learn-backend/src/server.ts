import "dotenv/config"
import express from "express"
import cors from "cors"
import http from "http"

import lessonsRouter from "./routes/lessons"
import testsRouter from "./routes/tests"
import questionsRouter from "./routes/questions"
import visualizeRouter from "./routes/visualize"   // 👈 add this
import { mountLessonWS } from "./ws/lessons"

// Helper to throw if env missing
function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env: ${name}`)
  return v
}

const ENV = {
  PORT: Number(process.env.PORT || 8787),
  SUPABASE_URL: required("SUPABASE_URL"),
  SUPABASE_SERVICE_ROLE: required("SUPABASE_SERVICE_ROLE"),
  OPENAI_API_KEY: required("OPENAI_API_KEY"),
  PUBLIC_ASSET_BASE: required("PUBLIC_ASSET_BASE"),
  STORAGE_BUCKET: process.env.STORAGE_BUCKET || "lessons",
}

const app = express()

app.use(cors({ origin: ["http://localhost:5173", "http://127.0.0.1:5173"] }))
app.use(express.json())

// Debug log env (safe ones only, not secrets)
console.log("✅ Loaded ENV:")
console.log("  SUPABASE_URL:", ENV.SUPABASE_URL)
console.log("  PUBLIC_ASSET_BASE:", ENV.PUBLIC_ASSET_BASE)
console.log("  STORAGE_BUCKET:", ENV.STORAGE_BUCKET)

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "asaan-learn-backend" })
})

/** Mount REST routes */
app.use("/lessons", lessonsRouter)
app.use("/tests", testsRouter)
app.use("/questions", questionsRouter)
app.use("/visualize", visualizeRouter)   // 👈 mount visualize

/** Create HTTP server & mount WS */
const server = http.createServer(app)
mountLessonWS(server)

server.listen(ENV.PORT, () => {
  console.log(`✅ Backend running on http://localhost:${ENV.PORT}`)
  console.log(`✅ REST ready at http://localhost:${ENV.PORT}/health`)
  console.log(`✅ WS ready at ws://localhost:${ENV.PORT}/ws/lessons/:lessonId`)
  console.log(`✅ Visualize ready at http://localhost:${ENV.PORT}/visualize`)
})
