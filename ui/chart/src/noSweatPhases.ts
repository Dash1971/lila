import type { Plugin } from 'chart.js';

import { detectGamePhases, type PhasePosition } from 'lib/nosweat/phases';

import { fontColor, fontFamily } from './index';

export function phaseLabels(nodes: readonly PhasePosition[]): { ply: number; label: string }[] {
  if (!nodes.length) return [];
  const first = nodes[0].ply;
  const phases = detectGamePhases(nodes);
  const labels = [
    {
      ply: first,
      label:
        phases.end === first
          ? i18n.site.endgame
          : phases.middle === first
            ? i18n.site.middlegame
            : i18n.site.opening,
    },
  ];
  if (phases.middle !== undefined && phases.middle > first && phases.middle !== phases.end)
    labels.push({ ply: phases.middle, label: i18n.site.middlegame });
  if (phases.end !== undefined && phases.end > first)
    labels.push({ ply: phases.end, label: i18n.site.endgame });
  return labels;
}

export function phasePlugin(nodes: () => readonly PhasePosition[]): Plugin<'line'> {
  let cacheKey = '';
  let cached: ReturnType<typeof phaseLabels> = [];
  return {
    id: 'nosweat-game-phases',
    afterDatasetsDraw(chart) {
      const { ctx, chartArea: area, scales } = chart;
      const current = nodes();
      const key = current.map(n => `${n.ply}:${n.fen}`).join('|');
      if (key !== cacheKey) {
        cacheKey = key;
        cached = phaseLabels(current);
      }
      const labels = cached;
      if (!labels.length || !area.width) return;
      ctx.save();
      ctx.beginPath();
      ctx.rect(area.left, area.top, area.width, area.height);
      ctx.clip();
      ctx.strokeStyle = fontColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.globalAlpha = 0.6;
      for (const phase of labels.slice(1)) {
        const x = scales.x.getPixelForValue(phase.ply);
        ctx.beginPath();
        ctx.moveTo(x, area.top);
        ctx.lineTo(x, area.bottom);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);
      ctx.font = `600 11px ${fontFamily().family}`;
      ctx.fillStyle = fontColor;
      ctx.textBaseline = 'top';
      const ends = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
      for (const phase of labels) {
        const width = ctx.measureText(phase.label).width;
        const x = Math.max(
          area.left + 4,
          Math.min(scales.x.getPixelForValue(phase.ply) + 4, area.right - width - 4),
        );
        const lane = Math.max(
          0,
          ends.findIndex(end => x >= end + 5),
        );
        ctx.fillText(phase.label, x, area.top + 4 + lane * 14);
        ends[lane] = x + width;
      }
      ctx.restore();
    },
  };
}
