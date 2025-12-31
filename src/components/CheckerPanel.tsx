import React, { useEffect, useMemo, useState } from "react";
import FileUpload from "./FileUpload";
import RubricBuilder from "./RubricBuilder";
import {
  analyzeQuiz,
  processAndGrade,
  processQuiz,
  downloadGreenResults as dlGreen
} from "../utils/actions";
import type { Quiz, Leniency, RubricItem } from "../types";
import { supabase } from "../lib/supabaseClient";
import "../checker.css"; // NEW: all styles moved here (no inline CSS)

interface Props {
  teacherId: string;

  // quizzes + fetch
  quizzes: Quiz[];
  refetch: () => Promise<void>;

  // state: tabs/flags
  running: "none" | "ocr" | "ocr+grade";
  setRunning: (s: "none" | "ocr" | "ocr+grade") => void;

  // OCR/Grading display
  ocrText: string | null;
  setOcrText: (t: string) => void;
  gradingResult: string | null;
  setGradingResult: (t: string | null) => void;

  // last uploaded
  lastUploadedQuizId: string | null;
  setLastUploadedQuizId: (id: string | null) => void;

  // options
  ocrEngine: "vision-pdf" | "tesseract" | "openai-ocr" | "gemini-ocr";
  setOcrEngine: (e: "vision-pdf" | "tesseract" | "openai-ocr" | "gemini-ocr") => void;

  gradingMode: "very_easy" | "easy" | "balanced" | "strict" | "hard" | "blind";
  setGradingMode: (m: Props["gradingMode"]) => void;
  gradingProvider: "openai" | "gemini";
  setGradingProvider: (p: Props["gradingProvider"]) => void;
  customPrompt: string;
  setCustomPrompt: (s: string) => void;
  leniency: Leniency;
  setLeniency: (l: Leniency) => void;
  useSolutionKey: boolean;
  setUseSolutionKey: (b: boolean) => void;

  // rubric
  totalQuestions: number;
  setTotalQuestions: (n: number) => void;
  rubricRows: { number: number; topic: string; maxMarks: string; subpartsRaw: string }[];
  setRubricRows: (rows: Props["rubricRows"]) => void;
  rubricPayload: RubricItem[];

  downloadGreenResults: (quizId: string) => Promise<void>;
}

type Course = { id: string; name: string };
type Section = { id: string; name: string; course_id: string };

type FlowStep = "idle" | "ocr" | "grading" | "done" | "error";

/* ---------------- Pretty renderer (same classes as Results styling) ---------------- */
function PrettyResults({ raw }: { raw: any }) {
  let data: any = null;
  try {
    data = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    // ignore
  }

  if (!data) {
    return <div className="pr-muted">No structured results available.</div>;
  }

  const items = Array.isArray(data) ? data : (Array.isArray(data?.students) ? data.students : null);
  if (!Array.isArray(items)) {
    return (
      <div>
        <div className="pr-muted">Results received, but not in student-array format.</div>
        <details className="pr-details">
          <summary>Raw JSON</summary>
          <pre className="pr-pre">{JSON.stringify(data, null, 2)}</pre>
        </details>
      </div>
    );
  }

  return (
    <div className="pr-grid">
      {items.map((s: any, idx: number) => (
        <div key={idx} className="pr-card">
          <div className="pr-header">
            <strong className="pr-student">{s.student_name || "Unknown Student"}</strong>
            <span className="pr-roll">{s.roll_number ? `(${s.roll_number})` : ""}</span>
            <span className="pr-score">Score: {(s.total_score ?? 0)} / {(s.max_score ?? 0)}</span>
          </div>

          {Array.isArray(s.questions) && s.questions.length > 0 && (
            <div className="pr-table-wrap">
              <table className="pr-table">
                <thead>
                  <tr>
                    <th className="pr-th">Q#</th>
                    <th className="pr-th">Marks</th>
                    <th className="pr-th">Feedback</th>
                  </tr>
                </thead>
                <tbody>
                  {s.questions.map((q: any, qi: number) => (
                    <tr key={qi}>
                      <td className="pr-td">{q.number ?? qi + 1}</td>
                      <td className="pr-td">{(q.marks ?? 0)} / {(q.max_marks ?? "-")}</td>
                      <td className="pr-td pr-feedback">
                        {q.remarks || "-"}
                        {Array.isArray(q.subparts) && q.subparts.length > 0 && (
                          <div className="pr-subparts">
                            <div className="pr-subparts-title">Subparts:</div>
                            <ul className="pr-subparts-list">
                              {q.subparts.map((sp: any, si: number) => (
                                <li key={si}>
                                  {sp.label || "?"}: {(sp.marks ?? 0)}/{(sp.max_marks ?? "-")}
                                  {sp.remarks ? ` — ${sp.remarks}` : ""}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {s.remarks && (
            <div className="pr-overall">
              <strong>Overall Feedback:</strong>
              <div className="pr-overall-text">{s.remarks}</div>
            </div>
          )}
        </div>
      ))}

      <details className="pr-details">
        <summary>Raw JSON</summary>
        <pre className="pr-pre">{JSON.stringify(items, null, 2)}</pre>
      </details>
    </div>
  );
}

const CheckerPanel: React.FC<Props> = (props) => {
  const {
    teacherId, quizzes, refetch,
    running, setRunning, ocrText, setOcrText, gradingResult, setGradingResult,
    lastUploadedQuizId, setLastUploadedQuizId,
    ocrEngine, setOcrEngine, gradingMode, setGradingMode, gradingProvider, setGradingProvider,
    customPrompt, setCustomPrompt, leniency, setLeniency, useSolutionKey, setUseSolutionKey,
    totalQuestions, setTotalQuestions, rubricRows, setRubricRows, rubricPayload
  } = props;

  // Course → Section pickers
  const [courses, setCourses] = useState<Course[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [selectedSectionId, setSelectedSectionId] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("id, name")
        .eq("teacher_id", teacherId)
        .order("name", { ascending: true });
      if (!cancelled && !error) setCourses(data as Course[]);
    })();
    return () => { cancelled = true; };
  }, [teacherId]);

  useEffect(() => {
    if (!selectedCourseId) { setSections([]); setSelectedSectionId(""); return; }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("sections")
        .select("id, name, course_id")
        .eq("course_id", selectedCourseId)
        .order("name", { ascending: true });
      if (!cancelled && !error) setSections(data as Section[]);
    })();
    return () => { cancelled = true; };
  }, [selectedCourseId]);

  const selectedCourseName =
    (courses.find(c => c.id === selectedCourseId)?.name || "").trim();
  const selectedSectionName =
    (sections.find(s => s.id === selectedSectionId)?.name || "").trim();

  // Quiz Name (title) presets + custom
  const QUIZ_NAME_PRESETS = ["Quiz 1", "Quiz 2", "Quiz 3", "Midterm", "Final", "Other (custom)"] as const;
  const [quizNameChoice, setQuizNameChoice] =
    useState<(typeof QUIZ_NAME_PRESETS)[number]>("Quiz 1");
  const [quizNameCustom, setQuizNameCustom] = useState<string>("");

  const resolvedQuizTitle = useMemo(() => {
    return quizNameChoice === "Other (custom)"
      ? (quizNameCustom.trim() || "Untitled Quiz")
      : quizNameChoice;
  }, [quizNameChoice, quizNameCustom]);

  // ---------- NEW: Pages (1–6 + Custom) ----------
  const PAGE_OPTIONS = ["1", "2", "3", "4", "5", "6", "Custom"] as const;
  const [pagesChoice, setPagesChoice] =
    useState<(typeof PAGE_OPTIONS)[number]>("1");
  const [pagesCustom, setPagesCustom] = useState<string>("");

  const resolvedNoOfPages = useMemo<number | null>(() => {
    if (pagesChoice === "Custom") {
      const n = parseInt(pagesCustom, 10);
      return Number.isFinite(n) && n > 0 ? n : null;
    }
    return parseInt(pagesChoice, 10);
  }, [pagesChoice, pagesCustom]);
  // -----------------------------------------------

  async function tagQuizMeta(quizId: string) {
    const payload: Partial<Quiz> = {
      title: resolvedQuizTitle || null,
      section: selectedSectionName || null
    };

    // include no_of_pages and read_first_paper_is_solution without touching your Quiz type
    const payloadWithExtras = {
      ...(payload as any),
      no_of_pages: resolvedNoOfPages ?? null,
      read_first_paper_is_solution: !!useSolutionKey
    };

    const { error } = await supabase.from("quizzes").update(payloadWithExtras).eq("id", quizId);
    if (error) {
      console.warn("Failed to tag quiz:", error.message);
    } else {
      await refetch();
    }
  }

  // Flow state
  const [flow, setFlow] = useState<FlowStep>("idle");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const canShowResults = useMemo(
    () => Boolean(gradingResult) || Boolean(ocrText?.includes("completed")),
    [gradingResult, ocrText]
  );

  useEffect(() => {
    if (running === "ocr") setFlow("ocr");
    else if (running === "ocr+grade") setFlow("ocr");
  }, [running]);

  useEffect(() => {
    if (!gradingResult) return;
    if (gradingResult.startsWith("🧠 Grading in progress")) setFlow("grading");
    else if (gradingResult.startsWith("❌")) setFlow("error");
    else setFlow("done");
  }, [gradingResult]);

  useEffect(() => {
    if (!ocrText) return;
    if (ocrText.startsWith("❌")) setFlow("error");
    if (ocrText.includes("completed") && running === "ocr") setFlow("done");
  }, [ocrText, running]);

  async function ensurePreviewUrl(quizId: string) {
    try {
      const r = await fetch(`http://localhost:5000/build-green-graded/${quizId}`, { method: "POST" });
      const j = await r.json();
      if (j?.success && j?.url) {
        setPreviewUrl(j.url);
        setPreviewOpen(true);
      } else {
        alert(`Preview not available: ${j?.error || "Unknown error"}`);
      }
    } catch (e: any) {
      alert(`Failed to load preview: ${e.message}`);
    }
  }

  const StepCard: React.FC<{ step: "ocr" | "grading"; status: FlowStep; label: string; }> = ({ step, status, label }) => {
    const active = (status === step) || (step === "grading" && status === "done");
    const done = (status === "done" && step === "grading") || (status === "done" && step === "ocr");
    const runningHere = status === step;
    const failed = status === "error";
    return (
      <div className={`flow-card ${active ? "active" : ""} ${done ? "done" : ""} ${failed ? "error" : ""}`}>
        <div className="flow-header">
          <div className={`dot ${runningHere ? "pulse" : ""} ${done ? "ok" : ""} ${failed ? "bad" : ""}`} />
          <strong>{label}</strong>
        </div>
        <div className="flow-body">
          {runningHere && (
            step === "ocr" ? <div className="loader-line"><span/></div> : <div className="typing">
              <span></span><span></span><span></span>
            </div>
          )}
          {done && <div className="done-badge">Completed</div>}
          {failed && <div className="error-badge">Failed</div>}
        </div>
      </div>
    );
  };

  return (
    <div className="panel">
      <h2>Upload & Check New Quiz</h2>

      {/* Course & Section selection */}
      <div className="cp-filter">
        <div className="cp-field">
          <label htmlFor="courseSel" className="cp-label"><strong>Course:</strong></label>
          <select
            id="courseSel"
            className="cp-select cp-select-course"
            value={selectedCourseId}
            onChange={(e) => setSelectedCourseId(e.target.value)}
          >
            <option value="">— Select course —</option>
            {courses.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="cp-field">
          <label htmlFor="sectionSel" className="cp-label"><strong>Section:</strong></label>
          <select
            id="sectionSel"
            className="cp-select cp-select-section"
            value={selectedSectionId}
            onChange={(e) => setSelectedSectionId(e.target.value)}
            disabled={!selectedCourseId}
          >
            <option value="">{selectedCourseId ? "— Select section —" : "Select a course first"}</option>
            {sections.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        {/* Quiz Name chooser */}
        <div className="cp-field">
          <label htmlFor="quizNameSel" className="cp-label"><strong>Quiz Name:</strong></label>
          <select
            id="quizNameSel"
            className="cp-select cp-select-name"
            value={quizNameChoice}
            onChange={(e) => setQuizNameChoice(e.target.value as typeof QUIZ_NAME_PRESETS[number])}
          >
            {QUIZ_NAME_PRESETS.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>

        {quizNameChoice === "Other (custom)" && (
          <div className="cp-field">
            <label htmlFor="quizNameCustom" className="cp-label"><strong>Custom Name:</strong></label>
            <input
              id="quizNameCustom"
              className="cp-input cp-input-name"
              type="text"
              placeholder="e.g., Chapter 5 Test"
              value={quizNameCustom}
              onChange={(e) => setQuizNameCustom(e.target.value)}
            />
          </div>
        )}

        {/* ---------- NEW: No. of Pages chooser ---------- */}
        <div className="cp-field">
          <label htmlFor="pagesSel" className="cp-label"><strong>No. of Pages:</strong></label>
          <select
            id="pagesSel"
            className="cp-select"
            value={pagesChoice}
            onChange={(e) => setPagesChoice(e.target.value as typeof PAGE_OPTIONS[number])}
          >
            {PAGE_OPTIONS.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        {pagesChoice === "Custom" && (
          <div className="cp-field">
            <label htmlFor="pagesCustom" className="cp-label"><strong>Custom Pages:</strong></label>
            <input
              id="pagesCustom"
              className="cp-input"
              type="number"
              min={1}
              placeholder="Enter pages (e.g., 7)"
              value={pagesCustom}
              onChange={(e) => setPagesCustom(e.target.value)}
            />
          </div>
        )}
        {/* ------------------------------------------------ */}
      </div>

      {/* OCR engine */}
      <div className="cp-row">
        <label htmlFor="ocrEngine" className="cp-label"><strong>OCR Engine:</strong></label>
        <select
          id="ocrEngine"
          className="cp-select"
          value={ocrEngine}
          onChange={(e) => setOcrEngine(e.target.value as any)}
        >
          <option value="vision-pdf">Google Vision (PDF)</option>
          <option value="tesseract">Tesseract</option>
          <option value="openai-ocr">OpenAI OCR</option>
          <option value="gemini-ocr">Gemini OCR</option>
        </select>
      </div>

      {/* Provider + Mode + Leniency + Solution */}
      <div className="cp-options">
        <div className="cp-field">
          <label className="cp-label"><strong>Grading Provider: </strong></label>
          <select className="cp-select" value={gradingProvider} onChange={(e) => setGradingProvider(e.target.value as any)}>
            <option value="openai">OpenAI</option>
            <option value="gemini">Gemini (AI Studio)</option>
          </select>
        </div>
        <div className="cp-field">
          <label className="cp-label"><strong>Grading Mode: </strong></label>
          <select className="cp-select" value={gradingMode} onChange={(e) => setGradingMode(e.target.value as any)}>
            <option value="very_easy">More Easy</option>
            <option value="easy">Easy</option>
            <option value="balanced">Balanced</option>
            <option value="strict">Strict</option>
            <option value="hard">Hard</option>
            <option value="blind">Blind</option>
          </select>
        </div>
        <div className="cp-field">
          <label className="cp-label"><strong>Leniency: </strong></label>
          <select className="cp-select" value={leniency} onChange={(e) => setLeniency(e.target.value as any)}>
            <option value="exact_only">Exact Only</option>
            <option value="half_correct_full">Full if 1/2 correct</option>
            <option value="quarter_correct_full">Full if 1/4 correct</option>
            <option value="any_relevant_full">Marks if relevant</option>
          </select>
        </div>
        <label className="cp-checkbox">
          <input
            type="checkbox"
            checked={useSolutionKey}
            onChange={async (e) => {
              const checked = e.target.checked;
              setUseSolutionKey(checked);

              // NEW: persist immediately if a quiz is already uploaded
              if (lastUploadedQuizId) {
                const { error } = await supabase
                  .from("quizzes")
                  .update({ read_first_paper_is_solution: checked })
                  .eq("id", lastUploadedQuizId);
                if (error) {
                  console.warn("Failed to update read_first_paper_is_solution:", error.message);
                } else {
                  await refetch();
                }
              }
            }}
          />
          Treat FIRST paper as solution key
        </label>
      </div>

      <textarea
        className="cp-textarea"
        placeholder="Optional custom instructions for grading (e.g., compare with key, be generous on partial work, etc.)"
        value={customPrompt}
        onChange={(e) => setCustomPrompt(e.target.value)}
      />

      {/* Rubric builder */}
      <RubricBuilder
        totalQuestions={totalQuestions}
        setTotalQuestions={setTotalQuestions}
        rubricRows={rubricRows}
        setRubricRows={setRubricRows}
      />

      {/* Upload */}
      <FileUpload
        teacherId={teacherId}
        onUploadComplete={async (quizId) => {
          setLastUploadedQuizId(quizId);
          props.setOcrText("📄 File uploaded. Choose an action below.");
          await tagQuizMeta(quizId);
          setFlow("idle");
        }}
      />

      {/* Process Flow (animated) */}
      <div className="flow-wrap">
        <StepCard step="ocr"     status={flow} label="OCR: Extracting answers" />
        <StepCard step="grading" status={flow} label="AI Grading: Scoring & feedback" />
      </div>

      {/* Actions */}
      {lastUploadedQuizId && (
        <div className="cp-actions">
          <button
            className="btn btn-dark"
            onClick={() => {
              setFlow("ocr");
              processQuiz(lastUploadedQuizId, ocrEngine, setRunning, setOcrText, refetch);
            }}
            disabled={running !== "none"}
          >
            {running === "ocr" ? "Running OCR…" : "Run OCR Only"}
          </button>

          <button
            className="btn btn-success"
            onClick={() => {
              setFlow("ocr");
              processAndGrade(
                lastUploadedQuizId,
                {
                  engine: ocrEngine,
                  gradingMode,
                  gradingProvider,
                  customPrompt,
                  rubricPayload,
                  leniency,
                  useSolutionKey
                },
                setRunning,
                setGradingResult,
                () => null,
                refetch,
                setOcrText
              );
            }}
            disabled={running !== "none"}
          >
            {running === "ocr+grade" ? "OCR + Grading…" : "Run OCR + Grade"}
          </button>
        </div>
      )}

      {/* Text outputs */}
      {ocrText && <p className="cp-status">{ocrText}</p>}

      {/* Friendly AI results */}
      {(() => {
        const q = lastUploadedQuizId ? quizzes.find(z => z.id === lastUploadedQuizId) : null;
        const structured =
          (q && ((q as any).graded_json || q.formatted_text)) ||
          gradingResult;

        if (!structured) return null;

        return (
          <div className="grading-result">
            <h4>📊 AI Grading Output</h4>

            <div className="gr-wrap">
              <PrettyResults raw={structured} />
            </div>

            <div className="gr-actions">
              {lastUploadedQuizId && (
                <>
                  <button className="btn" onClick={() => ensurePreviewUrl(lastUploadedQuizId)}>👀 Preview Results</button>
                  <button className="btn" onClick={() => dlGreen(lastUploadedQuizId, quizzes)}>⬇️ Download Results (PDF)</button>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* Preview Modal */}
      {previewOpen && previewUrl && (
        <div className="preview-modal" onClick={() => setPreviewOpen(false)}>
          <div className="preview-card" onClick={(e) => e.stopPropagation()}>
            <div className="preview-head">
              <strong>Results Preview</strong>
              <div className="preview-actions">
                <button className="btn btn-secondary" onClick={() => setPreviewOpen(false)}>Close</button>
                <a href={previewUrl} target="_blank" rel="noreferrer">
                  <button className="btn btn-primary">Open in new tab</button>
                </a>
              </div>
            </div>
            <div className="preview-body">
              <iframe src={previewUrl} title="Results Preview" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CheckerPanel;
