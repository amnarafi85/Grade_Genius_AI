import express from "express"

const router = express.Router()

router.post("/", async (req, res) => {
  try {
    const { topic, numSlides = 3 } = req.body
    if (!topic) return res.status(400).json({ error: "Missing topic" })

    // 1. GPT-4o → Generate story slides in JSON
    const storyPrompt = `
You are a creative math teacher for grades 6–8. 
Your task is to explain the topic: "${topic}" in Roman Urdu as a **short story**. 
The story should be broken into exactly ${numSlides} slides, where each slide contains:
1. "text" → Roman Urdu explanation (1–2 sentences, fun, clear, kid-friendly).
2. "prompt" → a descriptive image prompt for an illustration that matches the text.
   - Make the image prompt very specific and detailed, describing the scene, characters, and objects.
   - Style must be cartoonish, vibrant, educational, and kid-friendly.
   - Do not include any text or numbers in the image.

Rules:
- Return the output in **valid JSON format only**, with the following structure:

{
  "slides": [
    { "text": "Roman Urdu...", "prompt": "Image description..." },
    { "text": "Roman Urdu...", "prompt": "Image description..." }
  ]
}

- Ensure that each explanation step aligns with its image prompt.
- The story should flow logically from beginning to end, like a mini lesson.
- Keep Roman Urdu text fun and natural, using everyday kid-friendly examples.
- Make sure the image prompt contains enough detail so that the generated picture clearly matches the explanation.
`

    const storyResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are a JSON generator." },
          { role: "user", content: storyPrompt }
        ],
        response_format: { type: "json_object" }
      })
    })

    const storyData = await storyResp.json()
    const slides = storyData?.choices?.[0]?.message?.content
      ? JSON.parse(storyData.choices[0].message.content).slides
      : []

    if (!slides || !Array.isArray(slides)) {
      return res.status(500).json({ error: "Failed to create story slides" })
    }

    // 2. Generate image for each slide
    const slideResults: { text: string; imageUrl: string }[] = []
    for (const slide of slides) {
      try {
        const imgResp = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: "gpt-image-1",
            prompt: slide.prompt,
            size: "1024x1024",
          })
        })

        const imgData = await imgResp.json()
        let imageUrl = "https://placehold.co/600x400?text=Image+Not+Generated"
        if (imgData?.data?.[0]?.b64_json) {
          imageUrl = `data:image/png;base64,${imgData.data[0].b64_json}`
        }

        slideResults.push({ text: slide.text, imageUrl })
      } catch (err: any) {
        console.error("⚠️ Image generation failed:", err.message)
        slideResults.push({
          text: slide.text,
          imageUrl: "https://placehold.co/600x400?text=Image+Error"
        })
      }
    }

    // 3. Generate audio narration (all slides combined)
    let audioUrl: string | null = null
    try {
      const narrationText = slideResults.map((s, i) => `Step ${i + 1}: ${s.text}`).join("\n")
      const ttsResp = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini-tts",
          voice: "alloy",
          input: narrationText,
        }),
      })

      const audioBuffer = Buffer.from(await ttsResp.arrayBuffer())
      audioUrl = `data:audio/mp3;base64,${audioBuffer.toString("base64")}`
    } catch (ttsErr: any) {
      console.error("⚠️ Audio generation failed:", ttsErr.message)
    }

    // 4. Return structured story
    res.json({
      topic,
      slides: slideResults,
      audioUrl
    })
  } catch (err: any) {
    console.error("❌ Story visualization error:", err.message)
    res.status(500).json({ error: "Failed to generate story visualization" })
  }
})

export default router
