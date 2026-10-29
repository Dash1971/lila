import { classify, naiveMaterial, type ClassificationInput } from './noSweatClassify';
const material = new Map<string, number>();
const evaluate = (fen: string): number => {
  if (material.has(fen)) return material.get(fen)!;
  const value = naiveMaterial(fen);
  material.set(fen, value);
  if (material.size > 4000) material.delete(material.keys().next().value!);
  return value;
};
self.onmessage = (event: MessageEvent<ClassificationInput>) => {
  try {
    self.postMessage({ result: classify(event.data, evaluate) });
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
