import { Router } from "express"
import { createClient } from "@supabase/supabase-js"
import OpenAI from "openai"
import multer from "multer"
import fs from "fs"
import path from "path"
import { z } from "zod"

const router = Router()

// --- Multer storage (keeps extension) ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".mp3" // default .mp3
    cb(null, file.fieldname + "-" + Date.now() + ext)
  }
})
const upload = multer({ storage })

// --- Supabase & OpenAI ---
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE!)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

// ---------------------- SCHEMA ----------------------
const WhiteboardDirectiveSchema = z.object({
  type: z.enum(["WRITE_TEXT", "DRAW_FRACTION_BAR", "ERASE"]),
  x: z.number().nullable(),
  y: z.number().nullable(),
  text: z.string().nullable(),
  numerator: z.number().nullable(),
  denominator: z.number().nullable(),
  w: z.number().nullable(),
  h: z.number().nullable(),
})

const AnswerSchema = z.object({
  explanation: z.string(), // Roman Urdu explanation
  whiteboard: z.array(WhiteboardDirectiveSchema), // Steps in English
})

const answerSchemaJson = {
  type: "object",
  properties: {
    explanation: { type: "string" },
    whiteboard: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["WRITE_TEXT", "DRAW_FRACTION_BAR", "ERASE"] },
          x: { type: ["number", "null"] },
          y: { type: ["number", "null"] },
          text: { type: ["string", "null"] },
          numerator: { type: ["number", "null"] },
          denominator: { type: ["number", "null"] },
          w: { type: ["number", "null"] },
          h: { type: ["number", "null"] },
        },
        required: ["type","x","y","text","numerator","denominator","w","h"],
        additionalProperties: false,
      }
    }
  },
  required: ["explanation", "whiteboard"],
  additionalProperties: false
} as const

// ---------------------- CORE PIPELINE ----------------------
async function generateSolution(studentId: string, question: string, id: number) {
  console.log("[ASK] Calling OpenAI with question:", question)

 const completion = await openai.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [
    {
      role: "system",
      content: `
You are a **very patient, child-friendly Math Tutor for Grade 6**.  
You must output JSON with TWO fields: { whiteboard, explanation }.

1. **Whiteboard Steps (English, very structured and detailed)**  
   - Break the entire solution into many steps with headings: "Step 1:", "Step 2:", etc.  
   - First explain the concept (e.g., what are factors).  
   - Then show the process: divide the number by 1, 2, 3 … up to that number, checking which divisions leave remainder 0.  
   - Write every equation on the board clearly, e.g. "32 ÷ 1 = 32 (so 1 is a factor)", "32 ÷ 2 = 16 (so 2 is a factor)", etc.  
   - Always include setup, calculation, intermediate results, and the final answer.  
   - Use **equations and math notation** wherever possible.

2. **Explanation (Roman Urdu, very detailed, child-friendly, at least 5+ minutes when spoken)**  
   - First explain the concept in detail: e.g., "Factors ka matlab kya hota hai" using easy words.  
   - Then explain how to find them **step by step**, slowly and carefully.  
   - Mention every division check in words: "Jab hum 32 ko 2 se divide karte hain, humein 16 milta hai aur remainder 0 aata hai, iska matlab 2 bhi factor hai".  
   - Use **real-life analogies** (apples, chocolates, toys, distributing items among friends).  
   - Be friendly, use encouraging tone ("Dekho ye interesting hai", "Shabash, tum samajh gaye").  
   - Equations and numbers must always remain in **English digits and symbols** (like 32 ÷ 4 = 8), not Urdu.  
   - Total length must be long enough that if read aloud it lasts more than 5 minutes.  
   - Avoid sounding robotic, make it natural, like a kind teacher.

Output must strictly follow the JSON schema I give you.`
    },
    { role: "user", content: `Solve this step by step: ${question}` }
  ],
  response_format: {
    type: "json_schema",
    json_schema: { name: "solution", schema: answerSchemaJson, strict: true }
  }
})


  const content = completion.choices[0]?.message?.content ?? "{}"
  console.log("[ASK] Raw AI JSON:", content)

  const parsed = AnswerSchema.parse(JSON.parse(content))

  await supabase.from("questions").update({
    answer: JSON.stringify(parsed),
    status: "answered"
  }).eq("id", id)

  return parsed
}

// ---------------------- ROUTES ----------------------

// TEXT-based Ask
router.post("/ask", async (req, res) => {
  const { studentId, question, to_target } = req.body
  if (!studentId || !question || !to_target) return res.status(400).json({ error: "Missing fields" })

  const { data, error } = await supabase
    .from("questions")
    .insert({ student_id: studentId, to_target, question, status: "sent" })
    .select("id")
    .single()

  if (error) return res.status(500).json({ error: error.message })

  if (to_target === "ai") {
    try {
      const parsed = await generateSolution(studentId, question, data.id)
      return res.json({ ok: true, id: data.id, answer: parsed })
    } catch (err: any) {
      console.error("[ASK] Failed:", err)
      return res.status(500).json({ error: "AI generation failed" })
    }
  }

  res.json({ ok: true, id: data.id })
})

// VOICE-based Ask
router.post("/ask-voice", upload.single("file"), async (req, res) => {
  const { studentId, to_target } = req.body
  let filePath = req.file?.path
  if (!studentId || !filePath) return res.status(400).json({ error: "Missing fields" })

  console.log("[ASK-VOICE] Received audio file:", filePath)

  // Ensure file has extension
  if (!path.extname(filePath)) {
    const newPath = filePath + ".mp3"
    fs.renameSync(filePath, newPath)
    filePath = newPath
  }

  try {
    // Transcribe with Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: "gpt-4o-mini-transcribe"
    })
    const question = transcription.text
    console.log("[ASK-VOICE] Transcribed text:", question)

    const { data, error } = await supabase
      .from("questions")
      .insert({ student_id: studentId, to_target, question, status: "sent" })
      .select("id")
      .single()
    if (error) return res.status(500).json({ error: error.message })

    const parsed = await generateSolution(studentId, question, data.id)

    fs.unlinkSync(filePath) // cleanup
    return res.json({ ok: true, id: data.id, answer: parsed })
  } catch (err: any) {
    console.error("[ASK-VOICE] Failed:", err)
    return res.status(500).json({ error: "Voice ask failed" })
  }
})

// EXPLAIN (TTS)
router.get("/explain/:id", async (req, res) => {
  const id = Number(req.params.id)
  const { data, error } = await supabase.from("questions").select("answer").eq("id", id).single()
  if (error || !data) return res.status(404).json({ error: "Not found" })

  const parsed = AnswerSchema.parse(JSON.parse(data.answer))

  let audioBase64 = null
  try {
    const speech = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "verse",
      input: parsed.explanation
    })
    const buffer = Buffer.from(await speech.arrayBuffer())
    audioBase64 = buffer.toString("base64")
  } catch (e: any) {
    console.error("[EXPLAIN] TTS failed:", e.message)
  }

  res.json({ explanation: parsed.explanation, audioBase64 })
})

export default router
