import type { BaselineRow, FusionTerm } from "./types";
import { VARIABLE_LABEL } from "./variables";

/** Convierte un término técnico de la fórmula en una frase que cualquiera entiende. */
export function factorSentence(term: FusionTerm, baseline: BaselineRow[]) {
  const name = VARIABLE_LABEL[term.variable_code] ?? term.variable_code;
  const base = baseline.find((b) => b.variable_code === term.variable_code);

  let direction = "se aleja de lo habitual";
  if (base?.baseline_median != null) {
    direction = term.last_value > base.baseline_median ? "por encima de lo habitual" : "por debajo de lo habitual";
  }

  const sustained = term.persistence >= 0.6;
  const timing = sustained ? "se mantiene sostenido, no fue algo pasajero" : "apareció de forma puntual";

  return { name, direction, timing, sustained };
}
