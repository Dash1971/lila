import type AnalyseCtrl from '../ctrl';
import { localAnalysisDialog } from './localAnalysisDialog';

export async function initModule(input: AnalyseCtrl | { ctrl: AnalyseCtrl; start: boolean }): Promise<void> {
  await site.asset.loadI18n('localAnalysis');
  const options = 'ctrl' in input ? input : { ctrl: input, start: false };
  return localAnalysisDialog(options.ctrl, options.start);
}
