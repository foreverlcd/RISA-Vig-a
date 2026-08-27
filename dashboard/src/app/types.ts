export type EvidenceRole = "PRIMARY" | "SUPPORTING" | "CONTEXT" | "QUALITY";

export interface EvidenceRow {
  source_file: string;
  record_id: string;
  variable_code: string;
  event_datetime: string;
  available_datetime: string;
  evidence_role: EvidenceRole;
  contribution: number | string | null;
}

export interface BaselineRow {
  variable_code: string;
  baseline_median: number | null;
  baseline_mad: number | null;
  last_value: number;
  as_of: string;
}

export interface FusionTerm {
  variable_code: string;
  domain: string;
  analysis_role: string;
  last_value: number;
  deviation_evidence: number;
  trend: number;
  persistence: number;
  context_damped_evidence: number;
  weight: number;
  term: number;
}

export interface HistoryPoint {
  signal_id: string;
  decision_datetime: string;
  risk_score: number;
  priority_level: PriorityLevel;
}

export type PriorityLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface Signal {
  signal_id: string;
  patient_id: string;
  decision_datetime: string;
  risk_score: number;
  priority_level: PriorityLevel;
  confidence_score: number;
  evidence_start: string;
  evidence_end: string;
  explanation: string;
  model_version: string;
  evidence: EvidenceRow[];
  baseline: BaselineRow[];
  fusion_terms: FusionTerm[];
  patient_history: HistoryPoint[];
}

export interface NoSignalPatient {
  patient_id: string;
  baseline: BaselineRow[];
}

export interface DashboardData {
  no_signal_patients: NoSignalPatient[];
  stats: {
    total_signals: number;
    total_patients_monitored: number;
    total_patients: number;
    patients_without_signal: number;
    by_priority: Record<PriorityLevel, number>;
    model_version: string | null;
    avg_confidence: number | null;
  };
  signals: Signal[];
}
