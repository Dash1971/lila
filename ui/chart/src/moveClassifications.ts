import type { TreeNodeBase } from 'lib/tree/types';

// Mobile Maia MoveClassification / AnalysisGraphPainter; EC EvalChart.CustomDot.
// Native Lichess judgments remain authoritative when glyphs coexist.
const classifications = [
  { id: 4, symbol: '??', name: 'Blunder', color: '#fa5252', advice: 'blunder' },
  { id: 2, symbol: '?', name: 'Mistake', color: '#fd7e14', advice: 'mistake' },
  { id: 6, symbol: '?!', name: 'Inaccuracy', color: '#fab005', advice: 'inaccuracy' },
  { id: 3, symbol: '!!', name: 'Brilliant', color: '#15aabf' },
  { id: 1, symbol: '!', name: 'Good', color: '#12b886' },
  { id: 5, symbol: '!?', name: 'Interesting', color: '#82c91e' },
] as const;

type MoveClassification = (typeof classifications)[number];

export const moveClassification = (node: TreeNodeBase): MoveClassification | undefined =>
  classifications.find(c => node.glyphs?.some(g => g.id === c.id));

export const classificationPoint = (
  node: TreeNodeBase,
  fallback: string,
  blurColor?: string,
): {
  classification?: MoveClassification;
  radius: number;
  color: string;
  border: string;
  borderWidth: number;
  style: 'rect' | 'circle';
} => {
  const classification = moveClassification(node);
  return {
    classification,
    radius: classification ? 4 : blurColor ? 5 : 0,
    color: classification?.color ?? blurColor ?? fallback,
    border: classification ? '#eeeeee' : (blurColor ?? fallback),
    borderWidth: classification ? 1 : 0,
    style: !classification && blurColor ? ('rect' as const) : ('circle' as const),
  };
};
