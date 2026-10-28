import { classify, type ClassificationInput } from './noSweatClassify';
self.onmessage = (event: MessageEvent<ClassificationInput>) => {
  try {
    self.postMessage({ result: classify(event.data) });
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
