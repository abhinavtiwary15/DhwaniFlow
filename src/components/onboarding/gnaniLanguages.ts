export interface GnaniLanguageOption {
  code: string;
  label: string;
}

export const GNANI_LANGUAGES: GnaniLanguageOption[] = [
  { code: "hi-IN", label: "Hindi / Hinglish (hi-IN)" },
  { code: "en-IN", label: "Indian English (en-IN)" },
  { code: "indic-auto", label: "Auto-detect Indic (indic-auto)" },
  { code: "ta-IN", label: "Tamil (ta-IN)" },
  { code: "te-IN", label: "Telugu (te-IN)" },
  { code: "kn-IN", label: "Kannada (kn-IN)" },
  { code: "mr-IN", label: "Marathi (mr-IN)" },
  { code: "bn-IN", label: "Bengali (bn-IN)" },
  { code: "gu-IN", label: "Gujarati (gu-IN)" },
  { code: "pa-IN", label: "Punjabi (pa-IN)" },
  { code: "ml-IN", label: "Malayalam (ml-IN)" },
  { code: "ur-IN", label: "Urdu (ur-IN)" },
  { code: "or-IN", label: "Odia (or-IN)" },
  { code: "as-IN", label: "Assamese (as-IN)" },
];
