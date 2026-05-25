"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Cropper, { type Area } from "react-easy-crop";
import Swal from "sweetalert2";
import { createClient } from "@/lib/supabase/client";
import { recortarParaBlob } from "@/lib/crop-image";
import { patchPersonagem } from "./actions";

type Props = {
  personagemId: string;
  avatarAtual: string;
};

export function AvatarUploadModal({ personagemId, avatarAtual }: Props) {
  const [aberto, setAberto] = useState(false);
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
    setAberto(false);
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

  // Paste (Ctrl+V) só quando o modal estiver aberto.
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
        const blob = await recortarParaBlob(imgSrc, pixelCrop, 300);

        const supabase = createClient();
        const fileName = `avatar_${personagemId}_${Date.now()}.png`;
        const { error } = await supabase.storage
          .from("avatars")
          .upload(fileName, blob, { contentType: "image/png", upsert: true });
        if (error) throw error;

        const { data: publicData } = supabase.storage
          .from("avatars")
          .getPublicUrl(fileName);

        await patchPersonagem(personagemId, { fotoUrl: publicData.publicUrl });

        Swal.fire({
          icon: "success",
          title: "Avatar atualizado!",
          timer: 1200,
          showConfirmButton: false,
          background: "var(--bg-card)",
          color: "var(--text-main)",
        });
        setAberto(false);
        resetar();
      } catch (err) {
        Swal.fire({
          icon: "error",
          title: "Erro",
          text: err instanceof Error ? err.message : "Falha ao salvar avatar.",
          background: "var(--bg-card)",
          color: "var(--text-main)",
        });
      }
    });
  }

  return (
    <>
      <button
        type="button"
        className="avatar-circle"
        onClick={() => setAberto(true)}
        title="Alterar foto de perfil"
        style={{ padding: 0, background: "transparent", border: "3px solid var(--color-power)" }}
      >
        <img src={avatarAtual} alt="Avatar" />
        <span className="avatar-overlay">
          <i className="fas fa-camera" />
        </span>
      </button>

      {aberto && (
        <div className="modal-overlay" onClick={fechar}>
          <div
            className="modal-box"
            onClick={(e) => e.stopPropagation()}
            style={{ width: 420, maxWidth: "90vw" }}
          >
            <h2>Alterar Avatar</h2>
            <p style={{ fontSize: "0.85rem", color: "var(--text-sec)", marginBottom: 15 }}>
              Cole (Ctrl+V), arraste uma imagem ou clique pra selecionar.
            </p>

            {!imgSrc && (
              <div
                className="avatar-dropzone"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  (e.currentTarget as HTMLElement).classList.add("dragover");
                }}
                onDragLeave={(e) =>
                  (e.currentTarget as HTMLElement).classList.remove("dragover")
                }
                onDrop={(e) => {
                  e.preventDefault();
                  (e.currentTarget as HTMLElement).classList.remove("dragover");
                  lerArquivo(e.dataTransfer.files[0]);
                }}
              >
                <i className="fas fa-image" />
                <p>Clique, arraste ou cole imagem aqui</p>
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
                <div className="avatar-cropper-area">
                  <Cropper
                    image={imgSrc}
                    crop={crop}
                    zoom={zoom}
                    aspect={1}
                    cropShape="round"
                    showGrid={false}
                    onCropChange={setCrop}
                    onZoomChange={setZoom}
                    onCropComplete={onCropComplete}
                  />
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
                  <label style={{ fontSize: "0.8rem", color: "var(--text-sec)", margin: 0 }}>
                    Zoom
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={3}
                    step={0.1}
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    disabled={pending}
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="modal-btn-cancel"
                    onClick={resetar}
                    disabled={pending}
                    style={{ padding: "6px 10px" }}
                  >
                    Trocar
                  </button>
                </div>
              </>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="modal-btn-cancel"
                onClick={fechar}
                disabled={pending}
              >
                Cancelar
              </button>
              {imgSrc && (
                <button
                  type="button"
                  className="modal-btn-save"
                  onClick={salvar}
                  disabled={pending || !pixelCrop}
                >
                  {pending ? "Enviando..." : "Salvar"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
