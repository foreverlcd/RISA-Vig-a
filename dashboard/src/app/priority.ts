import type { EvidenceRole, PriorityLevel } from "./types";

export const PRIORITY_STYLES: Record<PriorityLevel, { badge: string; row: string; dot: string; hex: string }> = {
  CRITICAL: { badge: "border badge-critical", row: "border-l-4 row-critical", dot: "dot-critical", hex: "#b3271e" },
  HIGH: { badge: "border badge-high", row: "border-l-4 row-high", dot: "dot-high", hex: "#a3560a" },
  MEDIUM: { badge: "border badge-moderate", row: "border-l-4 row-moderate", dot: "dot-moderate", hex: "#93720a" },
  LOW: { badge: "border badge-low", row: "border-l-4 row-low", dot: "dot-low", hex: "#55605d" },
};

export const PRIORITY_ORDER: PriorityLevel[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

export const PRIORITY_LABEL_ES: Record<PriorityLevel, string> = {
  CRITICAL: "Urgente", HIGH: "Alto", MEDIUM: "Moderado", LOW: "Bajo",
};

export const PRIORITY_DESC_ES: Record<PriorityLevel, string> = {
  CRITICAL: "Revisar de inmediato",
  HIGH: "Revisar hoy",
  MEDIUM: "Vigilar de cerca",
  LOW: "Sin señal preocupante",
};

export const ROLE_STYLES: Record<EvidenceRole, string> = {
  PRIMARY: "border badge-critical",
  SUPPORTING: "border badge-high",
  CONTEXT: "border border-sky-200 bg-sky-50 text-sky-700",
  QUALITY: "border border-violet-200 bg-violet-50 text-violet-700",
};

export const ROLE_LABEL: Record<EvidenceRole, string> = {
  PRIMARY: "Primaria",
  SUPPORTING: "Soporte",
  CONTEXT: "Contexto",
  QUALITY: "Calidad",
};
