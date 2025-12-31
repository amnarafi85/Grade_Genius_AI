import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import FileUpload from "./FileUpload";
import "../dashboard.css";

import type { DashboardProps, Quiz, RubricItem, Leniency } from "./types";
import { fetchQuizzesByTeacher, downloadGreenResults as dlGreen } from "../utils/actions";
import CheckerPanel from "./CheckerPanel";
import ExcelPanel from "./ExcelPanel";
import ResultsPanel from "./ResultsPanel";
import { computeRubricPayload } from "./RubricBuilder";

// ✅ NEW IMPORT (ONLY ADDITION)
import TakeViva from "./take_viva";

export default function Dashboard({ teacherId }: DashboardProps) {
  // ===== UI / nav =====
  // ✅ ONLY CHANGE HERE: Add take_viva
  const [activeTab, setActiveTab] = useState<"checker" | "results" | "excel" | "take_viva">("checker");
  const [showSettings, setShowSettings] = useState(false);

  // ===== Data =====
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(false);

  // ===== OCR / grading =====
  const [ocrText, setOcrText] = useState<string | null>(null);
  const [gradingResult, setGradingResult] = useState<string | null>(null);

  const [gradingMode, setGradingMode] =
    useState<"very_easy" | "easy" | "balanced" | "strict" | "hard" | "blind">("balanced");
  const [gradingProvider, setGradingProvider] = useState<"openai" | "gemini">("openai");
  const [customPrompt, setCustomPrompt] = useState("");

  const [leniency, setLeniency] = useState<Leniency>("exact_only");
  const [useSolutionKey, setUseSolutionKey] = useState<boolean>(false);

  const [ocrEngine, setOcrEngine] = useState<"vision-pdf" | "tesseract" | "openai-ocr" | "gemini-ocr">("vision-pdf");

  const [lastUploadedQuizId, setLastUploadedQuizId] = useState<string | null>(null);
  const [running, setRunning] = useState<"none" | "ocr" | "ocr+grade">("none");

  const [packLinks, setPackLinks] = useState<Record<string, string> | null>(null);

  // ===== Rubric builder =====
  const [totalQuestions, setTotalQuestions] = useState<number>(0);
  const [rubricRows, setRubricRows] = useState<
    { number: number; topic: string; maxMarks: string; subpartsRaw: string }[]
  >([]);

  useEffect(() => {
    if (totalQuestions <= 0) {
      setRubricRows([]);
      return;
    }
    setRubricRows((prev) => {
      const map = new Map(prev.map((r) => [r.number, r]));
      const next: typeof prev = [];
      for (let i = 1; i <= totalQuestions; i++) {
        next.push(map.get(i) || { number: i, topic: "", maxMarks: "", subpartsRaw: "" });
      }
      return next;
    });
  }, [totalQuestions]);

  const rubricPayload: RubricItem[] = useMemo(() => computeRubricPayload(rubricRows), [rubricRows]);

  // ===== Fetch quizzes =====
  const refetch = async () => fetchQuizzesByTeacher(teacherId, setQuizzes, setLoading);
  useEffect(() => {
    refetch();
  }, [teacherId]);

  const downloadGreenResults = (quizId: string) => dlGreen(quizId, quizzes);

  // ===== Profile / settings (name, courses, forgot password redirect) =====
  const [teacherEmail, setTeacherEmail] = useState<string | null>(null);
  const [teacherName, setTeacherName] = useState<string>("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [courses, setCourses] = useState<{ id: string; name: string; code: string | null }[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(false);

  // inline editing state for courses
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [editingCourseName, setEditingCourseName] = useState<string>("");

  useEffect(() => {
    // load auth email
    supabase.auth.getUser().then(({ data }) => {
      const email = data?.user?.email ?? null;
      setTeacherEmail(email || null);
    });
  }, []);

  useEffect(() => {
    // load teacher profile (name/email)
    const loadProfile = async () => {
      const { data, error } = await supabase
        .from("teachers")
        .select("name, email")
        .eq("id", teacherId)
        .single();
      if (!error && data) {
        setTeacherName(data.name ?? "");
        setTeacherEmail(data.email ?? teacherEmail);
      }
    };
    loadProfile();
  }, [teacherId]);

  const refreshCourses = async () => {
    setLoadingCourses(true);
    const { data, error } = await supabase
      .from("courses")
      .select("id, name, code")
      .eq("teacher_id", teacherId)
      .order("created_at", { ascending: false });
    if (!error && data) setCourses(data as any);
    setLoadingCourses(false);
  };

  useEffect(() => {
    // load teacher courses when settings is opened
    if (showSettings) refreshCourses();
  }, [showSettings, teacherId]);

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    await supabase.from("teachers").update({ name: teacherName }).eq("id", teacherId);
    setSavingProfile(false);
  };

  // redirect-only forgot password
  const handleResetPassword = async () => {
    window.location.href = "/auth/forgot-password";
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  // course rename
  const startEditCourse = (id: string, currentName: string) => {
    setEditingCourseId(id);
    setEditingCourseName(currentName);
  };

  const cancelEditCourse = () => {
    setEditingCourseId(null);
    setEditingCourseName("");
  };

  const saveCourseName = async () => {
    if (!editingCourseId) return;
    const name = editingCourseName.trim();
    if (!name) return;
    await supabase.from("courses").update({ name }).eq("id", editingCourseId).eq("teacher_id", teacherId);
    await refreshCourses();
    cancelEditCourse();
  };

  const deleteCourse = async (id: string) => {
    const ok = window.confirm("Delete this course? This cannot be undone.");
    if (!ok) return;
    await supabase.from("courses").delete().eq("id", id).eq("teacher_id", teacherId);
    await refreshCourses();
  };

  return (
    <div className="dashboard">
      {/* Topbar */}
      <header className="topbar">
        <div className="brand">
          {/* <span className="brand-logo" aria-hidden>📚</span> */}
          <h1 className="brand-title">Teacher Dashboard</h1>
        </div>

        {/* Welcome + teacher name */}
        <div className="muted" style={{ fontWeight: 700 }}>
          Welcome{teacherName ? `, ${teacherName}` : ""}
        </div>

        <div className="topbar-actions">
          <button
            className="icon-button"
            aria-label="Settings"
            title="Settings"
            onClick={() => setShowSettings((s) => !s)}
          >
            ⚙️
          </button>
          <button className="logout-button" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      <div className="layout">
        {/* Sidebar */}
        <nav className="sidebar" aria-label="Sidebar Navigation">
          <ul className="nav-list">
            <li>
              <button
                className={`nav-link ${activeTab === "checker" ? "active" : ""}`}
                onClick={() => setActiveTab("checker")}
              >
                <span className="nav-ico" aria-hidden>🧪</span>
                <span>Checker</span>
              </button>
            </li>
            <li>
              <button
                className={`nav-link ${activeTab === "results" ? "active" : ""}`}
                onClick={() => setActiveTab("results")}
              >
                <span className="nav-ico" aria-hidden>📊</span>
                <span>Results</span>
              </button>
            </li>
            <li>
              <button
                className={`nav-link ${activeTab === "excel" ? "active" : ""}`}
                onClick={() => setActiveTab("excel")}
              >
                <span className="nav-ico" aria-hidden>🧾</span>
                <span>Excel</span>
              </button>
            </li>

            {/* ✅ NEW VIVA TAB BUTTON */}
            <li>
              <button
                className={`nav-link ${activeTab === "take_viva" ? "active" : ""}`}
                onClick={() => setActiveTab("take_viva")}
              >
                <span className="nav-ico" aria-hidden>🎙️</span>
                <span>Take Viva</span>
              </button>
            </li>

            <li>{/* uploads hidden as in your version */}</li>
          </ul>
        </nav>

        {/* Main content */}
        <main className="content">
          {activeTab === "checker" && (
            <CheckerPanel
              teacherId={teacherId}
              quizzes={quizzes}
              refetch={refetch}
              running={running}
              setRunning={setRunning}
              ocrText={ocrText}
              setOcrText={setOcrText}
              gradingResult={gradingResult}
              setGradingResult={setGradingResult}
              lastUploadedQuizId={lastUploadedQuizId}
              setLastUploadedQuizId={setLastUploadedQuizId}
              ocrEngine={ocrEngine}
              setOcrEngine={setOcrEngine}
              gradingMode={gradingMode}
              setGradingMode={setGradingMode}
              gradingProvider={gradingProvider}
              setGradingProvider={setGradingProvider}
              customPrompt={customPrompt}
              setCustomPrompt={setCustomPrompt}
              leniency={leniency}
              setLeniency={setLeniency}
              useSolutionKey={useSolutionKey}
              setUseSolutionKey={setUseSolutionKey}
              totalQuestions={totalQuestions}
              setTotalQuestions={setTotalQuestions}
              rubricRows={rubricRows}
              setRubricRows={setRubricRows}
              rubricPayload={rubricPayload}
              downloadGreenResults={downloadGreenResults}
            />
          )}

          {activeTab === "excel" && <ExcelPanel quizzes={quizzes} loading={loading} />}

          {activeTab === "results" && (
            <ResultsPanel
              quizzes={quizzes}
              loading={loading}
              packLinks={packLinks}
              setPackLinks={setPackLinks}
              gradingMode={gradingMode}
              setGradingMode={setGradingMode}
              gradingProvider={gradingProvider}
              setGradingProvider={setGradingProvider}
              leniency={leniency}
              setLeniency={setLeniency}
              useSolutionKey={useSolutionKey}
              setUseSolutionKey={setUseSolutionKey}
              totalQuestions={totalQuestions}
              setTotalQuestions={setTotalQuestions}
              rubricRows={rubricRows}
              setRubricRows={setRubricRows}
              rubricPayload={rubricPayload}
              customPrompt={customPrompt}
              setCustomPrompt={setCustomPrompt}
              gradingResult={gradingResult}
              setGradingResult={setGradingResult}
              refetch={refetch}
            />
          )}

          {/* ✅ NEW VIVA PAGE */}
          {activeTab === "take_viva" && <TakeViva teacherId={teacherId} />}

          {activeTab === "uploads" && (
            <section className="panel">
              <h2 className="panel-title">Uploads</h2>
              <FileUpload />
            </section>
          )}
        </main>
      </div>

      {/* Settings Drawer / Modal */}
      {showSettings && (
        <div className="settings-overlay" role="dialog" aria-modal="true" aria-label="Settings">
          <div className="settings-panel">
            <div className="settings-header">
              <h2>Settings</h2>
              <button className="icon-button" aria-label="Close" onClick={() => setShowSettings(false)}>
                ✖
              </button>
            </div>

            <div className="settings-content">
              <section className="settings-section">
                <h3>Personal Information</h3>
                <div className="form-row">
                  <label htmlFor="teacher-name">Name</label>
                  <input
                    id="teacher-name"
                    className="text-input"
                    type="text"
                    value={teacherName}
                    onChange={(e) => setTeacherName(e.target.value)}
                    placeholder="Your name"
                  />
                </div>
                <div className="form-row">
                  <label>Email</label>
                  <div className="text-static">{teacherEmail || "—"}</div>
                </div>
                <div className="form-actions">
                  <button className="primary-button" disabled={savingProfile} onClick={handleSaveProfile}>
                    {savingProfile ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </section>

              <section className="settings-section">
                <h3>My Courses</h3>
                {loadingCourses ? (
                  <div className="muted">Loading courses…</div>
                ) : courses.length === 0 ? (
                  <div className="muted">No courses yet.</div>
                ) : (
                  <ul className="course-list">
                    {courses.map((c) => {
                      const isEditing = editingCourseId === c.id;
                      return (
                        <li key={c.id} className="course-item">
                          {isEditing ? (
                            <>
                              <input
                                className="text-input"
                                value={editingCourseName}
                                onChange={(e) => setEditingCourseName(e.target.value)}
                                placeholder="Course name"
                              />
                              <div style={{ display: "flex", gap: 8 }}>
                                <button className="primary-button" onClick={saveCourseName}>
                                  Save
                                </button>
                                <button className="secondary-button" onClick={cancelEditCourse}>
                                  Cancel
                                </button>
                              </div>
                            </>
                          ) : (
                            <>
                              <span className="course-name">{c.name}</span>
                              {c.code ? <span className="course-code">({c.code})</span> : null}
                              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                                <button className="secondary-button" onClick={() => startEditCourse(c.id, c.name)}>
                                  Rename
                                </button>
                                <button className="logout-button" onClick={() => deleteCourse(c.id)}>
                                  Delete
                                </button>
                              </div>
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section className="settings-section">
                <h3>Security</h3>
                <button className="secondary-button" onClick={handleResetPassword}>
                  Forgot Password
                </button>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
