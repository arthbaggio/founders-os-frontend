// "Criar meu segundo cérebro": aparece quando o Founders OS abre sem cérebro.
// Três telas curtas de perguntas → o Claude monta a proposta (nada é gravado) →
// a pessoa aprova ou pede ajuste → o Claude cria os arquivos. Cada pergunta tem o
// próprio campo, começa vazia e pode ficar em branco: o que faltar vira pendência.
import { useCallback, useEffect, useRef, useState } from "react";
import { css } from "../css";

type Proposal = {
  nome: string;
  resumo: string;
  areas: { pasta: string; nome: string; oQue: string; paginas: { arquivo: string; titulo: string }[] }[];
  skills: { slug: string; label: string; area: string; oQueFaz: string; horario: string | null }[];
  fontes: { dominio: string; ferramenta: string }[];
  naoCriar: string[];
  testes: string[];
  pendencias: string[];
};
type Builder = {
  phase: "idle" | "propondo" | "proposta" | "criando" | "pronto" | "falhou";
  step: string;
  answers: Record<string, string>;
  proposal: Proposal | null;
  error: string;
  created: { pages: number; skills: number } | null;
};

type Question = { key: string; label: string; help: string; required?: boolean; rows?: number };
const STEPS: { title: string; questions: Question[] }[] = [
  {
    title: "A empresa",
    questions: [
      { key: "nome", label: "Como se chama a empresa?", help: "O nome que vai no topo do cérebro.", required: true, rows: 1 },
      { key: "vende", label: "O que a empresa vende e para quem?", help: "Os produtos ou serviços e o tipo de cliente.", required: true },
      { key: "areas", label: "Quais áreas existem de fato hoje?", help: "Do jeito que funciona, não o ideal. Ex.: quem vende, quem entrega, quem cuida do dinheiro." },
      { key: "time", label: "Quem é o time e o que cada um faz?", help: "Pode ser só você. Cargos ou papéis bastam." },
      { key: "prioridades", label: "Quais são as 1 a 3 prioridades agora?", help: "O que mais importa nos próximos meses." },
    ],
  },
  {
    title: "Como o trabalho acontece",
    questions: [
      { key: "processos", label: "O que se repete toda semana ou todo mês?", help: "Reuniões, relatórios, follow-ups, fechamentos. Diga o dia e a hora, se tiver." },
      { key: "esquece", label: "O que vocês refazem do zero ou esquecem de acompanhar?", help: "Propostas, retornos a clientes, cobranças…" },
      { key: "ferramentas", label: "Quais ferramentas vocês usam e onde vive cada informação?", help: "CRM, agenda, e-mail, financeiro, drive… e o que fica em cada um." },
    ],
  },
  {
    title: "Limites e teste",
    questions: [
      { key: "fora", label: "O que NÃO deve entrar no cérebro?", help: "Dados sensíveis, assuntos privados, senhas." },
      { key: "testes", label: "Três perguntas que o cérebro precisa responder em segundos.", help: "Elas viram o teste de que o cérebro funciona." },
      { key: "material", label: "Quer colar algum material? (opcional)", help: "Texto do site, apresentação, anotações. O Claude usa como base.", rows: 6 },
    ],
  },
];

const post = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const box = "width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 10px; border: 1px solid oklch(1 0 0 / 11%); background: oklch(1 0 0 / 4%); font: inherit; font-size: 13.5px; line-height: 1.5; color: oklch(0.96 0.006 85); outline: none; resize: vertical";
const primary = "height: 38px; padding: 0 18px; border: 0; border-radius: 10px; background: oklch(0.82 0.15 85); color: oklch(0.2 0.02 85); font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer";
const ghost = "height: 38px; padding: 0 16px; border-radius: 10px; border: 1px solid oklch(1 0 0 / 12%); background: transparent; color: oklch(0.88 0.008 268); font: inherit; font-size: 13px; cursor: pointer";

export function Onboarding({ brain, onDone }: { brain: string; onDone: () => void }) {
  const [state, setState] = useState<Builder | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [page, setPage] = useState(-1);
  const [adjust, setAdjust] = useState("");
  const [missing, setMissing] = useState(false);
  const loaded = useRef(false);

  const load = useCallback(() => {
    fetch("/api/brain/status", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { builder: Builder } | null) => {
        if (!data) return;
        setState(data.builder);
        if (!loaded.current) {
          loaded.current = true;
          setAnswers(data.builder.answers ?? {});
        }
      })
      .catch(() => null);
  }, []);

  useEffect(load, [load]);
  // Enquanto o Claude trabalha, acompanha de perto.
  useEffect(() => {
    if (state?.phase !== "propondo" && state?.phase !== "criando") return;
    const timer = window.setInterval(load, 2000);
    return () => window.clearInterval(timer);
  }, [state?.phase, load]);

  // As respostas ficam guardadas no app: fechar a página não perde nada.
  useEffect(() => {
    if (!loaded.current) return;
    const timer = window.setTimeout(() => post("/api/brain/answers", { answers }).catch(() => null), 600);
    return () => window.clearTimeout(timer);
  }, [answers]);

  const propose = async (text?: string) => {
    await post("/api/brain/answers", { answers }).catch(() => null);
    const res = await post("/api/brain/propose", text ? { adjust: text } : {}).catch(() => null);
    if (res?.ok) setState(await res.json());
    setAdjust("");
    window.setTimeout(load, 800);
  };

  const build = async () => {
    const res = await post("/api/brain/build", {}).catch(() => null);
    if (res?.ok) setState(await res.json());
    window.setTimeout(load, 800);
  };

  const phase = state?.phase ?? "idle";
  const working = phase === "propondo" || phase === "criando";
  const showProposal = !working && phase !== "pronto" && state?.proposal && page === -2;
  const step = STEPS[page];

  let content: React.ReactNode;
  if (working) {
    content = (
      <Center>
        <div style={css("width: 34px; height: 34px; border-radius: 50%; border: 3px solid oklch(1 0 0 / 12%); border-top-color: oklch(0.82 0.15 85); animation: b-spin 0.9s linear infinite")}></div>
        <Title>{phase === "propondo" ? "Montando a proposta do seu cérebro" : "Criando o seu cérebro"}</Title>
        <Muted>{state?.step || "Começando"}</Muted>
        <Muted>{phase === "propondo" ? "Leva cerca de um minuto. Nada é gravado ainda." : "Leva alguns minutos. Pode deixar esta página aberta."}</Muted>
      </Center>
    );
  } else if (phase === "pronto") {
    content = (
      <Center>
        <Title>Seu segundo cérebro está pronto</Title>
        <Muted>
          {state?.created?.pages ? `${state.created.pages} páginas e ${state.created.skills} skills criadas.` : "Os arquivos foram criados."} O que ficou pendente está marcado em cada página.
        </Muted>
        <Muted>Próximo passo: no mapa, abra Agentes e clique em Desenhar para montar o time de agentes.</Muted>
        <button className="b-btn" style={css(primary)} onClick={onDone}>
          Abrir meu cérebro
        </button>
      </Center>
    );
  } else if (showProposal && state?.proposal) {
    const p = state.proposal;
    content = (
      <div style={css("display: flex; flex-direction: column; gap: 14px")}>
        <div>
          <Title>A proposta para {p.nome || "a sua empresa"}</Title>
          <Muted>{p.resumo}</Muted>
        </div>
        <Section title="Áreas">
          {p.areas.map((area) => (
            <div key={area.pasta} style={css("padding: 10px 12px; border-radius: 10px; background: oklch(1 0 0 / 4%)")}>
              <div style={css("font-size: 13px; font-weight: 600")}>{area.nome}</div>
              <div style={css("margin-top: 2px; font-size: 12px; color: oklch(0.76 0.012 268)")}>{area.oQue}</div>
              {area.paginas.length > 0 && (
                <div style={css("margin-top: 6px; display: flex; flex-wrap: wrap; gap: 5px")}>
                  {area.paginas.map((page) => (
                    <span key={page.arquivo} style={css("padding: 2px 8px; border-radius: 999px; background: oklch(1 0 0 / 6%); font-size: 11px; color: oklch(0.84 0.01 268)")}>
                      {page.titulo}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </Section>
        {p.skills.length > 0 && (
          <Section title="Skills e rotinas">
            {p.skills.map((skill) => (
              <div key={skill.slug} style={css("font-size: 12.5px; line-height: 1.45")}>
                <b>{skill.label}</b>
                {skill.horario ? <span style={css("color: oklch(0.82 0.12 85)")}> · {skill.horario}</span> : null}
                <span style={css("color: oklch(0.74 0.012 268)")}> — {skill.oQueFaz}</span>
              </div>
            ))}
          </Section>
        )}
        {p.fontes.length > 0 && <List title="Onde vive cada informação" items={p.fontes.map((f) => `${f.dominio}: ${f.ferramenta}`)} />}
        {p.testes.length > 0 && <List title="O cérebro vai saber responder" items={p.testes} />}
        {p.pendencias.length > 0 && <List title="Ficou pendente (você completa depois)" items={p.pendencias} />}
        {state.error && <ErrorText text={state.error} />}
        <div style={css("display: flex; flex-direction: column; gap: 8px; padding-top: 4px")}>
          <textarea rows={2} value={adjust} onChange={(event) => setAdjust(event.target.value)} placeholder="Quer mudar algo? Escreva aqui" style={css(box)} />
          <div style={css("display: flex; gap: 8px; flex-wrap: wrap")}>
            <button className="b-btn" style={css(primary)} onClick={build}>
              Criar meu cérebro
            </button>
            <button className="b-btn" style={css(ghost)} disabled={!adjust.trim()} onClick={() => propose(adjust.trim())}>
              Ajustar a proposta
            </button>
            <button className="b-btn" style={css(ghost)} onClick={() => setPage(0)}>
              Voltar às respostas
            </button>
          </div>
        </div>
      </div>
    );
  } else if (page === -2) {
    content = (
      <Center>
        <Title>Não deu para montar a proposta</Title>
        <ErrorText text={state?.error || "Tente de novo."} />
        <div style={css("display: flex; gap: 8px")}>
          <button className="b-btn" style={css(primary)} onClick={() => propose()}>
            Tentar de novo
          </button>
          <button className="b-btn" style={css(ghost)} onClick={() => setPage(STEPS.length - 1)}>
            Voltar às respostas
          </button>
        </div>
      </Center>
    );
  } else if (page === -1) {
    content = (
      <Center>
        <Title>Vamos criar o segundo cérebro da sua empresa</Title>
        <Muted>Três telas de perguntas, uns 10 minutos. Responda do seu jeito: o que você não souber agora fica marcado como pendente.</Muted>
        <Muted>Depois o Claude mostra a proposta e só cria os arquivos quando você aprovar.</Muted>
        <div style={css("display: flex; gap: 8px")}>
          <button className="b-btn" style={css(primary)} onClick={() => setPage(0)}>
            Começar
          </button>
          {state?.proposal && (
            <button className="b-btn" style={css(ghost)} onClick={() => setPage(-2)}>
              Ver a proposta salva
            </button>
          )}
        </div>
        <div style={css("font-size: 11.5px; color: oklch(0.6 0.012 268)")}>Pasta do cérebro: {brain}</div>
      </Center>
    );
  } else {
    const last = page === STEPS.length - 1;
    const next = () => {
      const needs = step.questions.filter((q) => q.required && !answers[q.key]?.trim());
      if (needs.length) return setMissing(true);
      setMissing(false);
      if (last) {
        setPage(-2);
        propose();
      } else setPage(page + 1);
    };
    content = (
      <div style={css("display: flex; flex-direction: column; gap: 16px")}>
        <div>
          <div style={css("font-size: 11.5px; font-weight: 600; letter-spacing: 0.06em; color: oklch(0.82 0.12 85)")}>
            ETAPA {page + 1} DE {STEPS.length}
          </div>
          <Title>{step.title}</Title>
        </div>
        {step.questions.map((q) => (
          <label key={q.key} style={css("display: flex; flex-direction: column; gap: 5px")}>
            <span style={css("font-size: 13.5px; font-weight: 600")}>
              {q.label}
              {q.required && <span style={css("color: oklch(0.82 0.12 85)")}> *</span>}
            </span>
            <span style={css("font-size: 12px; color: oklch(0.7 0.012 268)")}>{q.help}</span>
            {q.rows === 1 ? (
              <input value={answers[q.key] ?? ""} onChange={(event) => setAnswers((now) => ({ ...now, [q.key]: event.target.value }))} placeholder="Digite aqui" style={css(box)} />
            ) : (
              <textarea rows={q.rows ?? 3} value={answers[q.key] ?? ""} onChange={(event) => setAnswers((now) => ({ ...now, [q.key]: event.target.value }))} placeholder="Escreva aqui" style={css(box)} />
            )}
          </label>
        ))}
        {missing && <ErrorText text="Responda as perguntas marcadas com * para seguir." />}
        {phase === "falhou" && state?.error && <ErrorText text={state.error} />}
        <div style={css("display: flex; gap: 8px")}>
          <button className="b-btn" style={css(primary)} onClick={next}>
            {last ? "Ver a proposta" : "Continuar"}
          </button>
          <button className="b-btn" style={css(ghost)} onClick={() => setPage(page - 1)}>
            Voltar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={css("min-height: 100vh; box-sizing: border-box; padding: 48px 16px; background: oklch(0.135 0.008 268); color: oklch(0.94 0.006 85); font-family: Geist, system-ui, sans-serif")}>
      <style>{"@keyframes b-spin { to { transform: rotate(360deg) } }"}</style>
      <div style={css("max-width: 640px; margin: 0 auto")}>
        <div style={css("margin-bottom: 24px; font-size: 12px; font-weight: 600; letter-spacing: 0.08em; color: oklch(0.7 0.012 268)")}>FOUNDERS OS · CRIAR O SEGUNDO CÉREBRO</div>
        {content}
      </div>
    </div>
  );
}

const Title = ({ children }: { children: React.ReactNode }) => <h1 style={css("margin: 4px 0 0; font-size: 22px; font-weight: 650; line-height: 1.25")}>{children}</h1>;
const Muted = ({ children }: { children: React.ReactNode }) => <p style={css("margin: 6px 0 0; font-size: 13.5px; line-height: 1.55; color: oklch(0.76 0.012 268)")}>{children}</p>;
const ErrorText = ({ text }: { text: string }) => <div style={css("font-size: 12.5px; color: oklch(0.8 0.09 25)")}>{text}</div>;
const Center = ({ children }: { children: React.ReactNode }) => <div style={css("display: flex; flex-direction: column; align-items: flex-start; gap: 12px")}>{children}</div>;
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div style={css("display: flex; flex-direction: column; gap: 6px")}>
    <div style={css("font-size: 12px; font-weight: 600; letter-spacing: 0.04em; color: oklch(0.7 0.012 268)")}>{title.toUpperCase()}</div>
    {children}
  </div>
);
const List = ({ title, items }: { title: string; items: string[] }) => (
  <Section title={title}>
    <ul style={css("margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 3px; font-size: 12.5px; line-height: 1.45; color: oklch(0.84 0.01 268)")}>
      {items.map((one) => (
        <li key={one}>{one}</li>
      ))}
    </ul>
  </Section>
);
