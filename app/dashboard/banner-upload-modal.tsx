"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Cropper, { type Area } from "react-easy-crop";
import Swal from "sweetalert2";
import { createClient } from "@/lib/supabase/client";
import { recortarParaBlob } from "@/lib/crop-image";

type Props = {
  aberto: boolean;
  onFechar: () => void;
  onUpload: (bannerUrl: string) => void;
};

export function BannerUploadModal({ aberto, onFechar, onUpload }: Props) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [pixelCrop, setPixelCrop] = useState<Area | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function resetar() {
    setImgSrc(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setPixelCrop(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function fechar() {
    if (pending) return;
    onFechar();
    resetar();
  }

  function lerArquivo(file: File | null | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      Swal.fire({
        icon: "error",
        title: "Arquivo inválido",
        text: "Selecione uma imagem.",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => setImgSrc(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  useEffect(() => {
    if (!aberto) return;

    function handlePaste(e: ClipboardEvent) {
      const file = e.clipboardData?.files[0];
      if (file) {
        e.preventDefault();
        lerArquivo(file);
      }
    }

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [aberto]);

  const onCropComplete = useCallback((_croppedArea: Area, pxArea: Area) => {
    setPixelCrop(pxArea);
  }, []);

  function salvar() {
    if (!imgSrc || !pixelCrop) return;

    startTransition(async () => {
      try {
        const blob = await recortarParaBlob(imgSrc, pixelCrop, 1200);
        const supabase = createClient();
        const fileName = `mesa_banner_${Date.now()}.png`;

        const { error } = await supabase.storage
          .from("avatars")
          .upload(fileName, blob, { contentType: "image/png", upsert: true });
        if (error) throw error;

        const { data } = supabase.storage.from("avatars").getPublicUrl(fileName);
        onUpload(data.publicUrl);

        Swal.fire({
          icon: "success",
          title: "Banner enviado!",
          timer: 1200,
          showConfirmButton: false,
          background: "var(--bg-card)",
          color: "var(--text-main)",
        });

        onFechar();
        resetar();
      } catch (err) {
        Swal.fire({
          icon: "error",
          title: "Erro",
          text: err instanceof Error ? err.message : "Falha ao salvar banner.",
          background: "var(--bg-card)",
          color: "var(--text-main)",
        });
      }
    });
  }

  if (!aberto) return null;

  return (
    <div className="modal-overlay-mesa modal-overlay-banner" onClick={fechar}>
      <div className="modal-content-mesa auth-card modal-banner-upload" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ color: "var(--primary)", marginBottom: 10 }}>Adicionar Banner</h2>
        <p className="banner-upload-help">Cole, arraste uma imagem ou clique para selecionar.</p>

        {!imgSrc && (
          <div
            className="banner-upload-dropzone"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              (e.currentTarget as HTMLElement).classList.add("dragover");
            }}
            onDragLeave={(e) => (e.currentTarget as HTMLElement).classList.remove("dragover")}
            onDrop={(e) => {
              e.preventDefault();
              (e.currentTarget as HTMLElement).classList.remove("dragover");
              lerArquivo(e.dataTransfer.files[0]);
            }}
          >
            <i className="fa-solid fa-image" />
            <p>Clique, arraste ou cole a imagem aqui</p>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => lerArquivo(e.target.files?.[0])}
            />
          </div>
        )}

        {imgSrc && (
          <>
            <div className="banner-upload-cropper-area">
              <Cropper
                image={imgSrc}
                crop={crop}
                zoom={zoom}
                aspect={16 / 6}
                cropShape="rect"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>

            <div className="banner-upload-zoom">
              <label htmlFor="bannerUploadZoom">Zoom</label>
              <input
                id="bannerUploadZoom"
                type="range"
                min={1}
                max={3}
                step={0.1}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                disabled={pending}
              />
              <button type="button" className="btn-text" onClick={resetar} disabled={pending}>
                Trocar
              </button>
            </div>
          </>
        )}

        <div className="modal-actions" style={{ marginTop: 20 }}>
          <button type="button" className="modal-btn-cancel" onClick={fechar} disabled={pending}>
            Cancelar
          </button>
          {imgSrc && (
            <button
              type="button"
              className="modal-btn-save"
              onClick={salvar}
              disabled={pending || !pixelCrop}
            >
              {pending ? "Enviando..." : "Salvar banner"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}