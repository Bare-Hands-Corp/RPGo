import Link from "next/link";
import { EditableStat } from "./editable-stat";
import { EditFichaModal } from "./edit-ficha-modal";
import { AvatarUploadModal } from "./avatar-upload-modal";

type Personagem = {
  id: string;
  nome: string;
  nivel: number;
  fotoUrl: string | null;
  hpAtual: number;
  hpMax: number;
  ppAtual: number;
  ppMax: number;
  forca: number;
  destreza: number;
  constituicao: number;
  sabedoria: number;
  vontade: number;
  presenca: number;
};

function pct(atual: number, max: number): number {
  if (!max) return 0;
  return Math.max(0, Math.min(100, (atual / max) * 100));
}

export function PerfilSidebar({ personagem: p }: { personagem: Personagem }) {
  const avatarSrc =
    p.fotoUrl || `https://api.dicebear.com/7.x/adventurer/svg?seed=${p.id}`;

  return (
    <aside className="sidebar">
      <div className="sidebar-icons right">
        <EditFichaModal
          personagemId={p.id}
          inicial={{
            hpMax: p.hpMax,
            ppMax: p.ppMax,
            forca: p.forca,
            destreza: p.destreza,
            constituicao: p.constituicao,
            sabedoria: p.sabedoria,
            vontade: p.vontade,
            presenca: p.presenca,
          }}
        />
      </div>

      <div className="profile-header">
        <AvatarUploadModal personagemId={p.id} avatarAtual={avatarSrc} />
        <h2 className="char-name">{p.nome || "Sem Nome"}</h2>
        <span className="char-level">
          Nível{" "}
          <EditableStat personagemId={p.id} campo="nivel" valor={p.nivel} />
        </span>
      </div>

      <hr />

      <div className="bar-group bar-hp">
        <div className="bar-label">
          <span>❤️ Vida</span>
          <div className="stat-values">
            <EditableStat
              personagemId={p.id}
              campo="hpAtual"
              valor={p.hpAtual}
              max={p.hpMax}
            />{" "}
            / <span>{p.hpMax}</span>
          </div>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${pct(p.hpAtual, p.hpMax)}%` }} />
        </div>
      </div>

      <div className="bar-group bar-en">
        <div className="bar-label">
          <span>⚡ Pontos de Poder</span>
          <div className="stat-values">
            <EditableStat
              personagemId={p.id}
              campo="ppAtual"
              valor={p.ppAtual}
              max={p.ppMax}
            />{" "}
            / <span>{p.ppMax}</span>
          </div>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${pct(p.ppAtual, p.ppMax)}%` }} />
        </div>
      </div>

      <div className="bar-label" style={{ marginTop: 15, color: "var(--color-power)" }}>
        ATRIBUTOS
      </div>
      <div className="attr-grid">
        {(
          [
            ["FOR", p.forca],
            ["DES", p.destreza],
            ["CON", p.constituicao],
            ["INT", p.sabedoria],
            ["VON", p.vontade],
            ["PRE", p.presenca],
          ] as const
        ).map(([label, valor]) => (
          <div className="attr-card" key={label}>
            <div className="attr-label">{label}</div>
            <div className="attr-value">{valor}</div>
          </div>
        ))}
      </div>

      <Link href="/dashboard" className="btn-voltar-ficha">
        ← Voltar
      </Link>
    </aside>
  );
}
