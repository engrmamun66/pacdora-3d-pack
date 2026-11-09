/**
 * Illustrator target profiles. Data only, no scattered version checks.
 *
 * The PDF-level facts are documented by Adobe/Acrobat: PDF 1.3 (Acrobat 4) has
 * no live transparency, PDF 1.4 (Acrobat 5) adds transparency but no layers,
 * layers (optional content) need PDF 1.5 (Acrobat 6). Which PDF level each
 * Illustrator release opens is NOT verified here: every profile is
 * `tested: false` until a file has been opened in that real Illustrator version.
 */
export type IllustratorProfileId = "cc" | "cs6" | "cs5" | "cs4" | "cs3" | "cs2" | "cs" | "10" | "9" | "8";

export interface IllustratorProfile {
  readonly id: IllustratorProfileId;
  readonly label: string;
  /** True only after a real-application check. */
  readonly tested: boolean;
  /** null = .ai not offered for this version (EPS only). */
  readonly ai: null | {
    readonly pdfVersion: "1.3" | "1.4" | "1.5" | "1.7";
    readonly layers: boolean;
    readonly transparency: "live" | "flatten";
  };
  readonly eps: {
    readonly psLevel: 2 | 3;
  };
}

export const ILLUSTRATOR_PROFILES: readonly IllustratorProfile[] = [
  { id: "cc", label: "Illustrator CC (2013 and later)", tested: false, ai: { pdfVersion: "1.7", layers: true, transparency: "live" }, eps: { psLevel: 3 } },
  { id: "cs6", label: "Illustrator CS6", tested: false, ai: { pdfVersion: "1.5", layers: true, transparency: "live" }, eps: { psLevel: 3 } },
  { id: "cs5", label: "Illustrator CS5", tested: false, ai: { pdfVersion: "1.5", layers: true, transparency: "live" }, eps: { psLevel: 3 } },
  { id: "cs4", label: "Illustrator CS4", tested: false, ai: { pdfVersion: "1.5", layers: true, transparency: "live" }, eps: { psLevel: 3 } },
  { id: "cs3", label: "Illustrator CS3", tested: false, ai: { pdfVersion: "1.5", layers: true, transparency: "live" }, eps: { psLevel: 3 } },
  { id: "cs2", label: "Illustrator CS2", tested: false, ai: { pdfVersion: "1.5", layers: true, transparency: "live" }, eps: { psLevel: 3 } },
  { id: "cs", label: "Illustrator CS (11)", tested: false, ai: { pdfVersion: "1.5", layers: true, transparency: "live" }, eps: { psLevel: 3 } },
  { id: "10", label: "Illustrator 10", tested: false, ai: { pdfVersion: "1.4", layers: false, transparency: "live" }, eps: { psLevel: 2 } },
  { id: "9", label: "Illustrator 9", tested: false, ai: { pdfVersion: "1.3", layers: false, transparency: "flatten" }, eps: { psLevel: 2 } },
  // Illustrator 8 .ai files are PostScript-based, not PDF-based: only EPS is offered.
  { id: "8", label: "Illustrator 8", tested: false, ai: null, eps: { psLevel: 2 } },
];

export function getProfile(id: string): IllustratorProfile | undefined {
  return ILLUSTRATOR_PROFILES.find((p) => p.id === id);
}
