import type { Quiz } from "../types";

export function filenameSafe(s: string) {
  return (s || "")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_\-]/g, "");
}

export function baseNameFor(quizId: string, quizzes: Quiz[]) {
  const q = quizzes.find(q => q.id === quizId);
  if (!q) return `quiz_${quizId}`;
  const t = q.title ? filenameSafe(q.title) : `quiz_${quizId}`;
  const s = q.section ? filenameSafe(q.section) : "";
  return s ? `${t}_${s}` : t;
}
