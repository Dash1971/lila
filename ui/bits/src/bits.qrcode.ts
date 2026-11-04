import QRCode from 'qrcode';

export async function initModule(): Promise<void> {
  const qrs = Array.from(document.querySelectorAll<HTMLCanvasElement>('canvas.qrcode')).filter(
    qr => qr.dataset.qrUrl,
  );
  await Promise.all(
    qrs.map(async qr => {
      const width = qr.dataset.width ? parseInt(qr.dataset.width) : 320;
      await QRCode.toCanvas(qr, qr.dataset.qrUrl!, {
        margin: 4,
        width: Math.round(width * Math.max(1, globalThis.devicePixelRatio || 1)),
      });
      qr.style.width = `${width}px`;
      qr.style.height = 'auto';
    }),
  );
}

// Preserve native pages that include this module for its initial side effect.
void initModule();
