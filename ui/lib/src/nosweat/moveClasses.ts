export const moveClasses = [
  { symbol: '!!', id: 3, name: 'Brilliant', treeClass: 'brilliant', color: '#15aabf' },
  { symbol: '!', id: 1, name: 'Good', treeClass: 'good', color: '#12b886' },
  { symbol: '!?', id: 5, name: 'Interesting', treeClass: 'interesting', color: '#82c91e' },
  { symbol: '?!', id: 6, name: 'Dubious', treeClass: 'inaccuracy', color: '#fab005' },
  { symbol: '?', id: 2, name: 'Mistake', treeClass: 'mistake', color: '#fd7e14' },
  { symbol: '??', id: 4, name: 'Blunder', treeClass: 'blunder', color: '#fa5252' },
] as const;

// Native tree text, selection and hover shading all derive from these variables.
const treeColors: string = moveClasses.map(({ treeClass, color }) => `--c-${treeClass}:${color}`).join(';');

export function moveClassTheme(): string | false {
  return (
    typeof document !== 'undefined' && document.documentElement.dataset.brand === 'mutechess' && treeColors
  );
}
