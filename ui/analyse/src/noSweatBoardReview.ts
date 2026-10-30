import type { AcplChart, ChartGame } from 'chart';

import { licon } from 'lib/licon';
import { pubsub } from 'lib/pubsub';
import { bind, confirm, hl, onInsert, type VNode } from 'lib/view';

import type AnalyseCtrl from './ctrl';

// The free board uses the same local review, chart and summary as game replay.
// Only the under-board shell differs: editable FEN/PGN replaces game exports.
export class BoardReview {
  private selected = 'computer-analysis';
  private panel?: HTMLElement;
  private chart?: AcplChart;
  private pending = false;
  private generation = 0;
  private dirty = false;
  private failed = false;
  private button?: HTMLButtonElement;

  constructor(private readonly ctrl: AnalyseCtrl) {}

  view(inputs?: VNode): VNode {
    this.sync();
    const tab = (id: string, label: string) =>
      hl(
        'button',
        {
          attrs: { type: 'button', role: 'tab', 'aria-selected': String(this.selected === id) },
          class: { active: this.selected === id },
          hook: bind('click', () => {
            this.selected = id;
            if (id === 'computer-analysis') this.ctrl.settings.set('showMainlineAnalysis', true);
            this.ctrl.redraw();
            this.chart?.resize();
          }),
        },
        label,
      );
    return hl(
      'div.analyse__underboard',
      {
        hook: onInsert(elm => this.ctrl.noSweat?.mountOpening(elm)),
      },
      [
        hl('div.analyse__underboard__menu', { attrs: { role: 'tablist' } }, [
          tab('computer-analysis', i18n.site.computerAnalysis),
          tab('fen-pgn', i18n.study.shareAndExport),
        ]),
        hl('div.analyse__underboard__panels', [
          hl('div.computer-analysis', {
            class: { active: this.selected === 'computer-analysis' },
            hook: {
              ...onInsert(elm => {
                this.panel = elm;
                pubsub.on('analysis.server.progress', this.onAnalysis);
                this.sync();
              }),
              destroy: () => {
                this.reset();
                this.panel = undefined;
                pubsub.off('analysis.server.progress', this.onAnalysis);
              },
            },
          }),
          hl('div.fen-pgn', { class: { active: this.selected === 'fen-pgn' } }, [inputs]),
        ]),
      ],
    );
  }

  private readonly start = () => {
    if (!this.ctrl.canAnalyseMainline()) return;
    this.ctrl.settings.set('showMainlineAnalysis', true);
    void site.asset.loadEsm('analyse.local', { init: { ctrl: this.ctrl, start: true } });
  };

  private readonly clear = async () => {
    if (await confirm(i18n.study.clearLocal)) await this.ctrl.idbTree.clear('analysis');
  };

  private readonly onAnalysis = () => {
    this.dirty = true;
  };

  private reset(): void {
    this.generation++;
    if (this.chart) {
      pubsub.off('ply', this.chart.selectPly);
      this.chart.destroy();
    }
    this.chart = undefined;
    this.pending = false;
    this.failed = false;
    this.panel?.replaceChildren();
    this.button = undefined;
  }

  sync(): void {
    const panel = this.panel;
    if (!panel) return;
    if (!this.ctrl.mainlineAnalysis) {
      if (this.chart || this.pending) this.reset();
      if (!this.button) {
        this.button = document.createElement('button');
        this.button.type = 'button';
        this.button.className = 'button text';
        this.button.dataset.icon = licon.Cogs;
        this.button.onclick = this.start;
        panel.append(this.button);
      }
      this.button.disabled = !this.ctrl.canAnalyseMainline();
      this.button.textContent = this.button.disabled ? 'Add moves to analyze' : 'Analyze game';
      return;
    }
    if (this.chart) {
      if (this.dirty) this.chart.updateData(this.ctrl.data, this.ctrl.mainline);
      this.dirty = false;
      return;
    }
    if (this.pending || this.failed) return;
    this.reset();
    const generation = this.generation;
    this.pending = true;
    const container = document.createElement('div');
    container.id = 'acpl-chart-container';
    container.className = 'analysis-chart nosweat-chart';
    const actions = document.createElement('div');
    actions.className = 'analysis-chart-actions';
    for (const [label, icon, click] of [
      ['Analyze game', licon.Cogs, this.start],
      [i18n.study.clearLocal, licon.X, this.clear],
    ] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.title = label;
      button.setAttribute('aria-label', label);
      button.dataset.icon = icon;
      button.onclick = click;
      actions.append(button);
    }
    const plot = document.createElement('div');
    plot.className = 'analysis-chart-plot';
    const canvas = document.createElement('canvas');
    canvas.id = 'acpl-chart';
    plot.append(canvas);
    container.append(actions, plot);
    panel.append(container);
    void site.asset
      .loadEsm<ChartGame>('chart.game')
      .then(async module => {
        if (generation !== this.generation || !canvas.isConnected) return;
        const chart = await module.acpl(canvas, this.ctrl.data, this.ctrl.mainline);
        if (generation !== this.generation || !canvas.isConnected) {
          pubsub.off('ply', chart.selectPly);
          chart.destroy();
          return;
        }
        this.chart = chart;
        this.pending = false;
        this.dirty = true;
        this.sync();
      })
      .catch(() => {
        if (generation !== this.generation) return;
        this.reset();
        this.failed = true;
        const retry = document.createElement('button');
        retry.className = 'button';
        retry.textContent = 'Retry graph';
        retry.onclick = () => {
          this.failed = false;
          this.sync();
        };
        panel.append(retry);
      });
  }
}
