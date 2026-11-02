import type AnalyseCtrl from '../ctrl';
import { inlineAnalysis } from './inlineAnalysis';
import { localAnalysisDialog } from './localAnalysisDialog';

export async function initModule(input: AnalyseCtrl | { ctrl: AnalyseCtrl; start: boolean }): Promise<void> {
  const options = 'ctrl' in input ? input : { ctrl: input, start: false };
  if (options.start && options.ctrl.noSweat && !options.ctrl.study && !options.ctrl.opts.study)
    return inlineAnalysis(options.ctrl);
  await site.asset.loadI18n('localAnalysis');
  return localAnalysisDialog(options.ctrl, options.start);
}
