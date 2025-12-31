import { WebSocketServer } from "ws"
import type { Server } from "http"
import { createClient } from "@supabase/supabase-js"
import type { LessonScript } from "../types"

function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env: ${name}`)
  return v
}

const SUPABASE_URL = required("SUPABASE_URL")
const SUPABASE_SERVICE_ROLE = required("SUPABASE_SERVICE_ROLE")
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE)

export function mountLessonWS(server: Server) {
  const wss = new WebSocketServer({ noServer: true })

  server.on("upgrade", (req: any, socket, head) => {
    const urlStr = req.url || ""
    try {
      const url = new URL(urlStr, "http://localhost")
      if (!url.pathname.startsWith("/ws/lessons/")) {
        return socket.destroy()
      }
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req))
    } catch (e) {
      console.error("WS upgrade error:", e)
      socket.destroy()
    }
  })

  wss.on("connection", async (ws, req: any) => {
    const url = new URL(req.url, "http://localhost")
    console.log("🔌 WS connected:", url.pathname)

    const lessonId = Number(url.pathname.split("/").pop())
    if (!lessonId) return ws.close()

    const { data: row, error } = await supabase
      .from("lessons")
      .select("script")
      .eq("id", lessonId)
      .single()
    if (error || !row?.script) return ws.close()

    const script = row.script as LessonScript

    let paused = false
    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(String(raw))
        if (msg.type === "PAUSE") paused = true
        if (msg.type === "RESUME") paused = false
      } catch {}
    })

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
    const waitUntil = (pred: () => boolean) =>
      new Promise<void>((resolve) => {
        const t = setInterval(() => {
          if (pred()) {
            clearInterval(t)
            resolve()
          }
        }, 150)
      })

    for (const chunk of script.chunks) {
      if (paused) await waitUntil(() => !paused)
      ws.send(JSON.stringify({ type: "STEP_START", chunkId: chunk.id, ttsAudioUrl: chunk.ttsAudioUrl }))

      for (const ev of chunk.whiteboard) {
        if (paused) await waitUntil(() => !paused)
        ws.send(JSON.stringify(ev))
        await sleep(500)
      }

      ws.send(JSON.stringify({ type: "STEP_END", chunkId: chunk.id }))
      await sleep(700)
    }

    ws.send(JSON.stringify({ type: "LESSON_END" }))
  })
}
