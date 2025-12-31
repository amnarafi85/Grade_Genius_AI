import React, { useEffect, useMemo, useState } from "react";
import type { Quiz, Leniency, RubricItem } from "../types";
import RubricBuilder from "./RubricBuilder";
import {
  analyzeQuiz,
  exportCsv,
  buildPack,
  downloadGreenResults,
  downloadSBAW
} from "../utils/actions";
import { createClient } from "@supabase/supabase-js";
import "../results.css"; // <-- new styles (no inline CSS)

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_ANON_KEY!
);

interface Props {
  quizzes: Quiz[];
  loading: boolean;
  packLinks: Record<string, string> | null;
  setPackLinks: (v: Record<string, string> | null) => void;

  gradingMode: "very_easy" | "easy" | "balanced" | "strict" | "hard" | "blind";
  setGradingMode: (m: Props["gradingMode"]) => void;
  gradingProvider: "openai" | "gemini";
  setGradingProvider: (p: Props["gradingProvider"]) => void;
  leniency: Leniency;
  setLeniency: (l: Leniency) => void;
  useSolutionKey: boolean;
  setUseSolutionKey: (b: boolean) => void;

  totalQuestions: number;
  setTotalQuestions: (n: number) => void;
  rubricRows: { number: number; topic: string; maxMarks: string; subpartsRaw: string }[];
  setRubricRows: (rows: Props["rubricRows"]) => void;
  rubricPayload: RubricItem[];

  customPrompt: string;
  setCustomPrompt: (s: string) => void;

  gradingResult: string | null;
  setGradingResult: (t: string | null) => void;

  refetch: () => Promise<void>;
}

/* ---------------- Pretty renderer for AI results (graded_json / formatted_text) ---------------- */
function PrettyResults({ raw }: { raw: any }) {
  let data: any = null;
  try {
    data = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    // not JSON
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
            <strong className="pr-student">
              {s.student_name || "Unknown Student"}
            </strong>
            <span className="pr-roll">
              {s.roll_number ? `(${s.roll_number})` : ""}
            </span>
            <span className="pr-score">
              Score: {(s.total_score ?? 0)} / {(s.max_score ?? 0)}
            </span>
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
        <pre className="pr-pre">{JSON.stringify(data, null, 2)}</pre>
      </details>
    </div>
  );
}

type Course = { id: string; name: string };
type Section = { id: string; name: string; course_id: string };

/* ---- CircularLoader: SVG ring with determinate/indeterminate modes ---- */
type CircularLoaderProps = {
  size?: number;          // px
  stroke?: number;        // ring thickness
  value?: number | null;  // 0–100 for determinate; null/undefined => indeterminate
  label?: React.ReactNode;
  className?: string;
};

const CircularLoader: React.FC<CircularLoaderProps> = ({
  size = 28,
  stroke = 4,
  value,
  label,
  className = ""
}) => {
  const s = Math.max(size, stroke * 2);
  const r = (s - stroke) / 2;
  const C = 2 * Math.PI * r;
  const determinate = typeof value === "number" && isFinite(value);

  const dashArray = determinate ? C : undefined;
  const dashOffset = determinate ? C - (Math.max(0, Math.min(100, value!)) / 100) * C : undefined;

  return (
    <span
      className={`clr ${determinate ? "clr-determinate" : "clr-indeterminate"} ${className}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      {...(determinate ? { "aria-valuenow": Math.round(value!) } : {})}
    >
      <svg
        className="clr-svg"
        width={s}
        height={s}
        viewBox={`0 0 ${s} ${s}`}
        aria-hidden="true"
      >
        <circle className="clr-track" cx={s / 2} cy={s / 2} r={r} strokeWidth={stroke} fill="none" />
        <circle
          className="clr-ring"
          cx={s / 2}
          cy={s / 2}
          r={r}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={dashArray}
          strokeDashoffset={dashOffset}
        />
      </svg>

      {label && <span className="clr-label">{label}</span>}
      {determinate && <span className="clr-pct">{Math.round(value!)}%</span>}
    </span>
  );
};

/* ---------------- Small helper: stream download with progress for public PDFs ---------------- */
async function downloadWithProgress(
  url: string,
  filename: string,
  onProgress: (pct: number) => void
) {
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Download failed (${res.status})`);
  }

  const contentLength = Number(res.headers.get("Content-Length") || 0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.length;
      if (contentLength > 0) {
        onProgress(Math.round((received / contentLength) * 100));
      }
    }
  }

  const blob = new Blob(chunks, { type: "application/pdf" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename || "file.pdf";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

const ResultsPanel: React.FC<Props> = (props) => {
  const {
    quizzes, loading, packLinks, setPackLinks,
    gradingMode, setGradingMode, gradingProvider, setGradingProvider,
    leniency, setLeniency, useSolutionKey, setUseSolutionKey,
    totalQuestions, setTotalQuestions, rubricRows, setRubricRows, rubricPayload,
    customPrompt, setCustomPrompt, gradingResult, setGradingResult, refetch
  } = props;

  // ---- download state (per-quiz) ----
  const [downloadingQuizId, setDownloadingQuizId] = useState<string | null>(null);
  const [downloadLabel, setDownloadLabel] = useState<string>("");
  const [downloadPct, setDownloadPct] = useState<number>(0);
  const [indeterminate, setIndeterminate] = useState<boolean>(false);

  const startDeterminate = (quizId: string, label: string) => {
    setDownloadingQuizId(quizId);
    setDownloadLabel(label);
    setIndeterminate(false);
    setDownloadPct(0);
  };
  const startIndeterminate = (quizId: string, label: string) => {
    setDownloadingQuizId(quizId);
    setDownloadLabel(label);
    setIndeterminate(true);
    setDownloadPct(0);
  };
  const finishDownload = () => {
    setDownloadingQuizId(null);
    setDownloadLabel("");
    setIndeterminate(false);
    setDownloadPct(0);
  };

  // ---- course/section picker (loads for the signed-in teacher) ----
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [selectedSectionId, setSelectedSectionId] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id || null;
      setTeacherId(uid);
      if (!uid) return;

      const { data: crs } = await supabase
        .from("courses")
        .select("id,name")
        .eq("teacher_id", uid)
        .order("name", { ascending: true });
      setCourses((crs || []) as Course[]);
    })();
  }, []);

  useEffect(() => {
    if (!selectedCourseId) {
      setSections([]);
      setSelectedSectionId("");
      return;
    }
    (async () => {
      const { data: secs } = await supabase
        .from("sections")
        .select("id,name,course_id")
        .eq("course_id", selectedCourseId)
        .order("name", { ascending: true });
      setSections((secs || []) as Section[]);
    })();
  }, [selectedCourseId]);

  const selectedSectionName =
    (sections.find(s => s.id === selectedSectionId)?.name || "").trim();

  const filteredQuizzes = useMemo(() => {
    let list = quizzes || [];

    if (selectedCourseId) {
      list = list.filter(q =>
        (q as any).course_id === selectedCourseId ||
        (q as any).courseId === selectedCourseId ||
        true
      );
    }

    if (selectedSectionId) {
      list = list.filter(q =>
        (q as any).section_id === selectedSectionId ||
        (q as any).sectionId === selectedSectionId ||
        (q as any).section === selectedSectionName
      );
    }

    return list;
  }, [quizzes, selectedCourseId, selectedSectionId, selectedSectionName]);

  // Minimal “delete quiz”
  const handleDelete = async (quizId: string, displayName: string) => {
    const ok = window.confirm(`Delete quiz "${displayName}"? This will remove its row from the quizzes table.`);
    if (!ok) return;

    const { error } = await supabase.from("quizzes").delete().eq("id", quizId);
    if (error) {
      alert(`Delete failed: ${error.message}`);
      return;
    }
    await refetch();
  };

  return (
    <div className="panel">
      <h2 className="rp-title">Past Quiz Reports</h2>

      {/* Teacher Course → Section picker */}
      <div className="rp-filter">
        <div className="rp-filter-group">
          <label className="rp-label">Course:</label>
          <select
            className="rp-select"
            value={selectedCourseId}
            onChange={(e) => setSelectedCourseId(e.target.value)}
            disabled={!teacherId}
          >
            <option value="">— All Courses —</option>
            {courses.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="rp-filter-group">
          <label className="rp-label">Section:</label>
          <select
            className="rp-select"
            value={selectedSectionId}
            onChange={(e) => setSelectedSectionId(e.target.value)}
            disabled={!selectedCourseId}
          >
            <option value="">
              {selectedCourseId ? "— All Sections —" : "Select a course first"}
            </option>
            {sections.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? <p className="rp-loading">Loading...</p> : (
        <ul className="rp-list">
          {filteredQuizzes.map((q) => {
            const originalUrl = q.original_pdf
              ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/quizzes/${q.original_pdf}`
              : null;
            const gradedUrl = q.graded_pdf
              ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/graded/${q.graded_pdf}`
              : null;

            return (
              <li key={q.id} className="quiz-card">
                <div className="quiz-header">
                  {/* <strong>🧾 Quiz ID:</strong> {q.id} */}
                  {/* <span> | {new Date(q.created_at).toLocaleString()}</span> */}
                  {q.title ? <span> | <strong>Title:</strong> {q.title}</span> : null}
                  {q.section ? <span> | <strong>Section:</strong> {q.section}</span> : null}
                </div>

                <div className="quiz-links">
                  {originalUrl && (
                    <a
                      href={originalUrl}
                      target="_blank"
                      onClick={async (e) => {
                        e.preventDefault();
                        try {
                          startDeterminate(q.id, "Downloading original PDF…");
                          await downloadWithProgress(
                            originalUrl,
                            (q.title ? `${q.title}_original.pdf` : `original_${q.id}.pdf`),
                            (pct) => setDownloadPct(pct)
                          );
                        } catch (err: any) {
                          alert(err?.message || "Failed to download.");
                        } finally {
                          finishDownload();
                        }
                      }}
                    >
                      Original PDF
                    </a>
                  )}{" "}
                  |{" "}
                  {gradedUrl && (
                    <a
                      href={gradedUrl}
                      target="_blank"
                      onClick={async (e) => {
                        e.preventDefault();
                        try {
                          startDeterminate(q.id, "Downloading ✅ graded PDF…");
                          await downloadWithProgress(
                            gradedUrl,
                            (q.title ? `${q.title}_graded.pdf` : `graded_${q.id}.pdf`),
                            (pct) => setDownloadPct(pct)
                          );
                        } catch (err: any) {
                          alert(err?.message || "Failed to download.");
                        } finally {
                          finishDownload();
                        }
                      }}
                    >
                      ✅ Graded PDF
                    </a>
                  )}
                </div>

                {/* Circular loader under the links */}
                {downloadingQuizId === q.id && (
                  <div className="rp-loading">
                    <CircularLoader
                      value={indeterminate ? null : downloadPct}
                      label={downloadLabel}
                    />
                  </div>
                )}

                {q.formatted_text || q.graded_json ? (
                  <details className="text-details">
                    <summary>📊 View AI Grading Result</summary>
                    <div className="pr-wrap">
                      <PrettyResults raw={(q as any).graded_json || q.formatted_text} />
                    </div>
                  </details>
                ) : q.extracted_text ? (
                  <details className="text-details">
                    <summary>📑 View Extracted OCR Text</summary>
                    <pre className="rp-pre">{q.extracted_text}</pre>
                  </details>
                ) : <p className="rp-empty">❌ No results yet</p>}

                {/* Quick actions */}
                <div className="rp-actions">
                  <button className="btn" onClick={() => exportCsv(q.id, quizzes, refetch)}>📤 Export CSV</button>

                  {/* Build pack with indeterminate loader */}
                  <button
                    className="btn"
                    onClick={async () => {
                      try {
                        startIndeterminate(q.id, "Preparing graded PDFs pack…");
                        await buildPack(q.id, setPackLinks, async (id: string) => {
                          setDownloadLabel("Downloading green graded PDFs…");
                          try {
                            await downloadGreenResults(id, quizzes);
                          } finally {
                            finishDownload();
                          }
                        });
                      } catch (e) {
                        finishDownload();
                        console.error(e);
                      }
                    }}
                  >
                    🖍️ Build Graded PDFs Pack
                  </button>

                  {/* SBAW / SWAB download: indeterminate */}
                  <button
                    className="btn"
                    onClick={async () => {
                      try {
                        startIndeterminate(q.id, "Downloading SBAW.pdf…");
                        await downloadSBAW(q.id, quizzes);
                      } catch (e) {
                        console.error(e);
                      } finally {
                        finishDownload();
                      }
                    }}
                  >
                    🟨 ⬇️ Download SBAW.pdf
                  </button>

                  <span className="spacer" />
                  <button
                    className="btn btn-danger"
                    onClick={() => handleDelete(q.id, q.title || `quiz_${q.id}`)}
                  >
                    🗑️ Delete Quiz
                  </button>
                </div>

                {/* Rerun grading controls */}
                <div className="grading-controls">
                  <h3 className="gc-title">🧠 AI Grading Options</h3>

                  <div className="gc-row">
                    <div className="gc-field">
                      <label className="rp-label">Grading Provider</label>
                      <select className="rp-select" value={gradingProvider} onChange={(e) => setGradingProvider(e.target.value as any)}>
                        <option value="openai">OpenAI</option>
                        <option value="gemini">Gemini (AI Studio)</option>
                      </select>
                    </div>

                    <div className="gc-field">
                      <label className="rp-label">Grading Mode</label>
                      <select className="rp-select" value={gradingMode} onChange={(e) => setGradingMode(e.target.value as any)}>
                        <option value="very_easy">More Easy</option>
                        <option value="easy">Easy</option>
                        <option value="balanced">Balanced</option>
                        <option value="strict">Strict</option>
                        <option value="hard">Hard</option>
                        <option value="blind">Blind</option>
                      </select>
                    </div>

                    <div className="gc-field">
                      <label className="rp-label">Leniency</label>
                      <select className="rp-select" value={leniency} onChange={(e) => setLeniency(e.target.value as any)}>
                        <option value="exact_only">Exact Only</option>
                        <option value="half_correct_full">Full if 1/2 correct</option>
                        <option value="quarter_correct_full">Full if 1/4 correct</option>
                        <option value="any_relevant_full">Full if relevant</option>
                      </select>
                    </div>

                    <label className="gc-checkbox">
                      <input
                        type="checkbox"
                        checked={useSolutionKey}
                        onChange={async (e) => {
                          const checked = e.target.checked;
                          setUseSolutionKey(checked);
                          // NEW: persist this choice to the DB for THIS quiz
                          const { error } = await supabase
                            .from("quizzes")
                            .update({ read_first_paper_is_solution: checked })
                            .eq("id", q.id);
                          if (error) {
                            console.warn("Failed to update read_first_paper_is_solution:", error.message);
                          } else {
                            await refetch();
                          }
                        }}
                      />
                      Treat FIRST paper as solution key
                    </label>
                  </div>

                  <details className="rp-details">
                    <summary>Rubric (Optional)</summary>
                    <RubricBuilder
                      totalQuestions={totalQuestions}
                      setTotalQuestions={setTotalQuestions}
                      rubricRows={rubricRows}
                      setRubricRows={setRubricRows}
                      title="Rubric (Optional)"
                    />
                  </details>

                  <textarea
                    className="rp-textarea"
                    placeholder="Optional custom instructions for grading (e.g., focus on clarity, penalize missing steps, etc.)"
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                  />

                  <button
                    className="btn btn-primary"
                    onClick={async (e) => {
                      const btn = e.currentTarget as HTMLButtonElement;
                      btn.setAttribute("aria-busy", "true");
                      btn.disabled = true;
                      try {
                        await analyzeQuiz(
                          q.id,
                          { gradingMode, gradingProvider, customPrompt, rubricPayload, leniency, useSolutionKey },
                          setGradingResult,
                          setPackLinks,
                          refetch
                        );
                      } finally {
                        btn.removeAttribute("aria-busy");
                        btn.disabled = false;
                      }
                    }}
                  >
                    🚀 Run AI Grading
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default ResultsPanel;
