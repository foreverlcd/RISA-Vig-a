export const VARIABLE_LABEL: Record<string, string> = {
  HR: "Frecuencia cardíaca",
  RR: "Frecuencia respiratoria",
  SpO2: "Oxígeno en sangre",
  TEMP: "Temperatura",
  SBP: "Presión sistólica",
  DBP: "Presión diastólica",
  WEARABLE_HR: "FC (wearable)",
  STEPS: "Pasos",
  ACTIVITY_LEVEL: "Actividad",
  SLEEP_STATE: "Sueño",
  SIGNAL_QUALITY_INDEX: "Calidad de señal",
  LAB_A: "Marcador de laboratorio A",
  LAB_B: "Marcador de laboratorio B",
  LAB_C: "Marcador de laboratorio C",
  LAB_D: "Marcador de laboratorio D",
};

export const VARIABLE_UNIT: Record<string, string> = {
  HR: "bpm", RR: "rpm", SpO2: "%", TEMP: "°C", SBP: "mmHg", DBP: "mmHg", WEARABLE_HR: "bpm",
  LAB_A: "uA", LAB_B: "uB", LAB_C: "uC", LAB_D: "uD",
};

// Iconos mínimos, geométricos (no clínicos literales) — un glifo por variable,
// coherente con el trazo del resto del dashboard (currentColor, sin relleno).
export function VariableIcon({ code, className }: { code: string; className?: string }) {
  const common = { className, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (code) {
    case "HR":
    case "WEARABLE_HR":
      return (
        <svg {...common}>
          <path d="M3 12h4l2-7 4 14 2-7h6" />
        </svg>
      );
    case "RR":
      return (
        <svg {...common}>
          <path d="M3 15c2-6 4-6 6 0s4 6 6 0 4-6 6 0" />
        </svg>
      );
    case "SpO2":
      return (
        <svg {...common}>
          <path d="M12 3c3.5 4.5 6 7.8 6 11a6 6 0 0 1-12 0c0-3.2 2.5-6.5 6-11z" />
        </svg>
      );
    case "TEMP":
      return (
        <svg {...common}>
          <path d="M12 14.5V5a2 2 0 1 0-4 0v9.5a4 4 0 1 0 4 0z" />
        </svg>
      );
    case "SBP":
    case "DBP":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v4l3 2" />
        </svg>
      );
    case "LAB_A":
    case "LAB_B":
    case "LAB_C":
    case "LAB_D":
      return (
        <svg {...common}>
          <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3" />
        </svg>
      );
    case "STEPS":
      return (
        <svg {...common}>
          <path d="M8 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM16 12a2 2 0 1 1 0 4 2 2 0 0 1 0-4z" />
          <path d="M7 9v3l2 4M17 17v3l-2-4" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="7" />
        </svg>
      );
  }
}
