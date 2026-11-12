/**
 * How each board family looks in 3D: the colour of the unprinted inside, the cut edge of the board, how much
 * fine grain the surface has (0 = smooth) and whether the edge shows corrugation (flutes). The outside colour is
 * the family's own `color` (units.ts). Typical looks, not supplier data.
 */
export interface BoardLook {
  readonly inside: string;
  readonly edge: string;
  /** 0 = smooth coated paper, 1 = visible fibre (kraft). */
  readonly grain: number;
  /** The cut edge shows a corrugated core between two liners. */
  readonly flute: boolean;
}

const LOOKS: Readonly<Record<string, BoardLook>> = {
  // White card: white printed face, grey-ish back; the cut edge shows the solid grey-cream core.
  "white-paperboard": { inside: "#e2dfd8", edge: "#d6d1c6", grain: 0.2, flute: false },
  "kraft-paperboard": { inside: "#bd9763", edge: "#a8814f", grain: 1, flute: false },
  // Coated art paper: smooth and white on both sides.
  "art-paper": { inside: "#f1f0ea", edge: "#e4e1d8", grain: 0, flute: false },
  corrugated: { inside: "#bd9763", edge: "#b08a58", grain: 1, flute: true },
};

const DEFAULT_LOOK: BoardLook = { inside: "#c8a97e", edge: "#b8935f", grain: 0.6, flute: false };

export const boardLookOf = (typeId: string | undefined): BoardLook => (typeId ? (LOOKS[typeId] ?? DEFAULT_LOOK) : DEFAULT_LOOK);
