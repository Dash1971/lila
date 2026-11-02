import { attributesModule, eventListenersModule, init, type VNode } from 'snabbdom';

import type AnalyseCtrl from '../ctrl';
import { LocalAnalysisDialog } from './localAnalysisDialog';

interface InlineJob {
  busy: boolean;
  dispose(): void;
}
const jobs = new WeakMap<AnalyseCtrl, InlineJob>();

// Only the presentation is inline. The existing local-review runner owns the
// engine, saved analysis, classifications and cancellation throughout the job.
export async function inlineAnalysis(ctrl: AnalyseCtrl): Promise<void> {
  if (!ctrl.canAnalyseMainline()) return;
  ctrl.settings.set('showMainlineAnalysis', true);
  if (ctrl.synthetic) ctrl.noSweat!.boardReview.showComputerAnalysis();
  else $('.analyse__underboard__menu [data-panel="computer-analysis"]').trigger('click');
  const previous = jobs.get(ctrl);
  if (previous?.busy) return;
  previous?.dispose();
  const panel = document.querySelector<HTMLElement>('.analyse__underboard__panels > .computer-analysis');
  if (!panel) return;
  const host = document.createElement('div');
  host.className = 'nosweat-inline-analysis';
  host.textContent = 'Preparing analysis…';
  panel.append(host);
  panel.classList.add('nosweat-analysis-running');
  let state: LocalAnalysisDialog | undefined;
  let disposed = false;
  const observer = new MutationObserver(() => {
    if (!host.isConnected) dispose();
  });
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    state?.close();
    observer.disconnect();
    window.removeEventListener('pagehide', dispose);
    host.remove();
    panel.classList.remove('nosweat-analysis-running');
    if (!job.busy && jobs.get(ctrl) === job) jobs.delete(ctrl);
  };
  const job: InlineJob = { busy: true, dispose };
  jobs.set(ctrl, job);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('pagehide', dispose);
  try {
    await site.asset.loadI18n('localAnalysis');
    if (disposed) return;
    state = new LocalAnalysisDialog(ctrl);
    const patch = init([attributesModule, eventListenersModule]);
    const placeholder = document.createElement('div');
    host.replaceChildren(placeholder);
    let vnode: VNode | Element = placeholder;
    const redraw = () => {
      if (!disposed) vnode = patch(vnode, state!.renderInline(redraw));
    };
    await state.analyse({ inline: true, close: dispose }, redraw);
  } catch (error) {
    if (!disposed) host.textContent = `Analysis failed: ${String(error)}`;
  } finally {
    job.busy = false;
    state?.close();
    if (!disposed) panel.classList.remove('nosweat-analysis-running');
    else if (jobs.get(ctrl) === job) jobs.delete(ctrl);
  }
}
