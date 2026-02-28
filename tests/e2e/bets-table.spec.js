/*
 * ===== bets-table.spec.js =====
 * TESTES E2E (End-to-End) para a Tabela de Apostas.
 *
 * Cada teste simula um utilizador real:
 * 1. Abre o browser
 * 2. Navega para a página
 * 3. Verifica que os elementos esperados existem e estão visíveis
 *
 * CONCEITOS:
 * - test.describe(): agrupa testes relacionados
 * - test.beforeEach(): código que corre ANTES de cada teste
 * - test(): define um teste individual
 * - expect(): verifica uma condição (se falhar, o teste falha)
 * - page.locator(): seleciona elementos HTML na página (como document.querySelector)
 * - toBeVisible(): verifica que o elemento está visível no ecrã
 * - timeout: tempo máximo de espera (por defeito 5s, podemos aumentar)
 */

// Importar funções de teste do Playwright
import { test, expect } from '@playwright/test';

/**
 * Grupo de testes: Tabela de Apostas
 * test.describe() é como uma "pasta" que agrupa testes relacionados
 */
test.describe('Tabela de Apostas', () => {
  /**
   * beforeEach: executa ANTES de cada teste individual.
   * Aqui, navega para a página principal.
   * Assim cada teste começa com a página já carregada.
   */
  test.beforeEach(async ({ page }) => {
    // page.goto() navega para a URL especificada
    // '/' = página principal (usa o baseURL configurado no playwright.config.js)
    await page.goto('/');
  });

  // ─── TESTE 1: Título da página ───
  test('deve carregar a página principal com o título Blip', async ({ page }) => {
    // toHaveTitle() verifica o título do separador do browser
    // /Blip/ é uma expressão regular: verifica se o título CONTÉM "Blip"
    await expect(page).toHaveTitle(/Blip/);
  });

  // ─── TESTE 2: Tabela com dados ───
  test('deve exibir a tabela com dados de apostas (US-01)', async ({ page }) => {
    // Localizar a tabela pelo seletor CSS (classe BEM)
    const table = page.locator('.bets-table__table');
    // Esperar até 10 segundos para a tabela ficar visível
    // (os dados precisam de ser carregados da API)
    await expect(table).toBeVisible({ timeout: 10000 });

    // Verificar que existem linhas com dados (pelo menos uma)
    const rows = page.locator('.bets-table__row');
    await expect(rows.first()).toBeVisible(); // .first() = primeira linha
  });

  // ─── TESTE 3: Colunas obrigatórias ───
  test('deve exibir colunas obrigatórias na tabela', async ({ page }) => {
    const table = page.locator('.bets-table__table');
    await expect(table).toBeVisible({ timeout: 10000 });

    // Verificar que cada coluna obrigatória existe no cabeçalho (<th>)
    // { hasText: 'Texto' } procura o elemento que contém esse texto
    await expect(page.locator('th', { hasText: 'Utilizador' })).toBeVisible();
    await expect(page.locator('th', { hasText: 'Desporto' })).toBeVisible();
    await expect(page.locator('th', { hasText: 'Evento' })).toBeVisible();
    await expect(page.locator('th', { hasText: 'Valor' })).toBeVisible();
    await expect(page.locator('th', { hasText: 'Odds' })).toBeVisible();
    await expect(page.locator('th', { hasText: 'Estado' })).toBeVisible();
    await expect(page.locator('th', { hasText: 'Risco' })).toBeVisible();
  });

  // ─── TESTE 4: Métricas visíveis ───
  test('deve exibir métricas agregadas (US-06)', async ({ page }) => {
    // Verificar que o painel de métricas aparece
    const metricsPanel = page.locator('.metrics-panel');
    await expect(metricsPanel).toBeVisible({ timeout: 10000 });

    // Verificar que pelo menos um card de métrica existe
    await expect(page.locator('.metrics-panel__card').first()).toBeVisible();
  });

  // ─── TESTE 5: Filtros visíveis ───
  test('deve exibir o painel de filtros (US-03)', async ({ page }) => {
    const filters = page.locator('.filters');
    await expect(filters).toBeVisible();

    // Verificar que existem campos de filtro (selects/dropdowns)
    await expect(page.locator('.filters__select').first()).toBeVisible();
  });

  // ─── TESTE 6: Paginação visível ───
  test('deve exibir paginação (US-10)', async ({ page }) => {
    const pagination = page.locator('.pagination');
    await expect(pagination).toBeVisible({ timeout: 10000 });

    // Verificar que a informação "A mostrar X de Y registos" aparece
    await expect(page.locator('.pagination__info')).toBeVisible();
  });
});
