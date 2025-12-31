import React, { useEffect, useMemo, useState } from "react";
import type { Quiz } from "../types";
import { baseNameFor } from "../utils/names";
import { createClient } from "@supabase/supabase-js";
import "../excel.css"; // new stylesheet (no inline styles)

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_ANON_KEY!
);

interface Props {
  quizzes: Quiz[];
  loading: boolean;
}

type Course = { id: string; name: string };
type Section = { id: string; name: string; course_id: string };

const ExcelPanel: React.FC<Props> = ({ quizzes, loading }) => {
  // Defensive: normalize
  const list = Array.isArray(quizzes) ? quizzes : [];

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

  // Filter quizzes by chosen course/section.
  const filtered = useMemo(() => {
    let arr = list;

    if (selectedCourseId) {
      arr = arr.filter(q =>
        (q as any).course_id === selectedCourseId ||
        (q as any).courseId === selectedCourseId ||
        true
      );
    }

    if (selectedSectionId) {
      arr = arr.filter(q =>
        (q as any).section_id === selectedSectionId ||
        (q as any).sectionId === selectedSectionId ||
        (q as any).section === selectedSectionName
      );
    }

    return arr;
  }, [list, selectedCourseId, selectedSectionId, selectedSectionName]);

  return (
    <div className="panel">
      <h2 className="xp-title">Previous Results (Excel / CSV)</h2>

      {/* Teacher Course → Section picker */}
      <div className="xp-filter">
        <div className="xp-filter-group">
          <label className="xp-label">Course:</label>
          <select
            className="xp-select xp-select-course"
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

        <div className="xp-filter-group">
          <label className="xp-label">Section:</label>
          <select
            className="xp-select xp-select-section"
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

      {loading && <p className="xp-loading">Loading...</p>}

      {!loading && filtered.length === 0 && (
        <div className="xp-empty">
          <p>No quizzes found yet.</p>
          <p>Upload & grade a quiz first, then come back to download the CSV.</p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <ul className="xp-list">
          {filtered.map((q) =>
            q.results_xls ? (
              <li key={q.id} className="xp-item">
                <div className="xp-meta">
                  <strong>Title:</strong> {q.title || `quiz_${q.id}`}{" "}
                  {q.section ? (
                    <span>
                      {" "}| <strong>Section:</strong> {q.section}
                    </span>
                  ) : null}
                </div>

                <div className="xp-actions">
                  {/* <a
                    className="link"
                    href={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/results/${q.results_xls}`}
                    target="_blank"
                  >
                    📊 Open results file — {new Date(q.created_at).toLocaleString()}
                  </a> */}

                  <button
                    className="btn btn-primary"
                    onClick={async () => {
                      try {
                        const url = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/results/${q.results_xls}`;
                        const res = await fetch(url);
                        const blob = await res.blob();
                        const a = document.createElement("a");
                        const dl = URL.createObjectURL(blob);
                        a.href = dl;
                        const base = baseNameFor(q.id, filtered);
                        a.download = `${base}_results.csv`;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        URL.revokeObjectURL(dl);
                      } catch (e: any) {
                        alert(`Download failed: ${e.message}`);
                      }
                    }}
                  >
                    ⬇️ Download CSV (named)
                  </button>
                </div>
              </li>
            ) : (
              <li key={q.id} className="xp-item">
                <div className="xp-meta">
                  <strong>Title:</strong> {q.title || `quiz_${q.id}`}{" "}
                  {q.section ? (
                    <span>
                      {" "}| <strong>Section:</strong> {q.section}
                    </span>
                  ) : null}
                </div>
                <div className="xp-no-file">
                  No results file — {new Date(q.created_at).toLocaleString()}
                </div>
              </li>
            )
          )}
        </ul>
      )}
    </div>
  );
};

export default ExcelPanel;
