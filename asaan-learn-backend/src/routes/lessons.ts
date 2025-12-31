import { Router } from "express"
import { createClient } from "@supabase/supabase-js"
import OpenAI from "openai"
import { z } from "zod"
import type { LessonScript } from "../types"

const router = Router()

function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env: ${name}`)
  return v
}

const SUPABASE_URL = required("SUPABASE_URL")
const SUPABASE_SERVICE_ROLE = required("SUPABASE_SERVICE_ROLE")
const OPENAI_API_KEY = required("OPENAI_API_KEY")
const PUBLIC_ASSET_BASE = required("PUBLIC_ASSET_BASE") // optional in case you still use it elsewhere
const STORAGE_BUCKET = process.env.STORAGE_BUCKET || "lessons"
const L3_VOICE = "verse" // your preferred voice

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE)
const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

/* ------------------------- Zod runtime validation ------------------------- */
/**
 * We accept nullable fields (because OpenAI structured outputs forces all fields to be present),
 * then refine and sanitize to apply defaults.
 */
const WhiteboardBase = z
  .object({
    type: z.enum(["WRITE_TEXT", "DRAW_FRACTION_BAR", "ERASE"]),
    x: z.number().nullable(),
    y: z.number().nullable(),
    text: z.string().nullable(),
    speed: z.enum(["word", "char"]).nullable(),
    delayMsPerUnit: z.number().nullable(),
    numerator: z.number().nullable(),
    denominator: z.number().nullable(),
    w: z.number().nullable(),
    h: z.number().nullable(),
  })
  .strict()

const WhiteboardDirectiveSchema = WhiteboardBase.superRefine((val, ctx) => {
  if (val.type === "WRITE_TEXT") {
    if (val.text == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "WRITE_TEXT.text is required" })
    }
    // x/y optional (we default later)
  }
  if (val.type === "DRAW_FRACTION_BAR") {
    if (val.numerator == null) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "DRAW_FRACTION_BAR.numerator is required" })
    if (val.denominator == null) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "DRAW_FRACTION_BAR.denominator is required" })
    // x/y optional (we default later)
  }
  if (val.type === "ERASE") {
    // Either full canvas (all null) OR bounded (x,y,w,h all present)
    const bounded = val.x != null && val.y != null && val.w != null && val.h != null
    const fullCanvas = val.x == null && val.y == null && val.w == null && val.h == null
    if (!bounded && !fullCanvas) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "ERASE requires x,y,w,h OR all nulls for full-canvas" })
    }
  }
})

const LessonChunkSchema = z.object({
  id: z.string(),
  title: z.string(),
  romanUrdu: z.string(),
  whiteboard: z.array(WhiteboardDirectiveSchema),
  ttsAudioUrl: z.string().optional(),
})

const PracticeItemSchema = z.object({
  q: z.string(),
  options: z.array(z.string()),
  answer: z.string(),
  solutionRomanUrdu: z.string(),
  whiteboard: z.array(WhiteboardDirectiveSchema).nullable().optional(),
})

const LessonScriptSchema = z.object({
  chapterTitle: z.string(),
  grade: z.number(),
  chunks: z.array(LessonChunkSchema),
  // default to [] if model omits it
  practice20: z.array(PracticeItemSchema).default([]),
})

/* -------------------- OpenAI strict JSON schema (nullable-all-fields) -------------------- */
/**
 * OpenAI structured outputs mode requires:
 *  - No oneOf/anyOf/allOf
 *  - `required` array must include *every* key in `properties`
 * To handle directive variants, we:
 *  - Put *all* fields in `required`
 *  - Allow null for fields that don't apply (type: ["number","null"] / ["string","null"])
 */
const WHITEBOARD_ITEM_PROPERTIES = {
  type: { type: "string", enum: ["WRITE_TEXT", "DRAW_FRACTION_BAR", "ERASE"] },
  x: { type: ["number", "null"] },
  y: { type: ["number", "null"] },
  text: { type: ["string", "null"] },
  // when using enum + null, include null as a value:
  speed: { type: ["string", "null"], enum: ["word", "char", null] as any },
  delayMsPerUnit: { type: ["number", "null"] },
  numerator: { type: ["number", "null"] },
  denominator: { type: ["number", "null"] },
  w: { type: ["number", "null"] },
  h: { type: ["number", "null"] },
} as const

const WHITEBOARD_ITEM_REQUIRED = [
  "type",
  "x",
  "y",
  "text",
  "speed",
  "delayMsPerUnit",
  "numerator",
  "denominator",
  "w",
  "h",
] as const

const lessonSchemaJson = {
  type: "object",
  additionalProperties: false,
  properties: {
    chapterTitle: { type: "string" },
    grade: { type: "number" },
    chunks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          romanUrdu: { type: "string" },
          whiteboard: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: WHITEBOARD_ITEM_PROPERTIES,
              required: WHITEBOARD_ITEM_REQUIRED as unknown as string[],
            },
          },
        },
        required: ["id", "title", "romanUrdu", "whiteboard"],
      },
    },
    practice20: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          q: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          answer: { type: "string" },
          solutionRomanUrdu: { type: "string" },
          // required but nullable (always present for the validator)
          whiteboard: {
            type: ["array", "null"],
            items: {
              type: "object",
              additionalProperties: false,
              properties: WHITEBOARD_ITEM_PROPERTIES,
              required: WHITEBOARD_ITEM_REQUIRED as unknown as string[],
            },
          },
        },
        required: ["q", "options", "answer", "solutionRomanUrdu", "whiteboard"],
      },
    },
  },
  required: ["chapterTitle", "grade", "chunks", "practice20"],
} as const

/* ------------------------- Helpers: enrichment utilities ------------------------- */
function wordCount(s: string) {
  return (s || "").trim().split(/\s+/).filter(Boolean).length
}

function splitSentencesToLines(narr: string, maxWordsPerLine = 14) {
  const tokens = (narr || "").replace(/\s+/g, " ").trim().split(" ")
  const lines: string[] = []
  let acc: string[] = []
  for (const t of tokens) {
    acc.push(t)
    if (acc.length >= maxWordsPerLine || /[.!?)]$/.test(t)) {
      lines.push(acc.join(" "))
      acc = []
    }
  }
  if (acc.length) lines.push(acc.join(" "))
  return lines
}

/** Try to derive a tiny example/equation line from narration (naive) */
function deriveExampleLine(narr: string): string | null {
  const m = narr.match(/(\d+)\s*\/\s*(\d+)/)
  if (m) {
    const a = Number(m[1]), b = Number(m[2])
    if (b) return `Example: ${a}/${b} — matlab ${a} parts out of ${b}.`
  }
  return `Example: 3/4 + 1/4 = 1 (four quarters make a whole).`
}

type WB = { type: "WRITE_TEXT" | "DRAW_FRACTION_BAR" | "ERASE"; [k: string]: any }

/** Ensure each chunk has a title + 2–4 explanatory lines + an example line; add a fraction bar if relevant */
function ensureRichWhiteboardForChunk(chunk: any) {
  const wbs: WB[] = Array.isArray(chunk.whiteboard) ? chunk.whiteboard : []
  const writeTexts = wbs.filter(w => w.type === "WRITE_TEXT" && typeof w.text === "string")

  const hasOnlyShortTitle =
    writeTexts.length <= 1 && (writeTexts[0]?.text?.length ?? 0) <= 45

  if (hasOnlyShortTitle || writeTexts.length < 3) {
    const baseX = null // let sanitize assign x/y & vertical spacing
    const baseY = null

    const fresh: WB[] = []
    // Title first
    fresh.push({ type: "WRITE_TEXT", text: chunk.title, x: baseX, y: baseY, speed: "word", delayMsPerUnit: DEFAULTS.delayMsPerUnit })

    // 3–4 wrapped lines from narration
    const lines = splitSentencesToLines(chunk.romanUrdu, 14).slice(0, 4)
    lines.forEach(() =>
      fresh.push({ type: "WRITE_TEXT", text: "", x: baseX, y: baseY, speed: "word", delayMsPerUnit: DEFAULTS.delayMsPerUnit })
    )
    // fill texts now (we'll space them in sanitize)
    for (let i = 0; i < lines.length; i++) fresh[i + 1].text = lines[i]

    // Example line
    const example = deriveExampleLine(chunk.romanUrdu)
    fresh.push({ type: "WRITE_TEXT", text: example, x: baseX, y: baseY, speed: "word", delayMsPerUnit: DEFAULTS.delayMsPerUnit })

    // Add a fraction bar if narration references fractions
    const frac = chunk.romanUrdu.match(/(\d+)\s*\/\s*(\d+)/)
    if (/\bnumerator\b|\bdenominator\b|\/\d+/.test(chunk.romanUrdu) && frac) {
      const num = Number(frac[1]), den = Math.max(1, Number(frac[2]))
      fresh.push({ type: "DRAW_FRACTION_BAR", numerator: num, denominator: den, x: baseX, y: baseY })
    }

    chunk.whiteboard = fresh
  }
}

/** Expand short narration (<= 80 words) to ~100–140 words in bilingual, simple Roman Urdu + English. */
async function maybeExpandNarration(original: string, title: string): Promise<string> {
  if (wordCount(original) >= 90) return original

  const sys = "You are a kind math teacher. Write in simple Roman Urdu mixed with basic English. Keep it friendly and clear."
  const user = `
Topic: ${title}

Rewrite/expand the explanation to about 100–140 words.
- Use easy Roman Urdu with basic English terms (bilingual).
- Explain concept -> give 1 small example -> add 1 tip.
- Use ASCII for fractions/equations (e.g., 3/4 + 1/4 = 1).
- Avoid markdown and bullet points. Just plain text.

Original (short):
${original}
`.trim()

  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.6,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
  })
  const text = resp.choices[0]?.message?.content?.trim()
  if (!text) return original
  return text
}

/* ------------------------------- Sanitization ------------------------------- */
/** Auto-layout defaults; also space WRITE_TEXT lines inside each chunk. */
const DEFAULTS = { x: 40, y: 60, row: 48, speed: "word" as const, delayMsPerUnit: 350 }

function sanitizeScript(script: LessonScript): LessonScript {
  const BASE_X = DEFAULTS.x
  const BASE_Y = DEFAULTS.y
  const ROW = DEFAULTS.row

  return {
    ...script,
    chunks: script.chunks.map((c, idx) => {
      const chunkY = BASE_Y + idx * ROW // base row per chunk
      let writeIndex = 0

      const whiteboard = c.whiteboard.map((d: any) => {
        const dd: any = { ...d }

        if (dd.type === "WRITE_TEXT") {
          if (dd.x == null) dd.x = BASE_X
          if (dd.y == null) { dd.y = chunkY + writeIndex * 40; writeIndex++ }
          dd.text = dd.text ?? ""
          dd.speed = dd.speed ?? DEFAULTS.speed
          dd.delayMsPerUnit = dd.delayMsPerUnit ?? DEFAULTS.delayMsPerUnit
        } else if (dd.type === "DRAW_FRACTION_BAR") {
          if (dd.x == null) dd.x = BASE_X
          if (dd.y == null) dd.y = chunkY + writeIndex * 40 + 8 // near next line
          dd.numerator = dd.numerator ?? 1
          dd.denominator = dd.denominator ?? 2
        } else if (dd.type === "ERASE") {
          // keep as-is: either full-canvas (all nulls) or explicit x,y,w,h
        }
        return dd
      })

      return { ...c, whiteboard }
    }),
    practice20: script.practice20.map((p) => {
      const practiceBaseY = BASE_Y + script.chunks.length * ROW + 24
      const whiteboard =
        p.whiteboard &&
        p.whiteboard.map((d: any, i: number) => {
          const dd: any = { ...d }
          if (dd.type === "WRITE_TEXT") {
            dd.x = dd.x ?? BASE_X
            dd.y = dd.y ?? (practiceBaseY + i * 40)
            dd.text = dd.text ?? ""
            dd.speed = dd.speed ?? DEFAULTS.speed
            dd.delayMsPerUnit = dd.delayMsPerUnit ?? DEFAULTS.delayMsPerUnit
          } else if (dd.type === "DRAW_FRACTION_BAR") {
            dd.x = dd.x ?? BASE_X
            dd.y = dd.y ?? (practiceBaseY + i * 40 + 8)
            dd.numerator = dd.numerator ?? 1
            dd.denominator = dd.denominator ?? 2
          }
          return dd
        })

      return { ...p, whiteboard: whiteboard ?? undefined }
    }),
  }
}

/* ------------------------------- Enrichment pipeline ------------------------------- */
async function enrichScript(script: LessonScript): Promise<LessonScript> {
  // 1) Expand short narrations
  const expandedChunks = []
  for (const ch of script.chunks) {
    const expandedText = await maybeExpandNarration(ch.romanUrdu, ch.title)
    expandedChunks.push({ ...ch, romanUrdu: expandedText })
  }
  let tmp: LessonScript = { ...script, chunks: expandedChunks }

  // 2) Ensure each chunk has rich whiteboard (title + multiple lines + example + optional bar)
  for (const ch of tmp.chunks) {
    try {
      ensureRichWhiteboardForChunk(ch)
    } catch (e) {
      // keep original whiteboard if something goes wrong
      console.warn("enrich whiteboard failed for", ch.id, e)
    }
  }

  return tmp
}

/* ---------------------------------- Routes --------------------------------- */

/**
 * POST /lessons/start
 * Body: { studentId: string, chapterId: number }
 */
/**
 * POST /lessons/start
 * Body: { studentId: string, chapterId: number, subtopicId?: number }
 */
router.post("/start", async (req, res) => {
  try {
    const { studentId, chapterId, subtopicId } = req.body as {
      studentId?: string
      chapterId?: number
      subtopicId?: number
    }
    if (!studentId || !chapterId) {
      return res.status(400).json({ error: "studentId and chapterId are required" })
    }

    /* ✅ Step 0: If a lesson already exists for this subtopic, reuse it (do not generate again) */
    if (subtopicId) {
      const { data: existingList, error: findErr } = await supabase
        .from("lessons")
        .select("id")
        .eq("subtopic_id", subtopicId)
        .order("id", { ascending: true })
        .limit(1)

      const existing = existingList?.[0]
      if (existing && !findErr) {
        return res.json({ lessonId: existing.id, wsUrl: `/ws/lessons/${existing.id}`, reused: true })
      }
    }

    // 1) Fetch chapter meta
    const { data: chapter, error: chapErr } = await supabase
      .from("chapters")
      .select("title, grade")
      .eq("id", chapterId)
      .single()
    if (chapErr || !chapter) return res.status(404).json({ error: "Chapter not found" })

    // 2) Optionally fetch subtopic
    let subtopic: any = null
    if (subtopicId) {
      const { data: s } = await supabase
        .from("subtopics")
        .select("id, title")
        .eq("id", subtopicId)
        .single()
      if (s) subtopic = s
    }

    const topicTitle = subtopic ? subtopic.title : chapter.title

    // 3) Ask the model for STRICT JSON lesson
    const prompt = `
Aap Grade ${chapter.grade} ke maths teacher hain. Topic: "${topicTitle}".

Goals:
- Har CHUNK me 90–140 words ki narration honi chahiye, bilingual: easy Roman Urdu + basic English.
- Style: short, clear sentences; explain → small example → tiny tip.
- Equations ASCII me likhein (e.g. "3/4 + 1/4 = 1").
- Whiteboard directives sirf headings na den — multiple lines likhein (title + 2–4 explanation lines + example line).
- Jahan munasib ho, DRAW_FRACTION_BAR bhi den.

Output Rules:
- 50–70 chunks.
- Har chunk: { id, title, romanUrdu, whiteboard[] }.
- Aakhir me 40–60 MCQs (practice20) with solutionRomanUrdu.
IMPORTANT:
- Sirf JSON as per schema.
- Jo whiteboard field apply na karein unhain null chhor dein.
- Practice items me agar whiteboard directives na hon to "whiteboard": null.
`.trim()

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.5,
      response_format: {
        type: "json_schema",
        json_schema: { name: "lesson_script", schema: lessonSchemaJson, strict: true },
      },
      messages: [
        { role: "system", content: "Aap aik zabardast maths teacher hain. Sirf valid JSON return karein." },
        { role: "user", content: prompt },
      ],
    })

    const content = completion.choices[0]?.message?.content ?? "{}"
    let raw: any
    try { raw = JSON.parse(content) } catch {
      return res.status(500).json({ error: "Model did not return JSON" })
    }

    if (!Array.isArray(raw.chunks)) raw.chunks = []
    if (!Array.isArray(raw.practice20)) raw.practice20 = []

    let scriptRaw: LessonScript
    try { scriptRaw = LessonScriptSchema.parse(raw) } catch {
      return res.status(500).json({ error: "LLM JSON invalid" })
    }

    const enriched = await enrichScript(scriptRaw)
    const script = sanitizeScript(enriched)

    // 4) Insert lesson (✅ saved with subtopic name as title)
    const { data: inserted, error: insErr } = await supabase
      .from("lessons")
      .insert({
        student_id: studentId,
        chapter_id: chapterId,
        subtopic_id: subtopicId ?? null, // ✅ keep linking to subtopic
        title: topicTitle,               // ✅ save with subtopic name
        status: "live",
        script,
      })
      .select("id")
      .single()
    if (insErr || !inserted) return res.status(500).json({ error: insErr?.message || "Failed to create lesson" })
    const lessonId = inserted.id as number

    // 5) TTS
    for (const chunk of script.chunks) {
      try {
        const speech = await openai.audio.speech.create({
          model: "gpt-4o-mini-tts",
          voice: L3_VOICE,
          input: chunk.romanUrdu,
        })
        const buffer = Buffer.from(await speech.arrayBuffer())
        if (buffer.length < 200) continue
        const path = `lessons/${lessonId}/audio/${chunk.id}.mp3`
        await supabase.storage.from(STORAGE_BUCKET).upload(path, buffer, { contentType: "audio/mpeg", upsert: true })
        const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path)
        chunk.ttsAudioUrl = data.publicUrl
      } catch {}
    }

    // 6) Update script with audio URLs
    await supabase.from("lessons").update({ script }).eq("id", lessonId)

    // 7) Respond
    res.json({ lessonId, wsUrl: `/ws/lessons/${lessonId}` })
  } catch (e: any) {
    console.error("start lesson failed", e)
    res.status(500).json({ error: e?.message || "Internal error" })
  }
})


    // 6) Update script with audio URLs


/** Quick debug route to view stored script */
router.get("/:id/script", async (req, res) => {
  const id = Number(req.params.id)
  const { data, error } = await supabase
    .from("lessons")
    .select("script")
    .eq("id", id)
    .single()
  if (error || !data) return res.status(404).json({ error: "Not found" })
  res.json(data.script)
})

export default router
