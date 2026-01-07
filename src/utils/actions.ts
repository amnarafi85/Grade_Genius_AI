import { supabase } from "../lib/supabaseClient";
import type { Quiz, RubricItem, Leniency } from "../types";
import { baseNameFor } from "./names";

// ✅ NEW: auth header helper (JWT Bearer token)
async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ===== fetch =====
export async function fetchQuizzesByTeacher(
  teacherId: string,
  setQuizzes: (q: Quiz[]) => void,
  setLoading: (b: boolean) => void
) {
  setLoading(true);
  const { data, error } = await supabase
    .from("quizzes")
    .select("*")
    .eq("teacher_id", teacherId)
    .order("created_at", { ascending: false });
  if (!error) setQuizzes((data || []) as Quiz[]);
  setLoading(false);
}

// ===== OCR =====
export async function processQuiz(
  quizId: string,
  engine: "auto" | "vision-pdf" | "images" | "tesseract" | "openai-ocr" | "gemini-ocr",
  setRunning: (s: "none" | "ocr" | "ocr+grade") => void,
  setOcrText: (t: string) => void,
  refetch: () => Promise<void>
) {
  setRunning("ocr");
  try {
    setOcrText("⏳ Running OCR…");

    const r = await fetch(`https://grade-genius-ai-backend.onrender.com/process-quiz/${quizId}?engine=${engine}`, {
      method: "POST",
      headers: {
        ...(await authHeaders()),
      },
      credentials: "include",
    });

    const j = await r.json();
    if (j.success) { setOcrText("✅ OCR completed"); await refetch(); }
    else setOcrText(`❌ OCR failed: ${j.error}`);
  } catch (e: any) {
    setOcrText(`❌ OCR failed: ${e.message}`);
  } finally {
    setRunning("none");
  }
}

// ===== Grade =====
export async function analyzeQuiz(
  quizId: string,
  options: {
    gradingMode: "very_easy" | "easy" | "balanced" | "strict" | "hard" | "blind";
    gradingProvider: "openai" | "gemini";
    customPrompt: string;
    rubricPayload: RubricItem[];
    leniency: Leniency;
    useSolutionKey: boolean;
  },
  setGradingResult: (t: string | null) => void,
  setPackLinks: (v: Record<string, string> | null) => void,
  refetch: () => Promise<void>
) {
  try {
    setGradingResult("🧠 Grading in progress…");
    setPackLinks(null);

    const r = await fetch(`https://grade-genius-ai-backend.onrender.com/analyze-quiz/${quizId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(await authHeaders()),
      },
      credentials: "include",
      body: JSON.stringify({
        gradingMode: options.gradingMode,
        gradingPrompt: options.customPrompt,
        provider: options.gradingProvider,
        rubric: options.rubricPayload.length ? options.rubricPayload : undefined,
        leniency: options.leniency,
        useSolutionKey: options.useSolutionKey
      }),
    });

    // Read the body even on errors so 500s show a message
    let raw = "";
    try { raw = await r.text(); } catch {}
    let j: any = {};
    try { j = raw ? JSON.parse(raw) : {}; } catch {}

    if (r.status === 409) {
      setGradingResult(`⚠️ ${j.error || "No extracted text found. Run OCR (process-quiz) first."}`);
      await refetch();
      return;
    }

    if (!r.ok) {
      setGradingResult(`❌ Server ${r.status}: ${j.error || raw || "Unknown error"}`);
      await refetch();
      return;
    }

    if (j.success) { setGradingResult(j.graded); await refetch(); }
    else setGradingResult(`❌ Grading failed: ${j.error || "Unknown error"}`);
  } catch (e: any) {
    setGradingResult(`❌ Error: ${e.message}`);
  }
}

export async function processAndGrade(
  quizId: string,
  params: {
    engine: "auto" | "vision-pdf" | "images" | "tesseract" | "openai-ocr" | "gemini-ocr";
    gradingMode: "very_easy" | "easy" | "balanced" | "strict" | "hard" | "blind";
    gradingProvider: "openai" | "gemini";
    customPrompt: string;
    rubricPayload: RubricItem[];
    leniency: Leniency;
    useSolutionKey: boolean;
  },
  setRunning: (s: "none" | "ocr" | "ocr+grade") => void,
  setGradingResult: (t: string | null) => void,
  setPackLinks: (v: Record<string, string> | null) => void,
  refetch: () => Promise<void>,
  setOcrText: (t: string) => void
) {
  setRunning("ocr+grade");
  setGradingResult(null);
  setPackLinks(null);
  await processQuiz(quizId, params.engine, setRunning, setOcrText, refetch);
  await analyzeQuiz(
    quizId,
    {
      gradingMode: params.gradingMode,
      gradingProvider: params.gradingProvider,
      customPrompt: params.customPrompt,
      rubricPayload: params.rubricPayload,
      leniency: params.leniency,
      useSolutionKey: params.useSolutionKey,
    },
    setGradingResult,
    setPackLinks,
    refetch
  );
  setRunning("none");
}

// ===== CSV / Pack =====
export async function exportCsv(
  quizId: string,
  quizzes: Quiz[],
  refetch: () => Promise<void>
) {
  const r = await fetch(`https://grade-genius-ai-backend.onrender.com/export-csv/${quizId}`, {
    method: "POST",
    headers: {
      ...(await authHeaders()),
    },
    credentials: "include",
  });

  const j = await r.json();
  if (j.success) {
    await refetch();
    const urlFromServer: string | undefined = j.public_url || j.url || j.csv_url || j.results_url;
    const fileName = `${baseNameFor(quizId, quizzes)}_results.csv`;

    if (urlFromServer) {
      try {
        const csvRes = await fetch(urlFromServer, { credentials: "include" });
        if (!csvRes.ok) {
          window.open(urlFromServer, "_blank");
          return;
        }
        const blob = await csvRes.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        return;
      } catch {
        window.open(urlFromServer, "_blank");
        return;
      }
    }

    alert("CSV generated.");
  } else {
    alert(`Failed: ${j.error}`);
  }
}

export async function buildPack(
  quizId: string,
  setPackLinks: (v: Record<string, string> | null) => void,
  downloadGreenResults: (quizId: string) => Promise<void>
) {
  const r = await fetch(`https://grade-genius-ai-backend.onrender.com/build-graded-pack/${quizId}`, {
    method: "POST",
    headers: {
      ...(await authHeaders()),
    },
    credentials: "include",
  });

  const j = await r.json();
  if (j.success) {
    setPackLinks(j);
    await downloadGreenResults(quizId);
  } else {
    alert(`Failed: ${j.error}`);
  }
}

// ===== Green results =====
export async function downloadGreenResults(
  quizId: string,
  quizzes: Quiz[]
) {
  try {
    const r = await fetch(`https://grade-genius-ai-backend.onrender.com/build-green-graded/${quizId}`, {
      method: "POST",
      headers: {
        ...(await authHeaders()),
      },
      credentials: "include",
    });

    const j = await r.json();
    if (!j.success || !j.url) {
      alert(`Failed to build green PDF: ${j.error || "Unknown error"}`);
      return;
    }

    const pdfRes = await fetch(j.url); // ✅ no credentials for public storage URL
    const fileName = `${baseNameFor(quizId, quizzes)}_green_results.pdf`;

    if (!pdfRes.ok) { window.open(j.url, "_blank"); return; }
    const blob = await pdfRes.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e: any) {
    alert(`Download failed: ${e.message}`);
  }
}

// ===== SBAW =====
export async function downloadSBAW(
  quizId: string,
  quizzes: Quiz[]
) {
  try {
    const desiredName = `${baseNameFor(quizId, quizzes)}_SBAW.pdf`;

    let r = await fetch(`https://grade-genius-ai-backend.onrender.com/build-sbab/${quizId}`, {
      method: "POST",
      headers: {
        ...(await authHeaders()),
      },
      credentials: "include",
    });

    let contentType = r.headers.get("content-type") || "";
    let j: any = null;

    if (r.ok && contentType.includes("application/json")) j = await r.json();
    else {
      const txt = await r.text();
      console.warn("[SBAB] Non-JSON or error page:", r.status, txt.slice(0, 120));
    }

    // ✅ If SBAB returned a single PDF URL
    if (j?.success && (j?.sbab_pdf || j?.url)) {
      const fileUrl = j.sbab_pdf || j.url;

      const pdfRes = await fetch(fileUrl, { credentials: "omit" }); // ✅ important
      if (!pdfRes.ok) {
        throw new Error(`Failed to fetch PDF (${pdfRes.status})`);
      }

      const blob = await pdfRes.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = desiredName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return;
    }

    // fallback to /build-sbaw
    r = await fetch(`https://grade-genius-ai-backend.onrender.com/build-sbaw/${quizId}`, {
      method: "POST",
      headers: {
        ...(await authHeaders()),
      },
      credentials: "include",
    });

    contentType = r.headers.get("content-type") || "";
    j = null;

    if (contentType.includes("application/json")) j = await r.json();
    else {
      const txt = await r.text();
      const possibleUrl = txt.trim();
      if (/^https?:\/\//i.test(possibleUrl)) {
        // ✅ If server returned raw URL text, fetch it without credentials
        const pdfRes = await fetch(possibleUrl, { credentials: "omit" });
        if (!pdfRes.ok) throw new Error(`Failed to fetch PDF (${pdfRes.status})`);
        const blob = await pdfRes.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = desiredName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        return;
      }
      throw new Error(`Server returned non-JSON (${r.status}). Body starts with: ${txt.slice(0, 80)}`);
    }

    if (!j?.success) { alert(`Failed to build SBAW: ${j?.error || "Unknown error"}`); return; }

    const { solution_pdf, best_pdf, average_pdf, low_pdf } = j;
    if (solution_pdf || best_pdf || average_pdf || low_pdf) {
      // If these are URLs, open them (or download similarly one-by-one if you want)
      if (solution_pdf) window.open(solution_pdf, "_blank");
      if (best_pdf) window.open(best_pdf, "_blank");
      if (average_pdf) window.open(average_pdf, "_blank");
      if (low_pdf) window.open(low_pdf, "_blank");
      return;
    }

    const urlFromServer = j?.sbaw_pdf || j?.sbab_pdf || j?.url;
    if (!urlFromServer) { alert(`Failed to build SBAW: ${j?.error || "Unknown error"}`); return; }

    const pdfRes = await fetch(urlFromServer, { credentials: "omit" }); // ✅ important
    if (!pdfRes.ok) throw new Error(`Failed to fetch PDF (${pdfRes.status})`);

    const blob = await pdfRes.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = desiredName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e: any) {
    console.error("[SBAW] download error:", e);
    alert(`SBAW download failed: ${e.message}`);
  }
}
