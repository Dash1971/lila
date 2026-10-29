import QRCode from 'qrcode';

export async function initModule(): Promise<void> {
  const qrs = Array.from(document.querySelectorAll<HTMLCanvasElement>('canvas.qrcode')).filter(
    qr => qr.dataset.qrUrl,
  );
  await Promise.all(
    qrs.map(qr =>
      QRCode.toCanvas(qr, qr.dataset.qrUrl!, {
        margin: 2,
        width: qr.dataset.width ? parseInt(qr.dataset.width) : 320,
      }),
    ),
  );
}

// Preserve native pages that include this module for its initial side effect.
void initModule();
