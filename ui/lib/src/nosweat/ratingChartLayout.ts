// Geometry adapted from CSSLab/maia-platform-frontend (GPL-3.0),
// 50083f295d7043b54eeaa2f53f459b1c5aee9937: movesByRatingLayout.ts.
// Native adaptation: retain gaps and fit labels into the existing compact frame.
export interface ChartLine {
  uci: string;
  name: string;
  values: (number | undefined)[];
}
interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}
export interface ChartLabel {
  uci: string;
  text: string;
  x: number;
  y: number;
  px: number;
  py: number;
  anchor: 'start' | 'middle' | 'end';
  size: number;
}

export const standardDomains = [0.2, 0.4, 0.6, 0.8, 1] as const;
export function chartTicks(domain: number, height: number): number[] {
  const parts = height < 200 ? 2 : domain === 0.6 ? 3 : 4;
  return Array.from({ length: parts + 1 }, (_, i) => (i * domain) / parts);
}

export function chartLabels(
  lines: ChartLine[],
  index: number | undefined,
  width: number,
  height: number,
  x: (index: number) => number,
  y: (p: number) => number,
  share: (p: number) => string,
): { endpoints: ChartLabel[]; peaks: ChartLabel[]; shares: ChartLabel[] } {
  const last = 20;
  const top = height < 200 ? 19 : 25;
  const bottom = height - 23;
  const size = height < 200 ? 10 : 12;
  const gap = size + 3;
  const textWidth = (text: string) => text.length * size * 0.64 + 4;
  const placed: Box[] = [];
  const overlaps = (box: Box) =>
    placed.some(
      p =>
        p.left < box.right + 2 && box.left < p.right + 2 && p.top < box.bottom + 1 && box.top < p.bottom + 1,
    );
  const lineAt = (line: ChartLine, px: number): number | undefined => {
    const t = Math.max(0, Math.min(last, ((px - x(0)) / (x(last) - x(0))) * last));
    const i = Math.min(last - 1, Math.floor(t));
    const a = line.values[i];
    const b = line.values[i + 1];
    return a === undefined || b === undefined ? undefined : y(a + (t - i) * (b - a));
  };
  const clear = (box: Box, own: ChartLine) => {
    for (const line of lines)
      for (let px = box.left; px <= box.right; px += 2) {
        if (px < x(0) || px > x(last)) continue;
        const py = lineAt(line, px);
        if (py !== undefined && py > box.top - 2 && py < box.bottom + 2) return false;
      }
    const cx = Math.max(x(0), Math.min(x(last), (box.left + box.right) / 2));
    const ownY = lineAt(own, cx);
    if (ownY !== undefined)
      for (const line of lines) {
        if (line === own) continue;
        const py = lineAt(line, cx);
        if (py !== undefined && py > Math.min(box.bottom, ownY) - 1 && py < Math.max(box.top, ownY) + 1)
          return false;
      }
    return true;
  };
  const endpoints: ChartLabel[] = lines
    .flatMap(line =>
      line.values[last] === undefined
        ? []
        : [
            {
              uci: line.uci,
              text: line.name,
              x: x(last) + 8,
              y: y(line.values[last]),
              px: x(last),
              py: y(line.values[last]),
              anchor: 'start' as const,
              size,
            },
          ],
    )
    .sort((a, b) => a.y - b.y || a.uci.localeCompare(b.uci));
  // All six/eight names fit vertically; never invent a missing final sample.
  endpoints.forEach((label, i) => {
    label.y = Math.max(label.y, i ? endpoints[i - 1].y + gap : top);
  });
  for (let i = endpoints.length - 1; i >= 0; i--) {
    const label = endpoints[i];
    label.y = Math.min(label.y, i === endpoints.length - 1 ? bottom : endpoints[i + 1].y - gap);
    label.size = Math.min(size, (width - label.x - 2) / Math.max(1, label.text.length * 0.64));
    placed.push({ left: label.x, right: width, top: label.y - gap / 2, bottom: label.y + gap / 2 });
  }
  const peaks: ChartLabel[] = [];
  const shares: ChartLabel[] = [];
  const place = (line: ChartLine, text: string, px: number, py: number, peak: boolean) => {
    const tw = textWidth(text);
    const sides = index === last ? [-1] : index !== undefined && index > 10 ? [-1, 1] : [1, -1];
    for (const dy of peak ? [-size] : [0, -gap, -2 * gap])
      for (const side of peak ? [0] : sides) {
        const cx = peak ? Math.max(x(0) + tw / 2, Math.min(x(last) - tw / 2, px)) : px + side * (8 + tw / 2);
        const cy = py + dy;
        const box = { left: cx - tw / 2, right: cx + tw / 2, top: cy - gap / 2, bottom: cy + gap / 2 };
        if (
          box.left < x(0) - 2 ||
          box.right > width - 2 ||
          box.top < 2 ||
          box.bottom > bottom ||
          overlaps(box) ||
          !clear(box, line)
        )
          continue;
        placed.push(box);
        return { uci: line.uci, text, x: cx, y: cy, px, py, anchor: 'middle' as const, size };
      }
    return undefined;
  };
  for (const line of lines) {
    // Strong interior peak: at least eight percentage points / 25% above both ends.
    if (line.values.some(p => p === undefined)) continue;
    const values = line.values as number[];
    const peak = Math.max(...values);
    const i = values.indexOf(peak);
    if (i < 2 || i > last - 2 || peak - Math.max(values[0], values[last]) < Math.max(0.08, peak * 0.25))
      continue;
    for (const offset of [0, -1, 1, -2, 2]) {
      const k = i + offset;
      if (k <= 0 || k >= last || values[k] < peak * 0.8) continue;
      const label = place(line, line.name, x(k), y(values[k]), true);
      if (label) {
        peaks.push(label);
        break;
      }
    }
  }
  if (index !== undefined)
    for (const line of lines) {
      const p = line.values[index];
      if (p === undefined) continue;
      const label = place(line, share(p), x(index), y(p), false);
      if (label) shares.push(label);
    }
  return { endpoints, peaks, shares };
}
