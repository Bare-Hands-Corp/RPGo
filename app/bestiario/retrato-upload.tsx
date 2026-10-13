"use client";

// Retrato da criatura: escolher, arrastar ou colar (Ctrl+V) uma imagem e
// recortar, igual ao avatar do jogador (ficha/avatar-upload-modal). Aqui o
// endereço só entra no rascunho; quem grava é o Salvar da criatura.

import { useCallback, useEffect, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import Swal from "sweetalert2";
import { createClient } from "@/lib/supabase/client";
import { recortarParaBlob } from "@/lib/crop-image";

type Props = {
  valor: string | null;
  onChange: (url: string | null) => void;
};

function avisarErro(texto: string) {
  void Swal.fire({ icon: "error", title: "Erro", text: texto, background: "var(--bg-card)", color: "var(--text-main)" });
}

export function RetratoUpload({ valor, onChange }: Props) {
  const [aberto, setAberto] = useState(false);
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [pixelCrop, setPixelCrop] = useState<Area | null>(null);
  const [enviando, setEnviando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function resetar() {
    setImgSrc(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setPixelCrop(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function fechar() {
    if (enviando) return;
    setAberto(false);
    resetar();
  }

  function lerArquivo(file: File | null | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      avisarErro("Selecione uma imagem.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => setImgSrc(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  // Colar (Ctrl+V) só com o modal aberto.
  useEffect(() => {
    if (!aberto) return;
    function colar(e: ClipboardEvent) {
      const file = e.clipboardData?.files[0];
      if (file) {
        e.preventDefault();
        lerArquivo(file);
      }
    }
    document.addEventListener("paste", colar);
    return () => document.removeEventListener("paste", colar);
  }, [aberto]);

  const aoRecortar = useCallback((_area: Area, pixels: Area) => setPixelCrop(pixels), []);

  async function usar() {
    if (!imgSrc || !pixelCrop) return;
    setEnviando(true);
    try {
      const blob = await recortarParaBlob(imgSrc, pixelCrop, 300);
      const supabase = createClient();
      const arquivo = `criatura_${crypto.randomUUID()}.png`;
      const { error } = await supabase.storage.from("avatars").upload(arquivo, blob, { contentType: "image/png" });
      if (error) throw error;
      onChange(supabase.storage.from("avatars").getPublicUrl(arquivo).data.publicUrl);
      setAberto(false);
      resetar();
    } catch (err) {
      avisarErro(err instanceof Error ? err.message : "Falha ao enviar a imagem.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="bestiario-campo-retrato">
      <button
        type="button"
        className="bestiario-ficha-retrato bestiario-retrato-botao"
        onClick={() => setAberto(true)}
        title={valor ? "Trocar o retrato" : "Adicionar um retrato"}
        aria-label={valor ? "Trocar o retrato" : "Adicionar um retrato"}
      >
        {valor ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={valor} alt="" />
        ) : (
          <i className="fas fa-skull" />
        )}
        <span className="bestiario-retrato-camera" aria-hidden>
          <i className="fas fa-camera" />
        </span>
      </button>
      <div className="bestiario-retrato-acoes">
        <span className="bestiario-tipos-dano-rotulo">Retrato (opcional)</span>
        <div>
          <button type="button" className="bestiario-btn-add" onClick={() => setAberto(true)}>
            <i className="fas fa-image" /> {valor ? "Trocar imagem" : "Escolher imagem"}
          </button>
          {valor && (
            <button type="button" className="bestiario-voltar-lista" onClick={() => onChange(null)}>
              <i className="fas fa-xmark" /> Tirar
            </button>
          )}
        </div>
      </div>

      {aberto && (
        <div className="modal-overlay" onClick={fechar}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ width: 420, maxWidth: "90vw" }}>
            <h2>Retrato da criatura</h2>

            {!imgSrc && (
              <div
                className="avatar-dropzone"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.add("dragover");
                }}
                onDragLeave={(e) => e.currentTarget.classList.remove("dragover")}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove("dragover");
                  lerArquivo(e.dataTransfer.files[0]);
                }}
              >
                <i className="fas fa-image" />
                <p>Clique, arraste ou cole (Ctrl+V) a imagem aqui</p>
                <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => lerArquivo(e.target.files?.[0])} />
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
                    showGrid={false}
                    onCropChange={setCrop}
                    onZoomChange={setZoom}
                    onCropComplete={aoRecortar}
                  />
                </div>
                <div className="bestiario-retrato-zoom">
                  <span>Zoom</span>
                  <input
                    type="range"
                    min={1}
                    max={3}
                    step={0.1}
                    value={zoom}
                    aria-label="Zoom"
                    onChange={(e) => setZoom(Number(e.target.value))}
                    disabled={enviando}
                  />
                  <button type="button" className="modal-btn-cancel" onClick={resetar} disabled={enviando}>
                    Trocar
                  </button>
                </div>
              </>
            )}

            <div className="modal-actions">
              <button type="button" className="modal-btn-cancel" onClick={fechar} disabled={enviando}>
                Cancelar
              </button>
              {imgSrc && (
                <button type="button" className="modal-btn-save" onClick={() => void usar()} disabled={enviando || !pixelCrop}>
                  {enviando ? "Enviando..." : "Usar este retrato"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
