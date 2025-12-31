import { useRef, useState } from "react";
import "../upload.css"; // new styles (no inline CSS)

interface Props {
  teacherId: string;
  onUploadComplete?: (quizId: string) => void;
}

export default function FileUpload({ teacherId, onUploadComplete }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [quizTitle, setQuizTitle] = useState<string>("");
  const [quizSection, setQuizSection] = useState<string>("");

  const [busy, setBusy] = useState(false);

  async function handleUpload() {
    if (!fileRef.current || !fileRef.current.files || fileRef.current.files.length === 0) {
      alert("Please choose a PDF first.");
      return;
    }
    setBusy(true);
    try {
      const file = fileRef.current.files[0];
      const form = new FormData();
      form.append("file", file);

      const url = new URL("http://localhost:5000/upload");
      url.searchParams.set("teacher_id", teacherId);
      if (quizTitle.trim())  url.searchParams.set("title", quizTitle.trim());
      if (quizSection.trim()) url.searchParams.set("section", quizSection.trim());

      const res = await fetch(url.toString(), { method: "POST", body: form });
      const j = await res.json();
      if (!res.ok || !j?.success) {
        throw new Error(j?.error || "Upload failed");
      }

      const newId = j?.row?.[0]?.id || j?.row?.id || null;
      if (newId && onUploadComplete) onUploadComplete(newId);
      alert("Uploaded!");
    } catch (e: any) {
      alert(e.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fu">
      <div className="fu-row">
        {/* <div className="fu-field">
          <label className="fu-label"></label>
          <input
            className="fu-input"
            type="text"
            placeholder="e.g., Quiz 1"
            value={quizTitle}
            onChange={(e) => setQuizTitle(e.target.value)}
          />
        </div> */}

        {/* <div className="fu-field">
          <label className="fu-label"></label>
          <input
            className="fu-input"
            type="text"
            placeholder="e.g., Section A"
            value={quizSection}
            onChange={(e) => setQuizSection(e.target.value)}
          />
        </div> */}
      </div>

      <input className="fu-file" type="file" accept="application/pdf" ref={fileRef} />
      <button className="fu-button" onClick={handleUpload} disabled={busy}>
        {busy ? "Uploading…" : "Upload PDF"}
      </button>
    </div>
  );
}
