const THUMB_WIDTH = 320;
const JPEG_QUALITY = 72;

class NodeCanvasFactory {
  constructor(createCanvas) {
    this.createCanvas = createCanvas;
  }

  create(width, height) {
    const canvas = this.createCanvas(Math.ceil(width), Math.ceil(height));
    return { canvas, context: canvas.getContext('2d') };
  }

  reset(canvasAndContext, width, height) {
    canvasAndContext.canvas.width = Math.ceil(width);
    canvasAndContext.canvas.height = Math.ceil(height);
  }

  destroy(canvasAndContext) {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

export async function renderPdfFirstPageJpeg(pdfBuffer) {
  const [{ createCanvas }, pdfjs] = await Promise.all([
    import('@napi-rs/canvas'),
    import('pdfjs-dist/legacy/build/pdf.mjs'),
  ]);
  const data = Buffer.isBuffer(pdfBuffer)
    ? new Uint8Array(pdfBuffer)
    : pdfBuffer instanceof Uint8Array
      ? pdfBuffer
      : new Uint8Array(pdfBuffer);
  const canvasFactory = new NodeCanvasFactory(createCanvas);
  const loadingTask = pdfjs.getDocument({
    data,
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: true,
    verbosity: 0,
    canvasFactory,
  });

  const doc = await loadingTask.promise;
  try {
    const page = await doc.getPage(1);
    const unscaled = page.getViewport({ scale: 1 });
    const scale = THUMB_WIDTH / unscaled.width;
    const viewport = page.getViewport({ scale });
    const canvasAndContext = canvasFactory.create(viewport.width, viewport.height);
    await page.render({
      canvas: canvasAndContext.canvas,
      canvasContext: canvasAndContext.context,
      viewport,
    }).promise;
    const jpeg = await canvasAndContext.canvas.encode('jpeg', JPEG_QUALITY);
    canvasFactory.destroy(canvasAndContext);
    return Buffer.from(jpeg);
  } finally {
    if (typeof loadingTask.destroy === 'function') {
      await loadingTask.destroy();
    } else if (typeof doc.cleanup === 'function') {
      await doc.cleanup();
    }
  }
}
