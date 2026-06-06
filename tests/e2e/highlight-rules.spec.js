import { expect, test } from "@playwright/test";

// E2E das Regras de Highlight Personalizadas:
//  1) Painel (Sheet): adicionar, editar, toggle ativo/inativo e remover.
//  2) Aplicação do highlight nas linhas da tabela conforme as regras.
//  3) Criação de uma regra a partir do assistente em linguagem natural
//     (usa o caminho heurístico — não depende do modelo WebLLM estar carregado).

const RULES_BUTTON = "Gerir regras de highlight";

async function openRulesSheet(page) {
  await page.getByRole("button", { name: RULES_BUTTON }).click();
  const sheet = page.getByRole("dialog", { name: "Regras de Highlight" });
  await expect(sheet).toBeVisible();
  return sheet;
}

test.describe("Regras de Highlight", () => {
  test("painel: adicionar, editar, alternar e remover regras", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Análise de Riscos - Apostas Agrupadas")).toBeVisible();

    // Sem regras → sem badge no trigger.
    await expect(page.locator(".hr-trigger-badge")).toHaveCount(0);

    const sheet = await openRulesSheet(page);
    await expect(sheet.getByText("Sem regras definidas")).toBeVisible();

    // Adicionar regra com valores padrão.
    await sheet.getByRole("button", { name: "Adicionar Regra" }).click();
    const card = sheet.locator(".hr-card").first();
    await expect(card).toBeVisible();
    await expect(card.locator(".hr-preview")).toHaveText("Stake Total > 8000");

    // Editar operador e valor → o preview reflete.
    await card.getByLabel("Operador").selectOption(">=");
    await card.getByLabel("Valor").fill("5000");
    await expect(card.locator(".hr-preview")).toHaveText("Stake Total ≥ 5000");

    // Editar campo.
    await card.getByLabel("Campo").selectOption("betCount");
    await expect(card.locator(".hr-preview")).toHaveText("Nº de Apostas ≥ 5000");

    // Badge mostra 1 regra ativa.
    await expect(page.locator(".hr-trigger-badge")).toHaveText("1");

    // Desativar → card fica inativo e badge desaparece.
    await card.getByRole("button", { name: "Desativar regra" }).click();
    await expect(card).toHaveClass(/inactive/);
    await expect(page.locator(".hr-trigger-badge")).toHaveCount(0);

    // Reativar.
    await card.getByRole("button", { name: "Ativar regra" }).click();
    await expect(card).not.toHaveClass(/inactive/);
    await expect(page.locator(".hr-trigger-badge")).toHaveText("1");

    // Remover → volta ao estado vazio.
    await card.getByRole("button", { name: "Eliminar regra" }).click();
    await expect(sheet.getByText("Sem regras definidas")).toBeVisible();
  });

  test("aplica o highlight nas linhas conforme as regras", async ({ page }) => {
    await page.goto("/");

    // Precisa de dados na tabela (backend + Postgres a correr).
    await expect(page.locator("tbody tr .sport-cell").first()).toBeVisible({ timeout: 30000 });

    const sheet = await openRulesSheet(page);
    await sheet.getByRole("button", { name: "Adicionar Regra" }).click();
    const card = sheet.locator(".hr-card").first();

    // Regra que casa com TODAS as linhas: Stake Total > 0.
    await card.getByLabel("Valor").fill("0");
    await expect(page.locator("tr.row-highlighted").first()).toBeVisible({ timeout: 10000 });

    // Regra impossível → nenhuma linha destacada.
    await card.getByLabel("Valor").fill("999999999999");
    await expect(page.locator("tr.row-highlighted")).toHaveCount(0);

    // Volta a casar e depois desativa → também sem highlight.
    await card.getByLabel("Valor").fill("0");
    await expect(page.locator("tr.row-highlighted").first()).toBeVisible();
    await card.getByRole("button", { name: "Desativar regra" }).click();
    await expect(page.locator("tr.row-highlighted")).toHaveCount(0);
  });

  test("assistente cria uma regra por linguagem natural", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Abrir Risk Assistant" }).click();
    const panel = page.getByRole("dialog", { name: "Painel do Risk Assistant" });
    await expect(panel).toBeVisible();

    const input = panel.getByLabel("Pergunta ao assistant");
    await expect(input).toBeEnabled({ timeout: 20000 });

    // Tenta algumas vezes — o módulo do assistente pode demorar a carregar; o
    // parsing usa o caminho heurístico, não precisa do modelo Llama.
    const phrase = "adiciona uma regra para destacar linhas com numero de apostas maior que 0";
    let confirmed = false;

    for (let attempt = 0; attempt < 4 && !confirmed; attempt += 1) {
      await input.fill(phrase);
      await panel.getByRole("button", { name: "Enviar" }).click();
      await page.waitForTimeout(3000);
      const lastMessage = await panel
        .locator(".assistant-message.assistant")
        .last()
        .innerText()
        .catch(() => "");
      confirmed = /regra adicionada/i.test(lastMessage);
    }

    expect(confirmed, "o assistente devia confirmar a criação da regra").toBeTruthy();

    // A regra aparece no painel.
    const sheet = await openRulesSheet(page);
    await expect(sheet.locator(".hr-preview").filter({ hasText: "Nº de Apostas" })).toBeVisible();
  });
});
