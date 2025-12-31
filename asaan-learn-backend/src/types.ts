export type WhiteboardDirective =
  | { type: "WRITE_TEXT"; text: string; x: number; y: number; speed?: "word" | "char"; delayMsPerUnit?: number }
  | { type: "DRAW_FRACTION_BAR"; numerator: number; denominator: number; x: number; y: number }
  | { type: "ERASE"; x?: number; y?: number; w?: number; h?: number }

export interface LessonChunk {
  id: string
  title: string
  /** Roman Urdu narration text (goes to TTS) */
  romanUrdu: string
  /** Whiteboard instructions for this chunk */
  whiteboard: WhiteboardDirective[]
  /** Single L3 voice audio only */
  ttsAudioUrl?: string
}

export interface PracticeItem {
  q: string
  options: string[]
  answer: string
  solutionRomanUrdu: string
  whiteboard?: WhiteboardDirective[]
}

export interface LessonScript {
  chapterTitle: string
  grade: number
  chunks: LessonChunk[]
  practice20: PracticeItem[]
}
