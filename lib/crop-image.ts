// Recorta a imagem segundo o pixelCrop devolvido pelo react-easy-crop e
// retorna um Blob PNG pronto pra upload. Roda só no browser (usa Image + Canvas).

export type PixelCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function carregarImagem(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", (e) => reject(e));
    img.src = src;
  });
}

export async function recortarParaBlob(
  imageSrc: string,
  pixelCrop: PixelCrop,
  outputWidth = 300,
  outputHeight?: number,
): Promise<Blob> {
  const image = await carregarImagem(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D não suportado.");

  // Se a altura não foi fornecida, calcule preservando a proporção do recorte
  const outH = typeof outputHeight === "number"
    ? outputHeight
    : Math.max(1, Math.round(outputWidth * (pixelCrop.height / pixelCrop.width)));

  canvas.width = outputWidth;
  canvas.height = outH;

  // Melhor qualidade de interpolação ao redimensionar
  ctx.imageSmoothingEnabled = true;
  // Alguns ambientes TS não tipam imageSmoothingQuality; usar como any evita erro
  try {
    (ctx as CanvasRenderingContext2D & { imageSmoothingQuality?: 'low' | 'medium' | 'high' }).imageSmoothingQuality = "high";
  } catch {
    // ignore se não suportado
  }

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Falha ao gerar blob da imagem."));
      },
      // PNG é lossless; se precisar controlar qualidade use 'image/jpeg'
      "image/png",
    );
  });
}
