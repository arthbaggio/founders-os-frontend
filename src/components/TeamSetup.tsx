// A configuração do time, dentro da própria conversa (no lugar da conversa, no
// cartão do meio). Cinco etapas, cada uma com o estado e a ação: o OpenBot, o Local
// scripts, o desenho do time, a montagem no OpenBot e o conector do cérebro. O
// arquivo de importação (o plano B) fica no fim, em "Outras formas".
import { useCallback, useEffect, useRef, useState } from "react";
import { css } from "../css";
import { Svg } from "./Icons";

type Setup = {
  installed: boolean;
  running: boolean;
  localScripts: boolean;
  connector: { connectedAt: string | null; client: string | null; lastUse: string | null; lastTool: string | null };
  servers?: { id: string | null; name: string }[];
  server?: string | null;
  auto?: boolean;
  eggbot?: { id: string; name: string } | null;
};
type Team = {
  status: "nenhum" | "rodando" | "pronto" | "falhou";
  builder: { id: string; name: string } | null;
  answer: string;
  report: { criados: string[]; skills: number; rotinas: number; conector: boolean; falhas: string[] } | null;
  pending?: { prompts: any[]; approvals: any[] };
};
type Plan = { status: "nenhum" | "rodando" | "pronto" | "falhou"; step: string; createdAt: string | null; summary: string; gaps: string[] };
type Exported = { file: string; agents: number; skills: number; routines: number; warnings?: string[] };

const OPENBOT_URL = "https://openbot.run/";
// O Dr. Eggbot, o agente do marketplace do OpenBot que cria agentes.
const EGGBOT_PAGE = "https://openbot.run/marketplace/agents/openbot-curated-agent-dr-eggbot";
const LABEL = "font-size: 10.5px; font-weight: 600; letter-spacing: 0.26em; text-transform: uppercase";
const GOLD = "oklch(0.82 0.15 85)";
const GREEN = "oklch(0.76 0.15 155)";

const post = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const plural = (n: number, one: string, many: string) => n + " " + (n === 1 ? one : many);
const short = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function TeamSetup({ back, compact = false }: { back: () => void; compact?: boolean }) {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [exported, setExported] = useState<Exported | null>(null);
  const [askClose, setAskClose] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [gaps, setGaps] = useState(false);
  const [more, setMore] = useState(false);
  const [eggbotOpened, setEggbotOpened] = useState(false);
  const live = useRef(true);

  const load = useCallback(() => {
    fetch("/api/agents", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!live.current || !data) return;
        setPlan(data.plan);
        setExported(data.exported);
      })
      .catch(() => null);
    fetch("/api/openbot/setup", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => live.current && data && setSetup(data))
      .catch(() => null);
    fetch("/api/openbot/team", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => live.current && data && setTeam(data))
      .catch(() => null);
  }, []);
  useEffect(() => {
    live.current = true;
    load();
    const timer = window.setInterval(load, plan?.status === "rodando" || team?.status === "rodando" ? 3000 : 8000);
    return () => {
      live.current = false;
      window.clearInterval(timer);
    };
  }, [load, plan?.status, team?.status]);

  // Uma ação: marca o botão como ocupado, mostra o erro e relê o estado.
  const act = async (name: string, url: string, body: unknown, after?: (data: any, ok: boolean) => void) => {
    setBusy(name);
    setError("");
    const res = await post(url, body).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy("");
    if (after) after(data, Boolean(res?.ok));
    else if (!res?.ok) setError(data.error || "Não deu certo");
    load();
  };
  const scripts = (close: boolean) =>
    act("scripts", "/api/openbot/local-scripts", { close }, (data, ok) => {
      if (ok) {
        setAskClose(false);
        window.setTimeout(load, 6000);
      } else if (data.needsClose) setAskClose(true);
      else setError(data.error || "Não consegui ligar");
    });

  if (!setup) return <div style={css("margin: auto; font-size: 12.5px; color: oklch(0.6 0.012 268)")}>Lendo a configuração…</div>;

  const designed = Boolean(plan?.createdAt);
  const steps = [
    {
      done: setup.installed && setup.running,
      title: "OpenBot aberto",
      detail: !setup.installed ? "Não achei o OpenBot neste computador." : setup.running ? "Instalado e aberto. O Founders OS acha o servidor sozinho." : "Instalado, mas fechado. Abra o OpenBot.",
      action: !setup.installed ? (
        <LinkButton href={OPENBOT_URL}>Baixar</LinkButton>
      ) : null,
      extra:
        (setup.servers?.length ?? 0) > 1 ? (
          <label style={css("display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: oklch(0.66 0.012 268)")}>
            Servidor
            <select
              value={setup.auto ? "auto" : (setup.server ?? "")}
              onChange={(event) => {
                const id = event.target.value === "auto" ? "auto" : event.target.value || null;
                setAskClose(false);
                act("server", "/api/openbot/server", { id });
              }}
              style={css("height: 30px; padding: 0 10px; border-radius: 8px; border: 1px solid oklch(1 0 0 / 12%); background: oklch(0.2 0.008 268); font: inherit; font-size: 12.5px; color: oklch(0.94 0.006 85)")}
            >
              <option value="auto">Automático{setup.auto ? " · " + (setup.servers!.find((one) => one.id === (setup.server ?? null))?.name ?? "Principal") : ""}</option>
              {setup.servers!.map((one) => (
                <option key={one.id ?? "principal"} value={one.id ?? ""}>
                  {one.name}
                </option>
              ))}
            </select>
          </label>
        ) : null,
    },
    {
      done: setup.localScripts,
      title: "Local scripts ligado",
      detail: setup.localScripts ? "Todo agente deste servidor fala com o Founders OS." : "Deixa o Founders OS conversar com os agentes. Liga para todos de uma vez.",
      action:
        !setup.localScripts && setup.installed && !askClose ? (
          <Button busy={busy === "scripts"} onClick={() => scripts(false)}>
            Ligar
          </Button>
        ) : null,
      extra: askClose ? (
        <Callout>
          O OpenBot está aberto e só lê essa opção ao abrir. Posso fechar e abrir de novo? Um agente trabalhando agora para no meio.
          <div style={css("display: flex; gap: 6px; margin-top: 10px")}>
            <Button busy={busy === "scripts"} onClick={() => scripts(true)}>
              {busy === "scripts" ? "Fechando…" : "Fechar e ligar"}
            </Button>
            <Button ghost onClick={() => setAskClose(false)}>
              Agora não
            </Button>
          </div>
        </Callout>
      ) : null,
    },
    {
      done: designed && plan?.status !== "rodando",
      title: "Time desenhado pelo cérebro",
      detail:
        plan?.status === "rodando"
          ? plan.step || "Lendo o cérebro…"
          : plan?.status === "falhou"
            ? "Não deu certo: " + plan.step
            : designed && plan?.createdAt
              ? "Um agente por área. Desenhado em " + short(plan.createdAt) + "."
              : "O Claude lê o cérebro e escreve a missão de cada agente, um por área.",
      action: (
        <Button busy={plan?.status === "rodando"} ghost={designed} onClick={() => act("plan", "/api/agents/plan", {})}>
          {plan?.status === "rodando" ? "Desenhando…" : designed ? "Redesenhar" : "Desenhar"}
        </Button>
      ),
      extra:
        designed && plan ? (
          <>
            {plan.summary && <div style={css("font-size: 12.5px; line-height: 1.55; color: oklch(0.78 0.01 268)")}>{plan.summary}</div>}
            {plan.gaps.length > 0 && (
              <div>
                <button className="b-btn" onClick={() => setGaps((was) => !was)} style={css(`border: 0; padding: 0; background: none; font: inherit; font-size: 12px; color: ${GOLD}; cursor: pointer`)}>
                  {plural(plan.gaps.length, "pendência no cérebro", "pendências no cérebro")} {gaps ? "▴" : "▾"}
                </button>
                {gaps && (
                  <ul style={css("margin: 8px 0 0; padding-left: 18px; display: flex; flex-direction: column; gap: 5px; font-size: 12px; line-height: 1.5; color: oklch(0.74 0.012 268)")}>
                    {plan.gaps.map((gap) => (
                      <li key={gap}>{gap}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        ) : null,
    },
    {
      done: team?.status === "pronto",
      title: "Time montado no OpenBot",
      detail: !designed
        ? "Primeiro desenhe o time."
        : team?.status === "rodando"
          ? `${team.builder?.name ?? "Um agente"} está criando os agentes, as skills, as rotinas e o conector. Leva alguns minutos.`
          : team?.status === "pronto"
            ? team.report
              ? `${plural(team.report.criados.length, "agente", "agentes")}, ${plural(team.report.skills, "skill", "skills")}, ${plural(team.report.rotinas, "rotina", "rotinas")}${team.report.conector ? " e o conector" : ""}.`
              : "Pronto."
            : team?.status === "falhou"
              ? "A última montagem não terminou. Tente de novo."
              : "Um clique: um agente do OpenBot cria o time inteiro, instala as skills e as rotinas e liga o conector.",
      action:
        designed && setup.localScripts && team?.status !== "rodando" ? (
          <Button busy={busy === "team"} ghost={team?.status === "pronto"} onClick={() => act("team", "/api/openbot/team", {})}>
            {team?.status === "pronto" ? "Refazer" : "Configurar tudo"}
          </Button>
        ) : team?.status === "rodando" ? (
          <span className="c-spin"></span>
        ) : null,
      extra: (
        <>
          {team?.pending?.approvals?.map((one: any) => (
            <Callout key={one.requestId} title="O OpenBot pede aprovação">
              {one.reason || one.kind}
              {one.command && <code style={css("display: block; margin-top: 6px; font-size: 11px; word-break: break-all")}>{String(one.command)}</code>}
              <div style={css("display: flex; gap: 6px; margin-top: 10px")}>
                <Button onClick={() => act("approve", "/api/openbot/team/approve", { requestId: one.requestId, decision: "accept" })}>Aprovar</Button>
                <Button ghost onClick={() => act("approve", "/api/openbot/team/approve", { requestId: one.requestId, decision: "decline" })}>
                  Recusar
                </Button>
              </div>
            </Callout>
          ))}
          {team?.pending?.prompts?.map((one: any) => (
            <Callout key={one.requestId} title="O agente pergunta">
              {(one.questions ?? []).map((q: any) => (
                <div key={q.id}>
                  {q.question}
                  <div style={css("display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px")}>
                    {(q.options ?? []).map((opt: any) => (
                      <Button key={opt.label} ghost onClick={() => act("answer", "/api/openbot/team/answer", { requestId: one.requestId, answers: { [q.id]: [opt.label] } })}>
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </Callout>
          ))}
          {team?.status === "pronto" && (team.report?.falhas?.length ?? 0) > 0 && (
            <ul style={css(`margin: 0; padding-left: 18px; font-size: 12px; line-height: 1.5; color: ${GOLD}`)}>
              {team.report!.falhas.map((one) => (
                <li key={one}>{one}</li>
              ))}
            </ul>
          )}
          {team?.status === "falhou" && team.answer && <Callout>{team.answer}</Callout>}
        </>
      ),
    },
    {
      done: Boolean(setup.connector.connectedAt),
      title: "Conector do cérebro",
      detail: setup.connector.lastUse
        ? `Os agentes leem o cérebro ao vivo. Último uso ${short(setup.connector.lastUse)}${setup.connector.lastTool ? " (" + setup.connector.lastTool + ")" : ""}.`
        : setup.connector.connectedAt
          ? "Ligado. Nenhum agente usou ainda."
          : "Os agentes leem o cérebro ao vivo. O Configurar tudo liga sozinho.",
      action: null,
      extra: null,
    },
    {
      done: Boolean(setup.eggbot),
      title: "Dr. Eggbot, o criador de agentes",
      detail: setup.eggbot
        ? `Instalado como ${setup.eggbot.name}. Para um agente novo, converse com ele: explique o processo e ele pergunta o que falta e cria o agente. Ele também monta o time no Configurar tudo.`
        : !setup.running
          ? "Abra o OpenBot para instalar."
          : "O agente oficial do OpenBot que desenha e cria outros agentes. Você explica o processo, ele faz as perguntas e cria o agente com as boas práticas. Ele trabalha com acesso total: cria arquivos e roda comandos sem pedir a cada passo.",
      action:
        setup.running && !setup.eggbot ? (
          <Button busy={busy === "eggbot"} onClick={() => act("eggbot", "/api/openbot/eggbot", {}, (data, ok) => (ok ? setEggbotOpened(true) : setError(data.error || "Não consegui abrir o OpenBot")))}>
            {eggbotOpened ? "Abrir de novo" : "Instalar"}
          </Button>
        ) : null,
      extra: setup.eggbot ? null : eggbotOpened ? (
        <Callout>No OpenBot, clique em adicionar o agente. Esta etapa fica verde sozinha quando ele aparecer.</Callout>
      ) : (
        <a href={EGGBOT_PAGE} target="_blank" rel="noopener noreferrer" style={css(`font-size: 12px; color: ${GOLD}; text-decoration: none`)}>
          Ver no marketplace do OpenBot ↗
        </a>
      ),
    },
  ];
  const doneCount = steps.filter((one) => one.done).length;

  return (
    <div className="b-scroll" style={css("flex: 1; min-height: 0; overflow-y: auto")}>
      <div style={css(`max-width: 700px; margin: 0 auto; padding: ${compact ? "18px 18px 24px" : "26px 28px 30px"}; display: flex; flex-direction: column; gap: ${compact ? 18 : 22}px`)}>
        <div style={css("display: flex; align-items: center; gap: 12px")}>
          <img src="/api/openbot/logo" alt="" width={34} height={34} onError={(event) => (event.currentTarget.style.display = "none")} style={{ flex: "none", borderRadius: 9 }} />
          <div style={css("flex: 1; min-width: 0")}>
            <div style={css("font-size: 13px; font-weight: 600; letter-spacing: 0.3em; text-transform: uppercase")}>Configuração</div>
            <div style={css("margin-top: 4px; font-size: 12px; color: oklch(0.64 0.012 268)")}>
              OpenBot · {doneCount} de {steps.length} etapas prontas
            </div>
          </div>
          <button className="b-btn b-ghost" aria-label="Fechar a configuração" title="Fechar" onClick={back} style={css("flex: none; display: grid; place-items: center; width: 30px; height: 30px; border: 0; border-radius: 8px; background: transparent; color: oklch(0.72 0.012 268); cursor: pointer")}>
            <Svg size={16}>
              <path d="M6 6l12 12M18 6 6 18"></path>
            </Svg>
          </button>
        </div>
        <div style={css("height: 3px; border-radius: 99px; background: oklch(1 0 0 / 7%); overflow: hidden")}>
          <div style={css(`height: 100%; width: ${(doneCount / steps.length) * 100}%; border-radius: 99px; background: ${GREEN}; box-shadow: 0 0 10px ${GREEN}; transition: width 0.4s ease`)}></div>
        </div>
        {error && <div style={css("font-size: 12.5px; color: oklch(0.8 0.09 25)")}>{error}</div>}

        <ol style={css("margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column")}>
          {steps.map((step, i) => (
            <li key={step.title} style={css("position: relative; display: flex; gap: 16px; padding-bottom: 22px")}>
              {i < steps.length - 1 && <span style={css(`position: absolute; left: 15px; top: 34px; bottom: 2px; width: 1px; background: ${step.done ? "color-mix(in oklch, " + GREEN + " 45%, transparent)" : "oklch(1 0 0 / 9%)"}`)}></span>}
              <Node done={step.done} n={i + 1} />
              <div style={css("flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10px; padding-top: 5px")}>
                <div style={css("display: flex; align-items: flex-start; gap: 12px")}>
                  <div style={css("flex: 1; min-width: 0")}>
                    <div style={css(`font-size: 13.5px; font-weight: 600; color: ${step.done ? "oklch(0.95 0.006 85)" : "oklch(0.88 0.008 268)"}`)}>{step.title}</div>
                    <div style={css("margin-top: 3px; font-size: 12.5px; line-height: 1.5; color: oklch(0.64 0.012 268)")}>{step.detail}</div>
                  </div>
                  {step.action}
                </div>
                {step.extra}
              </div>
            </li>
          ))}
        </ol>

        <NewAgent eggbot={setup.eggbot ?? null} />

        <div style={css("border-top: 1px solid oklch(1 0 0 / 7%); padding-top: 16px")}>
          <button className="b-btn" onClick={() => setMore((was) => !was)} style={css(`${LABEL}; border: 0; padding: 0; background: none; color: oklch(0.56 0.012 268); cursor: pointer`)}>
            Outras formas {more ? "▴" : "▾"}
          </button>
          {more && (
            <div style={css("display: flex; align-items: flex-start; gap: 12px; margin-top: 14px")}>
              <div style={css("flex: 1; min-width: 0")}>
                <div style={css("font-size: 13px; font-weight: 600; color: oklch(0.88 0.008 268)")}>Arquivo de importação do OpenBot</div>
                <div style={css("margin-top: 3px; font-size: 12.5px; line-height: 1.5; color: oklch(0.64 0.012 268)")}>
                  {exported
                    ? `Gerado com ${plural(exported.agents, "agente", "agentes")}, ${plural(exported.skills, "skill", "skills")} e ${plural(exported.routines, "rotina", "rotinas")}. No OpenBot: Server settings › Import.`
                    : "Para montar o time sem o Local scripts: gera um arquivo e o OpenBot importa."}
                </div>
              </div>
              <Button ghost busy={busy === "export"} onClick={() => act("export", "/api/agents/export", {}, (data, ok) => (ok ? setExported(data) : setError(data.error || "Não consegui gerar o arquivo")))}>
                {busy === "export" ? "Gerando…" : exported ? "Gerar de novo" : "Gerar arquivo"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// A etapa como um nó do mapa: verde e brilhando quando pronta, apagada quando falta.
function Node({ done, n }: { done: boolean; n: number }) {
  return (
    <span
      style={css(
        `position: relative; flex: none; display: grid; place-items: center; width: 31px; height: 31px; border-radius: 99px; font-size: 12px; font-weight: 600; ${
          done
            ? `color: ${GREEN}; border: 1.5px solid ${GREEN}; background: color-mix(in oklch, ${GREEN} 16%, oklch(0.14 0.008 268)); box-shadow: 0 0 12px color-mix(in oklch, ${GREEN} 40%, transparent)`
            : "color: oklch(0.6 0.012 268); border: 1.5px solid oklch(1 0 0 / 16%); background: oklch(0.16 0.008 268)"
        }`,
      )}
    >
      {done ? (
        <Svg size={14} weight={2.2}>
          <path d="M5 12l5 5 9-10"></path>
        </Svg>
      ) : (
        n
      )}
    </span>
  );
}

function Button({ onClick, busy, ghost, children }: { onClick: () => void; busy?: boolean; ghost?: boolean; children: React.ReactNode }) {
  return (
    <button
      className="b-btn"
      disabled={busy}
      onClick={onClick}
      style={css(
        `flex: none; height: 32px; padding: 0 14px; border-radius: 9px; font: inherit; font-size: 12.5px; font-weight: 600; white-space: nowrap; cursor: pointer; ${
          ghost ? "border: 1px solid oklch(1 0 0 / 13%); background: transparent; color: oklch(0.9 0.008 268)" : `border: 0; background: ${GOLD}; color: oklch(0.2 0.02 85)`
        }`,
      )}
    >
      {children}
    </button>
  );
}

function LinkButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a className="b-btn" href={href} target="_blank" rel="noopener noreferrer" style={css(`flex: none; display: inline-flex; align-items: center; height: 32px; padding: 0 14px; border-radius: 9px; background: ${GOLD}; color: oklch(0.2 0.02 85); font-size: 12.5px; font-weight: 600; text-decoration: none`)}>
      {children}
    </a>
  );
}

function Callout({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div style={css("padding: 12px 14px; border-radius: 10px; border: 1px solid oklch(0.82 0.15 85 / 22%); background: oklch(0.82 0.15 85 / 7%); font-size: 12.5px; line-height: 1.5; color: oklch(0.88 0.008 268); white-space: pre-wrap; max-height: 220px; overflow: auto")}>
      {title && <div style={css("margin-bottom: 4px; font-weight: 600")}>{title}</div>}
      {children}
    </div>
  );
}

// Um agente novo: a pessoa escolhe um modelo (ou nenhum), descreve o processo e o
// pedido vai ao Dr. Eggbot com o método criar-agente. Ele pergunta o que faltar,
// mostra as etapas para aprovar e cria o agente no OpenBot.
type Template = { slug: string; name: string; area: string; mission: string };
function NewAgent({ eggbot }: { eggbot: { id: string; name: string } | null }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [picked, setPicked] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/agents/templates")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setTemplates(data.templates))
      .catch(() => null);
  }, []);
  const model = templates.find((one) => one.slug === picked);
  const send = async () => {
    setBusy(true);
    setError("");
    const res = await post("/api/agents/new", { template: picked, description: text }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (res?.ok) {
      setSent(data.eggbot?.name ?? "Dr. Eggbot");
      setText("");
    } else setError(data.error || "Não deu certo");
  };
  return (
    <div style={css("border-top: 1px solid oklch(1 0 0 / 7%); padding-top: 16px; display: flex; flex-direction: column; gap: 10px")}>
      <div>
        <div style={css("font-size: 13.5px; font-weight: 600; color: oklch(0.88 0.008 268)")}>Criar um agente novo</div>
        <div style={css("margin-top: 3px; font-size: 12.5px; line-height: 1.5; color: oklch(0.64 0.012 268)")}>
          Escolha um modelo ou comece do zero e descreva o processo. O Dr. Eggbot quebra em etapas, marca o que precisa da sua aprovação, mostra para você aprovar e cria o agente.
        </div>
      </div>
      <div style={css("display: flex; flex-wrap: wrap; gap: 6px")}>
        {[{ slug: "", name: "Do zero" } as { slug: string; name: string }, ...templates].map((one) => (
          <button
            key={one.slug || "zero"}
            className="b-btn"
            onClick={() => setPicked(one.slug)}
            style={css(
              `height: 28px; padding: 0 11px; border-radius: 99px; font: inherit; font-size: 12px; cursor: pointer; border: 1px solid ${picked === one.slug ? GOLD : "oklch(1 0 0 / 12%)"}; background: ${
                picked === one.slug ? "oklch(0.82 0.15 85 / 10%)" : "transparent"
              }; color: ${picked === one.slug ? GOLD : "oklch(0.82 0.008 268)"}`,
            )}
          >
            {one.name}
          </button>
        ))}
      </div>
      {model && <div style={css("font-size: 12px; line-height: 1.5; color: oklch(0.7 0.012 268)")}>{model.mission}</div>}
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={model ? `Como isso funciona na sua empresa? Ex.: ferramentas, quantidade, quem aprova.` : "Descreva o processo: o que se repete, o resultado que conta como pronto e o que nunca pode dar errado."}
        rows={4}
        style={css("box-sizing: border-box; width: 100%; resize: vertical; padding: 10px 12px; border-radius: 10px; border: 1px solid oklch(1 0 0 / 12%); background: oklch(1 0 0 / 3.5%); font: inherit; font-size: 12.5px; line-height: 1.5; color: oklch(0.94 0.006 85); outline: none; color-scheme: dark")}
      />
      <div style={css("display: flex; align-items: center; gap: 10px")}>
        <Button busy={busy} onClick={() => eggbot && text.trim().length >= 15 && send()}>
          {busy ? "Enviando…" : "Pedir ao Dr. Eggbot"}
        </Button>
        <span style={css(`font-size: 12px; color: ${error ? "oklch(0.8 0.09 25)" : "oklch(0.6 0.012 268)"}`)}>
          {error || (!eggbot ? "Instale o Dr. Eggbot (etapa 6) para usar." : sent ? `Pedido enviado. Continue a conversa com o ${sent} no OpenBot.` : text.trim().length < 15 ? "Escreva pelo menos uma frase." : "")}
        </span>
      </div>
    </div>
  );
}
