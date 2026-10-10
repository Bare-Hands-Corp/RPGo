"use client";

import { useEffect, useState, useTransition } from "react";
import Swal from "sweetalert2";
import { BannerUploadModal } from "@/app/dashboard/banner-upload-modal";
import { atualizarMesa } from "./actions";

// Mesmo limite validado em atualizarMesa (actions.ts).
const NOME_MAX = 60;

type Props = {
  mesaId: string;
  nomeAtual: string;
  bannerAtual: string | null;
  onFechar: () => void;
};

export function EditarMesaModal({ mesaId, nomeAtual, bannerAtual, onFechar }: Props) {
  const [nome, setNome] = useState(nomeAtual);
  const [banner, setBanner] = useState<string | null>(bannerAtual);
  const [uploadAberto, setUploadAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const alterado = nome.trim() !== nomeAtual || banner !== bannerAtual;

  // Esc fecha — mas não enquanto o recorte de imagem está aberto por cima.
  useEffect(() => {
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape" && !uploadAberto && !pending) onFechar();
    }
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [uploadAberto, pending, onFechar]);

  function salvar() {
    if (!nome.trim()) {
      setErro("Dê um nome para a mesa.");
      return;
    }
    startTransition(async () => {
      try {
        await atualizarMesa(mesaId, { nome, bannerUrl: banner });
        Swal.fire({
          toast: true,
          position: "top-end",
          icon: "success",
          title: "Mesa atualizada",
          timer: 1500,
          showConfirmButton: false,
          background: "var(--bg-card)",
          color: "var(--text-main)",
        });
        onFechar();
      } catch (err) {
        setErro(err instanceof Error ? err.message : "Não foi possível salvar.");
      }
    });
  }

  return (
    <>
      <div className="modal-overlay" onClick={() => !pending && !alterado && onFechar()}>
        <div
          className="modal-box editar-mesa-modal"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-labelledby="editar-mesa-titulo"
        >
          <div className="editar-mesa-topo">
            <h2 id="editar-mesa-titulo">Editar mesa</h2>
            <button type="button" className="narrador-voltar" onClick={onFechar} disabled={pending} aria-label="Fechar">
              <i className="fas fa-xmark" />
            </button>
          </div>

          <span className="nv-rotulo">Foto da mesa</span>
          <div className="editar-mesa-banner">
            {banner ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={banner} alt="Foto da mesa" />
            ) : (
              <div className="editar-mesa-sem-banner">
                <i className="fas fa-map" />
                <span>Sem foto</span>
              </div>
            )}
          </div>
          <div className="editar-mesa-banner-acoes">
            <button type="button" className="nv-btn" onClick={() => setUploadAberto(true)} disabled={pending}>
              <i className="fas fa-image" /> {banner ? "Trocar foto" : "Adicionar foto"}
            </button>
            {banner && (
              <button type="button" className="nv-btn perigo" onClick={() => setBanner(null)} disabled={pending}>
                <i className="fas fa-trash" /> Remover
              </button>
            )}
          </div>

          <label className="editar-mesa-campo">
            <span className="nv-rotulo">Nome da mesa</span>
            <input
              type="text"
              className="form-input"
              value={nome}
              maxLength={NOME_MAX}
              onChange={(e) => {
                setNome(e.target.value);
                setErro(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && alterado && salvar()}
              disabled={pending}
              autoFocus
            />
            <small>
              {nome.trim().length}/{NOME_MAX}
            </small>
          </label>

          {erro && (
            <p className="editar-mesa-erro">
              <i className="fas fa-circle-exclamation" /> {erro}
            </p>
          )}

          <div className="editar-mesa-rodape">
            <button type="button" className="nv-btn" onClick={onFechar} disabled={pending}>
              Cancelar
            </button>
            <button type="button" className="editar-mesa-salvar" onClick={salvar} disabled={pending || !alterado}>
              {pending ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      </div>

      <BannerUploadModal
        aberto={uploadAberto}
        onFechar={() => setUploadAberto(false)}
        onUpload={(url) => setBanner(url)}
      />
    </>
  );
}
