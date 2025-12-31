import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import "../dashboard.css";
import Vapi from "@vapi-ai/web";

/**
 * ✅ Backend base URL
 */
const BACKEND_URL = "https://74db9a16064e.ngrok-free.app";


type Difficulty = "easy" | "medium" | "hard";
type VivaType = "basic" | "conceptual" | "application" | "critical";

type VivaConfig = {
  id: string;
  teacher_id: string;
  title: string | null;
  difficulty: Difficulty;
  viva_type: VivaType;
  extracted_text: string | null;
  questions?: any;
  questions_json?: any;
  material_pdf: string;
};

type VivaSession = {
  id: string;
  teacher_id: string;
  student_id: string | null;
  config_id: string;
  status: string;
  current_index: number;
  total_score: number;
  max_score: number;
  vapi_call_id: string | null;
};

type StudentRow = {
  id: string;
  name: string;
  roll_number?: string | null;
  section?: string | null;
};

async function safeReadJson(resp: Response) {
  const text = await resp.text();
  try {
    return { json: JSON.parse(text), raw: text };
  } catch {
    return { json: null, raw: text };
  }
}

async function postJson(url: string, body: any) {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const { json, raw } = await safeReadJson(resp);
  return { ok: resp.ok, status: resp.status, json, raw };
}

export default function TakeViva({ teacherId }: { teacherId: string }) {
  // =======================
  // ✅ UI state
  // =======================
  const [title, setTitle] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [vivaType, setVivaType] = useState<VivaType>("basic");

  // Marking scheme
  const [fullMarks, setFullMarks] = useState<number>(1);
  const [halfMarks, setHalfMarks] = useState<number>(0.5);
  const [zeroMarks, setZeroMarks] = useState<number>(0);

  // pdf upload
  const [file, setFile] = useState<File | null>(null);

  // progress
  const [uploading, setUploading] = useState(false);
  const [processingOCR, setProcessingOCR] = useState(false);
  const [generatingQuestions, setGeneratingQuestions] = useState(false);
  const [startingCall, setStartingCall] = useState(false);

  // DB returned
  const [config, setConfig] = useState<VivaConfig | null>(null);
  const [session, setSession] = useState<VivaSession | null>(null);

  // logs
  const [log, setLog] = useState<string[]>([]);
  const addLog = (msg: string) =>
    setLog((prev) => [`${new Date().toLocaleTimeString()} — ${msg}`, ...prev]);

  // number of questions
  const [numQuestions, setNumQuestions] = useState<number>(6);

  // OCR engine (backend supports auto/vision-pdf/openai-ocr/tesseract)
  const [ocrEngine, setOcrEngine] = useState<"auto" | "vision-pdf" | "openai-ocr" | "tesseract">("auto");

  // phone number (optional)
  const [phoneNumber, setPhoneNumber] = useState("");

  // web call state
  const vapiRef = useRef<any>(null);
  const [inWebCall, setInWebCall] = useState(false);

  // students
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");

  // helper
  const markingScheme = useMemo(
    () => ({ full: fullMarks, half: halfMarks, zero: zeroMarks }),
    [fullMarks, halfMarks, zeroMarks]
  );

  // ✅ SAFE QUESTIONS GETTER
  const questions = useMemo(() => {
    const q1 = (config as any)?.questions_json?.questions;
    const q2 = (config as any)?.questions_json;
    const q3 = (config as any)?.questions;

    if (Array.isArray(q1)) return q1;
    if (Array.isArray(q2)) return q2;
    if (Array.isArray(q3)) return q3;

    return [];
  }, [config]);

  // ============================================================
  // ✅ IMPORTANT: Ensure teachers.id == auth.uid()
  // Your RLS + FK setup expects teacherId to be a real teachers row id.
  // ============================================================
  useEffect(() => {
    (async () => {
      try {
        const { data: uRes } = await supabase.auth.getUser();
        const u = uRes?.user;

        addLog(`DEBUG teacherId prop = ${teacherId || "(empty)"}`);
        addLog(`DEBUG auth.uid()     = ${u?.id || "(no user)"}`);
        addLog(`DEBUG auth.email     = ${u?.email || "(no email)"}`);

        // If you’re logged in, ensure teacher row exists with id=auth.uid()
        if (u?.id && u?.email) {
          const { error } = await supabase.from("teachers").upsert(
            { id: u.id, email: u.email },
            { onConflict: "id" }
          );

          if (error) {
            addLog(`⚠️ teachers upsert failed (RLS?): ${error.message}`);
          } else {
            addLog("✅ teachers upsert ok (teachers.id == auth.uid())");
          }
        }
      } catch (e: any) {
        addLog(`⚠️ teacher bootstrap error: ${e?.message || String(e)}`);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============================================================
  // Load students for this teacher (optional)
  // ============================================================
  useEffect(() => {
    (async () => {
      try {
        if (!teacherId) return;

        const { data, error } = await supabase
          .from("students")
          .select("id,name,roll_number,section")
          .eq("teacher_id", teacherId)
          .order("name", { ascending: true });

        if (error) {
          addLog(`⚠️ failed to load students: ${error.message}`);
          return;
        }
        setStudents((data || []) as any);
      } catch (e: any) {
        addLog(`⚠️ students load error: ${e?.message || String(e)}`);
      }
    })();
  }, [teacherId]);

  // ============================================================
  // Refresh config from Supabase
  // ============================================================
  const refreshConfig = async (id: string) => {
    const { data: refreshed, error } = await supabase.from("viva_configs").select("*").eq("id", id).single();
    if (!error && refreshed) setConfig(refreshed as any);
    if (error) addLog(`⚠️ refreshConfig failed: ${error.message}`);
  };

  // ============================================================
  // Step 2: Upload material
  // ============================================================
  const uploadMaterial = async () => {
    if (!file) {
      alert("Please select a PDF file first.");
      return;
    }
    if (!teacherId) {
      alert("teacherId is empty. Make sure you pass auth.uid() as teacherId.");
      return;
    }

    setUploading(true);
    addLog("Uploading viva material...");

    try {
      const formData = new FormData();
      formData.append("file", file);

      formData.append("teacher_id", teacherId);
      formData.append("title", title || "Viva Material");
      formData.append("difficulty", difficulty);
      formData.append("viva_type", vivaType);
      formData.append("marking_scheme", JSON.stringify(markingScheme));

      addLog(`DEBUG upload-material teacher_id=${teacherId}`);

      const resp = await fetch(`${BACKEND_URL}/viva/upload-material`, {
        method: "POST",
        body: formData,
      });

      const { json, raw } = await safeReadJson(resp);
      if (!resp.ok) {
        console.error("UPLOAD FAIL:", { status: resp.status, json, raw });
        addLog(`❌ upload-material failed: HTTP ${resp.status} ${raw}`);
        throw new Error((json as any)?.error || raw || "Upload failed");
      }

      setConfig((json as any).config);
      addLog(`✅ Uploaded. Config created: ${(json as any).config.id}`);
    } catch (err: any) {
      console.error(err);
      addLog(`❌ Upload failed: ${err.message}`);
      alert(err.message);
    } finally {
      setUploading(false);
    }
  };

  // ============================================================
  // Step 3: OCR
  // ============================================================
  const processMaterialOCR = async () => {
    if (!config?.id) {
      alert("Upload material first.");
      return;
    }

    setProcessingOCR(true);
    addLog(`Running OCR using engine=${ocrEngine}...`);

    try {
      const resp = await fetch(`${BACKEND_URL}/viva/process-material/${config.id}?engine=${ocrEngine}`, {
        method: "POST",
      });

      const { json, raw } = await safeReadJson(resp);
      if (!resp.ok) {
        console.error("OCR FAIL:", { status: resp.status, json, raw });
        addLog(`❌ OCR failed: HTTP ${resp.status} ${raw}`);
        throw new Error((json as any)?.error || raw || "OCR failed");
      }

      addLog(`✅ OCR success. Extracted text length: ${(json as any)?.extracted_text_length || 0}`);
      await refreshConfig(config.id);
    } catch (err: any) {
      console.error(err);
      addLog(`❌ OCR failed: ${err.message}`);
      alert(err.message);
    } finally {
      setProcessingOCR(false);
    }
  };

  // ============================================================
  // Step 4: Generate questions
  // ============================================================
  const generateQuestions = async () => {
    if (!config?.id) {
      alert("Upload & OCR process material first.");
      return;
    }

    setGeneratingQuestions(true);
    addLog(`Generating ${numQuestions} questions...`);

    try {
      const resp = await fetch(`${BACKEND_URL}/viva/generate-questions/${config.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ num_questions: numQuestions }),
      });

      const { json, raw } = await safeReadJson(resp);
      if (!resp.ok) {
        console.error("GEN FAIL:", { status: resp.status, json, raw });
        addLog(`❌ generate-questions failed: HTTP ${resp.status} ${raw}`);
        throw new Error((json as any)?.error || raw || "Generate failed");
      }

      const qCount = Array.isArray((json as any)?.questions) ? (json as any).questions.length : 0;
      addLog(`✅ Generated ${qCount} questions`);
      await refreshConfig(config.id);
    } catch (err: any) {
      console.error(err);
      addLog(`❌ Generation failed: ${err.message}`);
      alert(err.message);
    } finally {
      setGeneratingQuestions(false);
    }
  };

  // ============================================================
  // Step 5: Create session  ✅ (FULL DEBUG)
  // ============================================================
  const createSession = async () => {
    if (!config?.id || questions.length === 0) {
      alert("Generate questions first.");
      return;
    }
    if (!teacherId) {
      alert("teacherId is empty. Make sure you pass auth.uid() as teacherId.");
      return;
    }

    addLog("Creating viva session...");

    const payload = {
      teacher_id: teacherId,
      student_id: selectedStudentId || null,
      config_id: config.id,
    };

    addLog(`DEBUG create-session payload = ${JSON.stringify(payload)}`);
    addLog(`DEBUG expecting insert into table: viva_sessions`);

    try {
      const result = await postJson(`${BACKEND_URL}/viva/create-session`, payload);

      if (!result.ok) {
        console.error("CREATE SESSION FAIL:", result);
        addLog(`❌ create-session failed: HTTP ${result.status} ${result.raw}`);
        throw new Error((result.json as any)?.error || result.raw || "Session creation failed");
      }

      const sess = (result.json as any)?.session;
      if (!sess?.id) {
        addLog(`⚠️ create-session response missing session.id: ${result.raw}`);
        throw new Error("Backend did not return session.id");
      }

      setSession(sess);
      addLog(`✅ Session created: ${sess.id}`);
      addLog(`✅ If you don't see it in Supabase, confirm you are checking viva_sessions table in the correct project.`);
    } catch (err: any) {
      console.error(err);
      addLog(`❌ Session creation failed: ${err.message}`);
      alert(err.message);
    }
  };

  // ============================================================
  // Start Viva WEB call (Vapi Web SDK)
  // NOTE: This does NOT update vapi_call_id in DB unless your Vapi events are persisted.
  // If you want DB updates, call your backend /viva/start-web-call/:sessionId (and then join that call).
  // ============================================================
  const startCall = async () => {
    if (!session?.id) {
      alert("Create session first.");
      return;
    }

    // Ask mic permission first
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      alert("Microphone permission is required. Please allow mic access and try again.");
      return;
    }

    setStartingCall(true);
    addLog("Starting Vapi WEB call...");

    try {
      const publicKey = import.meta.env.VITE_VAPI_PUBLIC_KEY;
      const assistantId = import.meta.env.VITE_VAPI_ASSISTANT_ID;

      if (!publicKey || !assistantId) {
        throw new Error("Missing VITE_VAPI_PUBLIC_KEY or VITE_VAPI_ASSISTANT_ID in frontend env.");
      }

      if (!vapiRef.current) {
        vapiRef.current = new Vapi(publicKey);

        vapiRef.current.on("call-start", (call: any) => {
          setInWebCall(true);
          addLog(`✅ Web call started`);
          // Try to log call id if provided by SDK:
          const callId = call?.id || call?.call?.id;
          if (callId) addLog(`DEBUG vapi call id = ${callId}`);
          setSession((prev: any) => (prev ? { ...prev, status: "in_progress" } : prev));
        });

        vapiRef.current.on("call-end", () => {
          setInWebCall(false);
          addLog("✅ Web call ended");
        });

        vapiRef.current.on("error", (e: any) => {
          addLog(`❌ Vapi error: ${e?.message || JSON.stringify(e)}`);
        });
      }

      await vapiRef.current.start(assistantId, {
        customerJoinTimeoutSeconds: 60,
        variableValues: {
          session_id: session.id,
          teacher_id: teacherId,
        },
      });
    } catch (err: any) {
      console.error(err);
      addLog(`❌ Start web call failed: ${err.message}`);
      alert(err.message);
    } finally {
      setStartingCall(false);
    }
  };

  const stopWebCall = async () => {
    try {
      await vapiRef.current?.stop?.();
      addLog("🛑 Stopped web call");
    } catch {}
  };

  // =======================
  // Render
  // =======================
  return (
    <div className="panel" style={{ maxWidth: 920, margin: "0 auto" }}>
      <h2 className="panel-title">🎙️ Take Viva (Vapi Integration)</h2>

      {/* Debug */}
      <section style={{ padding: 16, border: "1px dashed #ddd", borderRadius: 10, marginBottom: 16 }}>
        <div className="muted" style={{ fontSize: 13 }}>
          <div><b>DEBUG</b></div>
          <div>teacherId prop: <b>{teacherId || "(empty)"}</b></div>
          <div>configId: <b>{config?.id || "(none)"}</b></div>
          <div>sessionId: <b>{session?.id || "(none)"}</b></div>
        </div>
      </section>

      {/* Step 2 Upload */}
      <section style={{ padding: 16, border: "1px solid #eee", borderRadius: 10, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Step 2 — Upload Viva Material (PDF)</h3>

        <div className="form-row">
          <label>Title</label>
          <input className="text-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. OOP Viva" />
        </div>

        <div className="form-row">
          <label>Difficulty</label>
          <select className="text-input" value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>

        <div className="form-row">
          <label>Viva Type</label>
          <select className="text-input" value={vivaType} onChange={(e) => setVivaType(e.target.value as VivaType)}>
            <option value="basic">Basic Understanding</option>
            <option value="conceptual">Conceptual</option>
            <option value="application">Application</option>
            <option value="critical">Critical Thinking</option>
          </select>
        </div>

        <div className="form-row">
          <label>Marking Scheme</label>
          <div style={{ display: "flex", gap: 10 }}>
            <input className="text-input" type="number" step="0.5" value={fullMarks} onChange={(e) => setFullMarks(Number(e.target.value))} placeholder="Full" />
            <input className="text-input" type="number" step="0.5" value={halfMarks} onChange={(e) => setHalfMarks(Number(e.target.value))} placeholder="Half" />
            <input className="text-input" type="number" step="0.5" value={zeroMarks} onChange={(e) => setZeroMarks(Number(e.target.value))} placeholder="Zero" />
          </div>
        </div>

        <div className="form-row">
          <label>PDF File</label>
          <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </div>

        <button className="primary-button" disabled={uploading} onClick={uploadMaterial}>
          {uploading ? "Uploading..." : "Upload Material"}
        </button>

        {config?.id && (
          <div className="muted" style={{ marginTop: 10 }}>
            ✅ Config ID: <b>{config.id}</b>
          </div>
        )}
      </section>

      {/* Step 3 OCR */}
      <section style={{ padding: 16, border: "1px solid #eee", borderRadius: 10, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Step 3 — OCR Process</h3>

        <div className="form-row">
          <label>OCR Engine</label>
          <select className="text-input" value={ocrEngine} onChange={(e) => setOcrEngine(e.target.value as any)}>
            <option value="auto">Auto</option>
            <option value="vision-pdf">Google Vision PDF</option>
            <option value="openai-ocr">OpenAI Vision OCR</option>
            <option value="tesseract">Tesseract</option>
          </select>
        </div>

        <button className="primary-button" disabled={!config?.id || processingOCR} onClick={processMaterialOCR}>
          {processingOCR ? "Processing OCR..." : "Process Material OCR"}
        </button>

        {!!config?.extracted_text && (
          <div style={{ marginTop: 12 }}>
            <div className="muted">✅ Extracted Text Preview:</div>
            <textarea style={{ width: "100%", minHeight: 120 }} value={config.extracted_text.slice(0, 1200)} readOnly />
          </div>
        )}
      </section>

      {/* Step 4 Generate questions */}
      <section style={{ padding: 16, border: "1px solid #eee", borderRadius: 10, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Step 4 — Generate Questions</h3>

        <div className="form-row">
          <label>Number of Questions</label>
          <input className="text-input" type="number" min={3} max={12} value={numQuestions} onChange={(e) => setNumQuestions(Number(e.target.value))} />
        </div>

        <button className="primary-button" disabled={!config?.id || generatingQuestions} onClick={generateQuestions}>
          {generatingQuestions ? "Generating..." : "Generate Questions"}
        </button>

        {!!questions.length && (
          <div style={{ marginTop: 12 }}>
            <div className="muted">✅ Generated Questions Preview:</div>
            <ol>
              {questions.slice(0, 6).map((q: any, i: number) => (
                <li key={i}>
                  <b>{q.question}</b>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Difficulty: {q.difficulty} | Type: {q.type || q.viva_type}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>

      {/* Step 5 Create session */}
      <section style={{ padding: 16, border: "1px solid #eee", borderRadius: 10, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Step 5 — Create Session & Start Viva Call</h3>

        <div className="form-row">
          <label>Student (optional)</label>
          <select className="text-input" value={selectedStudentId} onChange={(e) => setSelectedStudentId(e.target.value)}>
            <option value="">(No student selected)</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.roll_number ? ` — ${s.roll_number}` : ""}
                {s.section ? ` (${s.section})` : ""}
              </option>
            ))}
          </select>
        </div>

        <button className="primary-button" disabled={!config?.id || questions.length === 0} onClick={createSession}>
          Create Viva Session
        </button>

        {session?.id && (
          <div className="muted" style={{ marginTop: 10 }}>
            ✅ Session ID: <b>{session.id}</b> | Status: <b>{session.status}</b>
          </div>
        )}

        <div className="form-row" style={{ marginTop: 12 }}>
          <label>Student Phone Number (optional)</label>
          <input className="text-input" placeholder="+92xxxxxxxxxx" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} />
        </div>

        <button className="primary-button" disabled={!session?.id || startingCall || inWebCall} onClick={startCall}>
          {startingCall ? "Starting Call..." : inWebCall ? "Call In Progress" : "Start Viva Call (Vapi)"}
        </button>

        {inWebCall && (
          <button className="primary-button" style={{ marginLeft: 10 }} onClick={stopWebCall}>
            Stop Call
          </button>
        )}
      </section>

      {/* Logs */}
      <section style={{ padding: 16, border: "1px solid #eee", borderRadius: 10 }}>
        <h3 style={{ marginTop: 0 }}>Live Logs</h3>
        <div style={{ maxHeight: 280, overflow: "auto", fontSize: 13 }}>
          {log.length === 0 ? (
            <div className="muted">No logs yet.</div>
          ) : (
            log.map((l, idx) => (
              <div key={idx} style={{ padding: "6px 0", borderBottom: "1px solid #f2f2f2" }}>
                {l}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
