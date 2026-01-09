import { useEffect, useMemo, useRef, useState } from "react";
import "../upload.css"; // updated styles

interface Props {
  teacherId: string;
  onUploadComplete?: (quizId: string) => void;
}

export default function FileUpload({ teacherId, onUploadComplete }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);

  // keep your existing (currently unused) state — NOT removed
  const [quizTitle, setQuizTitle] = useState<string>("");
  const [quizSection, setQuizSection] = useState<string>("");

  const [busy, setBusy] = useState(false);

  // NEW (UI-only): show selected file + drag state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);

  // keep input + selectedFile in sync (covers "choose file" via file picker)
  useEffect(() => {
    const el = fileRef.current;
    if (!el) return;

    const onChange = () => {
      const f = el.files?.[0] ?? null;
      setSelectedFile(f);
    };

    el.addEventListener("change", onChange);
    return () => el.removeEventListener("change", onChange);
  }, []);

  function openPicker() {
    fileRef.current?.click();
  }

  function clearFile() {
    if (fileRef.current) fileRef.current.value = "";
    setSelectedFile(null);
  }

  function formatBytes(bytes: number) {
    if (!Number.isFinite(bytes)) return "";
    const kb = bytes / 1024;
    if (kb < 1024) return `${Math.round(kb)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
  }

  // best-effort: show “1 page” like screenshot (without OCR)
  // Many PDFs don’t expose page count without parsing; we’ll show "— pages" if unknown
  const fileMetaLine = useMemo(() => {
    if (!selectedFile) return "";
    const size = formatBytes(selectedFile.size);
    // Page count is unknown without parsing; show placeholder like UI.
    // If you later add backend-returned page count, you can display it here.
    return `${"— pages"} • ${size}`;
  }, [selectedFile]);

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

      const url = new URL("https://grade-genius-ai-backend.onrender.com/upload");
      url.searchParams.set("teacher_id", teacherId);
      if (quizTitle.trim()) url.searchParams.set("title", quizTitle.trim());
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

  // Drag & drop handlers (UI only)
  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  }

  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);

    const f = e.dataTransfer.files?.[0];
    if (!f) return;

    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      alert("Please drop a PDF file.");
      return;
    }

    // Put file into the hidden input so your handleUpload() still works unchanged
    if (fileRef.current) {
      const dt = new DataTransfer();
      dt.items.add(f);
      fileRef.current.files = dt.files;
    }
    setSelectedFile(f);
  }

  return (
    <div className={`fu ${busy ? "fu-loading" : ""}`}>
      {/* Hidden native input (still used for upload) */}
      <input
        className="fu-hidden"
        type="file"
        accept="application/pdf"
        ref={fileRef}
      />

      {/* Dropzone */}
      <div
        className="fu-drop"
        data-dragging={dragging ? "true" : "false"}
        onClick={openPicker}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") openPicker();
        }}
        aria-label="Upload PDF dropzone"
      >
        {!selectedFile ? (
          <div className="fu-drop-inner">
            <div className="fu-drop-icon" aria-hidden>
              ⬆️
            </div>
            <div className="fu-drop-title">Drop your PDF here</div>
            <div className="fu-drop-sub">
              or <span className="fu-drop-link">browse</span> to select a file
            </div>
            <div className="fu-drop-hint">PDF only</div>
          </div>
        ) : (
          <div className="fu-filecard" onClick={(e) => e.stopPropagation()}>
            <div className="fu-file-ico" aria-hidden>
              📄
            </div>

            <div className="fu-file-info">
              <div className="fu-file-name">{selectedFile.name}</div>
              <div className="fu-file-meta">{fileMetaLine}</div>
            </div>

            <button
              type="button"
              className="fu-remove"
              onClick={clearFile}
              disabled={busy}
              aria-label="Remove selected file"
              title="Remove"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Upload action */}
      <div className="fu-actions">
        <button
          className="fu-button"
          onClick={handleUpload}
          disabled={busy || !selectedFile}
          title={!selectedFile ? "Choose a PDF first" : ""}
        >
          {busy ? "Uploading…" : "Upload PDF"}
        </button>
      </div>
    </div>
  );
}
