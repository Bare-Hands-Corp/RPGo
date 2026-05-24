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
  outputSize = 300,
): Promise<Blob> {
  const image = await carregarImagem(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D não suportado.");

  canvas.width = outputSize;
  canvas.height = outputSize;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outputSize,
    outputSize,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Falha ao gerar blob da imagem."));
      },
      "image/png",
      0.9,
    );
  });
}
