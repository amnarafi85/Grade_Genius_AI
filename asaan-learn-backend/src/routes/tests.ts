import { Router } from "express"
import { createClient } from "@supabase/supabase-js"
import OpenAI from "openai"

const router = Router()

function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env: ${name}`)
  return v
}

const SUPABASE_URL = required("SUPABASE_URL")
const SUPABASE_SERVICE_ROLE = required("SUPABASE_SERVICE_ROLE")
const OPENAI_API_KEY = required("OPENAI_API_KEY")

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE)
const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

// Strict JSON schema for 10 MCQs
const mcqSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      minItems: 10,
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          q: { type: "string" },
          options: { type: "array", minItems: 4, maxItems: 4, items: { type: "string" } },
          answerIndex: { type: "number" }, // 0..3
          solutionRomanUrdu: { type: "string" },
        },
        required: ["id", "q", "options", "answerIndex", "solutionRomanUrdu"],
      },
    },
    durationMinutes: { type: "number" },
  },
  required: ["items", "durationMinutes"],
} as const

/**
 * POST /tests/start
 * Body: { studentId: string, lessonId: number, subtopicId?: number }
 */
router.post("/start", async (req, res) => {
  try {
    const { studentId, lessonId, subtopicId } = req.body as {
      studentId?: string
      lessonId?: number
      subtopicId?: number
    }
    if (!studentId || !lessonId) {
      return res.status(400).json({ error: "studentId and lessonId are required" })
    }

    // Get lesson
    const { data: lesson, error: lerr } = await supabase
      .from("lessons")
      .select("chapter_id, script")
      .eq("id", lessonId)
      .single()
    if (lerr || !lesson) return res.status(404).json({ error: "Lesson not found" })

    const script = lesson.script as any
    const topic = script?.chapterTitle ?? "Maths"
    const grade = script?.grade ?? 6

    // If subtopic present, fetch subtopic title
    let topicTitle = topic
    if (subtopicId) {
      const { data: sub } = await supabase
        .from("subtopics")
        .select("title")
        .eq("id", subtopicId)
        .single()
      if (sub?.title) topicTitle = sub.title
    }

    const prompt = `
Generate 10 MCQs from the completed lesson.
- Grade: ${grade}, Topic: "${topicTitle}"
- Bilingual style: simple English + easy Roman Urdu mixed (not pure Urdu).
- 4 options; exactly one correct.
- Add "solutionRomanUrdu" (1–3 lines) to explain the answer.
- Balance: recall + understanding + at least 2 calculation items.
- Paraphrase; do not copy exact lesson text.
Return ONLY valid JSON per schema. Set "durationMinutes": 30.
`.trim()

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      response_format: {
        type: "json_schema",
        json_schema: { name: "mcq_test", schema: mcqSchema, strict: true },
      },
      messages: [
        { role: "system", content: "You are a careful examiner. Output valid JSON only." },
        { role: "user", content: prompt },
      ],
    })

    const content = completion.choices[0]?.message?.content ?? "{}"
    const testJson = JSON.parse(content)

    // Persist the test
    const { data: ins, error: ierr } = await supabase
      .from("tests")
      .insert({
        student_id: studentId,
        lesson_id: lessonId,
        chapter_id: lesson.chapter_id,
        subtopic_id: subtopicId ?? null,
        status: "active",
        test_json: testJson,
      })
      .select("id, started_at")
      .single()
    if (ierr || !ins)
      return res.status(500).json({ error: ierr?.message || "Failed to create test" })

    const duration = Number(testJson.durationMinutes) || 30
    const startedAt = new Date(ins.started_at || Date.now())
    const expiresAt = new Date(startedAt.getTime() + duration * 60 * 1000)

    const publicItems = (testJson.items || []).map((it: any) => ({
      id: it.id,
      q: it.q,
      options: it.options,
    }))

    res.json({ testId: ins.id, durationMinutes: duration, items: publicItems, expiresAt })
  } catch (e: any) {
    console.error("start test failed:", e)
    res.status(500).json({ error: e?.message || "Internal error" })
  }
})

/**
 * POST /tests/submit
 * Body: { testId: number, answers: Array<{id: string, answerIndex: number}> }
 */
router.post("/submit", async (req, res) => {
  try {
    const { testId, answers } = req.body as {
      testId?: number
      answers?: Array<{ id: string; answerIndex: number }>
    }
    if (!testId || !Array.isArray(answers)) {
      return res.status(400).json({ error: "testId & answers required" })
    }

    const { data: test, error } = await supabase
      .from("tests")
      .select("id, student_id, chapter_id, subtopic_id, lesson_id, test_json")
      .eq("id", testId)
      .single()
    if (error || !test) return res.status(404).json({ error: "Test not found" })

    // Build answer key
    const keyById = new Map<string, number>()
    const explainById = new Map<string, string>()
    for (const it of test.test_json?.items || []) {
      keyById.set(String(it.id), Number(it.answerIndex))
      explainById.set(String(it.id), String(it.solutionRomanUrdu || ""))
    }

    let correct = 0
    const details = answers.map((a) => {
      const correctIndex = keyById.get(String(a.id))
      const ok = correctIndex === a.answerIndex
      if (ok) correct++
      return {
        id: a.id,
        correctIndex,
        yourIndex: a.answerIndex,
        correct: ok,
        solutionRomanUrdu: explainById.get(String(a.id)) || "",
      }
    })

    const scorePct = Math.round((correct / Math.max(1, details.length)) * 100)
    const pass = scorePct >= 70

    await supabase
      .from("tests")
      .update({
        status: "graded",
        submitted_at: new Date().toISOString(),
        score_pct: scorePct,
      })
      .eq("id", testId)

    const studentId = String(test.student_id)
    const chapterId = Number(test.chapter_id)
    const subtopicId = test.subtopic_id ? Number(test.subtopic_id) : null

    // === Update progress ===
    if (subtopicId) {
      // Per-subtopic progress (this is what Learn.tsx reads)
      const { data: spRow } = await supabase
        .from("student_subtopic_progress")
        .select("attempts, best_score, completed, score")
        .eq("student_id", studentId)
        .eq("subtopic_id", subtopicId)
        .maybeSingle()

      const attempts = (spRow?.attempts ?? 0) + 1
      const best_score = Math.max(Number(spRow?.best_score ?? 0), scorePct)
      const completed = pass ? true : (spRow?.completed ?? false)

      await supabase.from("student_subtopic_progress").upsert(
        {
          student_id: studentId,
          subtopic_id: subtopicId,
          attempts,
          score: scorePct,
          best_score,
          completed,
          unlocked: true,
        },
        { onConflict: "student_id,subtopic_id" }
      )

      // Optionally unlock next subtopic automatically
      let unlockNext: string | null = null
      if (pass) {
        const { data: currentSub } = await supabase
          .from("subtopics")
          .select("subtopic_number, chapter_id")
          .eq("id", subtopicId)
          .single()

        if (currentSub) {
          const { data: next } = await supabase
            .from("subtopics")
            .select("id, title")
            .eq("chapter_id", currentSub.chapter_id)
            .gt("subtopic_number", currentSub.subtopic_number)
            .order("subtopic_number")
            .limit(1)

          if (next && next[0]) {
            await supabase.from("student_subtopic_progress").upsert(
              { student_id: studentId, subtopic_id: next[0].id, unlocked: true },
              { onConflict: "student_id,subtopic_id" }
            )
            unlockNext = next[0].title
          }
        }
      }

      return res.json({ scorePct, pass, details, unlockNext })
    } else {
      // Fallback: per-chapter
      const { data: spRow } = await supabase
        .from("student_progress")
        .select("attempts, best_score, completed, score")
        .eq("student_id", studentId)
        .eq("chapter_id", chapterId)
        .maybeSingle()

      const attempts = (spRow?.attempts ?? 0) + 1
      const best_score = Math.max(Number(spRow?.best_score ?? 0), scorePct)
      const completed = pass ? true : (spRow?.completed ?? false)

      await supabase.from("student_progress").upsert(
        {
          student_id: studentId,
          chapter_id: chapterId,
          attempts,
          score: scorePct,
          best_score,
          completed,
          unlocked: true,
        },
        { onConflict: "student_id,chapter_id" }
      )

      let unlockNext: string | null = null
      if (pass) {
        const nextChapterId = chapterId + 1
        const { data: chap } = await supabase
          .from("chapters")
          .select("id, title")
          .eq("id", nextChapterId)
          .maybeSingle()
        if (chap) {
          await supabase.from("student_progress").upsert(
            { student_id: studentId, chapter_id: chap.id, unlocked: true },
            { onConflict: "student_id,chapter_id" }
          )
          unlockNext = chap.title
        }
      }

      return res.json({ scorePct, pass, details, unlockNext })
    }
  } catch (e: any) {
    console.error("submit test failed:", e)
    res.status(500).json({ error: e?.message || "Internal error" })
  }
})

export default router
