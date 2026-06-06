import { expect, test } from "@playwright/test";

// Testa o Risk Assistant (WebLLM) de ponta a ponta:
//   1) Abre o painel e AGUARDA o WebLLM resolver — "Llama pronto" (modelo real,
//      precisa de WebGPU → correr com --headed numa máquina com GPU) OU
//      "Modelo indisponível" (fallback determinístico, típico em headless).
//   2) Faz TODAS as perguntas possíveis e valida que cada resposta é sã.
//
// As respostas são fundamentadas pelas tools determinísticas, por isso são
// válidas nos dois modos; o modelo, quando carregado, apenas as reformula.

// Perguntas analíticas — uma por cada ferramenta do catálogo.
const DOMAIN_QUESTIONS = [
  "Qual foi a selection que teve mais apostas hoje?",
  "Qual foi a odd mais usada nas apostas da selection Draw?",
  "Quantas selections distintas tem o evento Benfica vs Porto?",
  "Qual é a média de odd para apostas na selection Draw?",
  "Qual foi a aposta que mais pode dar prejuízo à casa hoje?",
  "Qual é a distribuição de apostas por betType hoje?",
  "Quantas legs tem a aposta com mais legs?",
  "Qual é o betType mais comum no sport Football?",
  "A que horas do dia houve mais apostas hoje?",
  "A que horas há mais apostas no sport Tennis na última semana?",
  "Dá-me um resumo geral de hoje.",
  "Mostra o ranking de desportos por número de apostas.",
  "Quais foram as últimas apostas?",
  "Qual foi a aposta com maior stake hoje?",
  "Qual é o betType mais comum no geral?",
  "Como está a distribuição de risco hoje?",
  "Compara o volume e a exposição de hoje vs ontem.",
  "Há algum padrão suspeito ou anomalia nas apostas?",
];

// Conversa fora de domínio.
const CHITCHAT_QUESTIONS = ["Olá, tudo bem?", "Quem és tu?"];

async function openAssistant(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Abrir Risk Assistant" }).click();
  const panel = page.getByRole("dialog", { name: "Painel do Risk Assistant" });
  await expect(panel).toBeVisible();
  return panel;
}

// Aguarda o WebLLM resolver (pronto ou indisponível) e devolve o modo.
async function waitForWebLLM(panel) {
  const status = panel.locator(".assistant-llm-state");
  await expect(status).toHaveText(/pronto|indispon/i, { timeout: 300000 });
  const text = await status.innerText();
  return /pronto/i.test(text) ? "LLM (Llama carregado)" : "fallback determinístico";
}

// Envia uma pergunta e devolve a resposta final do assistant.
async function ask(panel, question) {
  const input = panel.getByLabel("Pergunta ao assistant");
  await expect(input).toBeEnabled({ timeout: 120000 });
  await input.fill(question);
  await panel.getByRole("button", { name: "Enviar" }).click();

  // Entrou a pensar (pode ser instantâneo no caminho determinístico)…
  await expect(input).toBeDisabled({ timeout: 8000 }).catch(() => {});
  // …e terminou quando o input volta a ficar disponível e não há "a escrever".
  await expect(input).toBeEnabled({ timeout: 120000 });
  await expect(panel.locator(".assistant-message.typing")).toHaveCount(0, { timeout: 120000 });

  const answer = (await panel.locator(".assistant-message.assistant").last().innerText()).trim();
  console.log(`\nQ: ${question}\nA: ${answer}`);
  return answer;
}

function assertSane(answer, question) {
  expect(answer.length, `resposta vazia para: ${question}`).toBeGreaterThan(2);
  // Sem fuga do formato interno do prompt.
  expect(answer, `fuga de JSON em: ${question}`).not.toMatch(/\{\s*"tool"/);
  expect(answer, `fuga de markdown/código em: ${question}`).not.toMatch(/```/);
}

test("o assistant responde a todas as perguntas (analytics, conversa, regras e risco)", async ({ page }) => {
  test.setTimeout(600000);

  const panel = await openAssistant(page);
  const mode = await waitForWebLLM(panel);
  console.log(`\n[assistant] Modo do WebLLM: ${mode}`);

  // 1) Perguntas analíticas.
  for (const question of DOMAIN_QUESTIONS) {
    assertSane(await ask(panel, question), question);
  }

  // 2) Conversa fora de domínio.
  for (const question of CHITCHAT_QUESTIONS) {
    assertSane(await ask(panel, question), question);
  }

  // 3) Gestão de Regras de Highlight (determinístico — fiável em qualquer modo).
  const addAnswer = await ask(panel, "Adiciona uma regra para destacar apostas com stake total maior que 8000.");
  expect(addAnswer).toMatch(/regra adicionada/i);

  const listAnswer = await ask(panel, "Que regras tenho definidas?");
  expect(listAnswer).toMatch(/stake total|regra/i);

  // Campo não suportado → deve alertar e indicar os campos disponíveis.
  const badFieldAnswer = await ask(panel, "Adiciona uma regra para o nome do jogador maior que 5.");
  expect(badFieldAnswer).toMatch(/não suportado|nao suportado|campos disponíveis|campos disponiveis/i);

  const deactivateAnswer = await ask(panel, "Desativa todas as regras.");
  expect(deactivateAnswer).toMatch(/desativ/i);

  // 4) Botão dedicado de Análise de Risco (briefing determinístico).
  await panel.getByRole("button", { name: "Análise de risco" }).click();
  const input = panel.getByLabel("Pergunta ao assistant");
  await expect(input).toBeEnabled({ timeout: 120000 });
  await expect(panel.locator(".assistant-message.typing")).toHaveCount(0, { timeout: 120000 });
  const briefing = (await panel.locator(".assistant-message.assistant").last().innerText()).trim();
  console.log(`\n[análise de risco]\n${briefing}`);

  // Coerente: ou operação estável, ou alertas reais — nunca alertas sem ação.
  expect(briefing).toMatch(/estável|estavel|alerta|sinal/i);
  if (/alerta|sinal/i.test(briefing) && !/estável|estavel/i.test(briefing)) {
    expect(briefing).toMatch(/ação sugerida|acao sugerida/i);
  }
});
