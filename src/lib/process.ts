import { canvasToDataUrl, dataUrlToCanvas, dominantColor, fileToCanvas, looksLikeHasBackground, removeLightBackground, trimTransparent } from './image';

export interface Processed {
  dataUrl: string;
  color: string;
  needsBg: boolean;
  /** уменьшенный оригинал — для повторного удаления фона */
  sourceDataUrl: string;
}

export async function processFile(file: File): Promise<Processed> {
  const canvas = await fileToCanvas(file);
  const needsBg = file.type === 'image/jpeg' || looksLikeHasBackground(canvas);
  if (!needsBg) {
    const trimmed = trimTransparent(canvas);
    const dataUrl = canvasToDataUrl(trimmed);
    return { dataUrl, color: dominantColor(trimmed), needsBg, sourceDataUrl: dataUrl };
  }
  const sourceDataUrl = canvasToDataUrl(canvas);
  // цвет оцениваем по предварительно «очищенной» версии, чтобы фон не стал доминирующим
  const color = dominantColor(trimTransparent(removeLightBackground(canvas, 40)));
  return { dataUrl: sourceDataUrl, color, needsBg, sourceDataUrl };
}

export async function removeBg(sourceDataUrl: string, tolerance: number): Promise<{ dataUrl: string; color: string }> {
  const c = await dataUrlToCanvas(sourceDataUrl);
  const out = trimTransparent(removeLightBackground(c, tolerance));
  return { dataUrl: canvasToDataUrl(out), color: dominantColor(out) };
}
