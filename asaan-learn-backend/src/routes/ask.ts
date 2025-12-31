import { Router } from "express"
import { createClient } from "@supabase/supabase-js"
import OpenAI from "openai"

const router = Router()

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE!
)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const BUCKET = process.env.STORAGE_BUCKET || "lessons"

// 1️⃣ Generate step-by-step solution with whiteboard directives
router.post("/ai", async (req, res) => {
  try {
    const { studentId, question } = req.body
    console.log("➡️ [ASK] New question:", question)

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json" },
      messages: [
        { role: "system", content: `
          Aap ek maths teacher hain.
          Har question ka step-by-step hal dein:
          - Whiteboard directives use karein: WRITE_TEXT, DRAW_FRACTION_BAR.
          - Saath Roman Urdu explanation dein.
          - Output JSON array: 
            [{ step: "string", explanation: "string", whiteboard: [{...}]}]
        `},
        { role: "user", content: question }
      ]
    })

    console.log("🟡 [ASK] Got response from OpenAI")

    const raw = completion.choices[0].message?.content ?? "[]"
    let steps: any[] = []
    try {
      steps = JSON.parse(raw)
      console.log(`✅ [ASK] Parsed ${steps.length} steps`)
    } catch (err) {
      console.error("❌ JSON parse error:", raw)
      return res.status(500).json({ error: "AI output invalid" })
    }

    await supabase.from("questions").insert({
      student_id: studentId,
      to_target: "ai",
      question,
      answer: JSON.stringify(steps),
      status: "answered"
    })

    res.json({ steps })
  } catch (e: any) {
    console.error("❌ [ASK] Error:", e)
    res.status(500).json({ error: e.message })
  }
})

// 2️⃣ Generate Roman Urdu audio explanation for a step
router.post("/ai/explain", async (req, res) => {
  try {
    const { studentId, explanation } = req.body
    console.log("🟡 [ASK] Generating audio...")

    const speech = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "verse",
      input: explanation
    })

    const buffer = Buffer.from(await speech.arrayBuffer())
    const path = `ask/${studentId}/${Date.now()}.mp3`

    await supabase.storage.from(BUCKET).upload(path, buffer, {
      contentType: "audio/mpeg",
      upsert: true
    })

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
    console.log("✅ [ASK] Audio uploaded:", path)

    res.json({ audioUrl: data.publicUrl })
  } catch (e: any) {
    console.error("❌ [ASK] Audio error:", e)
    res.status(500).json({ error: e.message })
  }
})

export default router
