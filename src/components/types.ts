export interface DashboardProps { teacherId: string }

export interface Quiz {
  id: string;
  original_pdf: string | null;
  graded_pdf: string | null;
  feedback_pdf: string | null;
  summary_pdf: string | null;
  results_xls: string | null;
  score: number | null;
  created_at: string;
  extracted_text: string | null;
  formatted_text?: string | null;
  graded_json?: string | null;
  grading_mode?: string | null;
  title?: string | null;
  section?: string | null;
}

export type RubricSubpart = { label: string; max_marks: number; topic?: string };
export type RubricItem = {
  number: number;
  max_marks?: number;
  topic?: string;
  subparts?: RubricSubpart[];
};

export type Leniency =
  | "any_relevant_full"
  | "half_correct_full"
  | "quarter_correct_full"
  | "exact_only";
