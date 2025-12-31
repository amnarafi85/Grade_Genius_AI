// RubricBuilder.tsx
import React from "react";
import type { RubricItem, RubricSubpart } from "../types";
import "../rubric-builder.css";

type Row = { number: number; topic: string; maxMarks: string; subpartsRaw: string };

export function computeRubricPayload(rubricRows: Row[]): RubricItem[] {
  return rubricRows.map((r) => {
    const item: RubricItem = { number: r.number };
    if (r.topic.trim()) item.topic = r.topic.trim();
    const mm = parseFloat(r.maxMarks);
    if (!Number.isNaN(mm) && mm >= 0) item.max_marks = mm;
    const subs: RubricSubpart[] = [];
    r.subpartsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((p) => {
        const [label, val, maybeTopic] = p.split(":").map((x) => x.trim());
        const n = parseFloat(val);
        if (label && !Number.isNaN(n)) {
          const sp: RubricSubpart = { label, max_marks: n };
          if (maybeTopic) sp.topic = maybeTopic;
          subs.push(sp);
        }
      });
    if (subs.length) item.subparts = subs;
    return item;
  });
}

interface Props {
  totalQuestions: number;
  setTotalQuestions: (n: number) => void;
  rubricRows: Row[];
  setRubricRows: (rows: Row[]) => void;
  title?: string;       // optional section title text
  textareaHint?: string;
}

const RubricBuilder: React.FC<Props> = ({
  totalQuestions,
  setTotalQuestions,
  rubricRows,
  setRubricRows,
  title = "Rubric (Optional)",
}) => {
  return (
    <div className="panel rb">
      <div className="rb-header">
        <h3 className="rb-title">{title}</h3>
        <p className="rb-subtitle">
          Define marks per question and optional subparts. <em>Subparts format:</em>{" "}
          <code>a:2,b:3</code> or <code>a:2:Stacks topic,b:3:Queues</code>
        </p>
      </div>

      <div className="rb-controls">
        <label className="rb-label" htmlFor="totalQuestions">Total Questions:</label>
        <input
          id="totalQuestions"
          className="rb-input rb-input--number"
          type="number"
          min={0}
          value={totalQuestions}
          onChange={(e) => setTotalQuestions(parseInt(e.target.value || "0", 10))}
          placeholder="e.g., 5"
        />
      </div>

      {rubricRows.length > 0 && (
        <div className="rb-table-wrap">
          <table className="rb-table">
            <thead>
              <tr>
                <th className="rb-th rb-col-narrow">#</th>
                <th className="rb-th">Topic</th>
                <th className="rb-th rb-col-medium">Max Marks</th>
                <th className="rb-th">Subparts</th>
              </tr>
            </thead>
            <tbody>
              {rubricRows.map((row) => (
                <tr key={row.number} className="rb-tr">
                  <td className="rb-td rb-col-narrow">{row.number}</td>
                  <td className="rb-td">
                    <input
                      className="rb-input"
                      value={row.topic}
                      onChange={(e) => {
                        const v = e.target.value;
                        setRubricRows((r) =>
                          r.map((x) => (x.number === row.number ? { ...x, topic: v } : x))
                        );
                      }}
                      placeholder="e.g., Trees / Sorting"
                    />
                  </td>
                  <td className="rb-td rb-col-medium">
                    <input
                      className="rb-input"
                      value={row.maxMarks}
                      onChange={(e) => {
                        const v = e.target.value;
                        setRubricRows((r) =>
                          r.map((x) => (x.number === row.number ? { ...x, maxMarks: v } : x))
                        );
                      }}
                      placeholder="e.g., 5"
                    />
                  </td>
                  <td className="rb-td">
                    <input
                      className="rb-input"
                      value={row.subpartsRaw}
                      onChange={(e) => {
                        const v = e.target.value;
                        setRubricRows((r) =>
                          r.map((x) => (x.number === row.number ? { ...x, subpartsRaw: v } : x))
                        );
                      }}
                      placeholder="e.g., a:2,b:3 or a:2:Stacks,b:3:Queues"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default RubricBuilder;
