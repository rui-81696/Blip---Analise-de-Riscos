/*
 * ===== metrics.js (Router de Métricas) =====
 * Define o endpoint que calcula e devolve MÉTRICAS AGREGADAS.
 *
 * O QUE SÃO MÉTRICAS AGREGADAS?
 * São cálculos que resumem/sumarizam os dados:
 * - Total de apostas (count)
 * - Soma de valores (sum)
 * - Média de risco (average)
 * - Agrupamentos por desporto/estado (group by)
 *
 * Estes cálculos são feitos no backend (servidor) para não sobrecarregar
 * o frontend (browser do utilizador) com processamento pesado.
 *
 * CONCEITOS JS USADOS:
 * - .reduce(): percorre um array e acumula um resultado
 *   Ex: [1,2,3].reduce((soma, n) => soma + n, 0) → 6
 * - .filter(): cria um novo array com elementos que passam a condição
 * - forEach():  percorre cada elemento (sem criar novo array)
 */

// Router do Express
import { Router } from 'express';

/**
 * Cria e configura o router de métricas.
 *
 * @param {object} db - Instância da base de dados LowDB
 * @returns {Router} Router configurado
 */
export default function metricsRouter(db) {
  const router = Router();

  /**
   * ═══════════════════════════════════════════════════
   * GET /api/metrics
   * Calcula e devolve todas as métricas agregadas.
   *
   * Resposta inclui:
   *   - totalBets: número total de apostas
   *   - totalAmount: soma de todos os valores apostados
   *   - totalProfit: lucro total (apostas ganhas: valor * odds - valor)
   *   - totalLoss: perda total (soma dos valores das apostas perdidas)
   *   - riskExposure: exposição ao risco (apostas pending * odds)
   *   - avgRiskScore: risco médio
   *   - bySport: distribuição por desporto
   *   - byStatus: distribuição por estado
   *   - riskDistribution: contagem por nível de risco
   * ═══════════════════════════════════════════════════
   */
  router.get('/', (req, res) => {
    try {
      const bets = db.data.bets;

      // Se não há apostas, devolver zeros
      if (!bets || bets.length === 0) {
        return res.json({
          totalBets: 0,
          totalAmount: 0,
          totalProfit: 0,
          totalLoss: 0,
          riskExposure: 0,
          avgRiskScore: 0,
          bySport: {},
          byStatus: {},
          riskDistribution: { low: 0, medium: 0, high: 0, critical: 0 },
        });
      }

      /* ─── MÉTRICAS GERAIS ─── */

      // Total de apostas (simplesmente o tamanho do array)
      const totalBets = bets.length;

      // Soma de todos os valores apostados
      // .reduce() acumula: começa com sum=0, e para cada aposta soma b.amount
      const totalAmount = bets.reduce((sum, b) => sum + b.amount, 0);

      /* ─── LUCRO ─── */
      // Filtrar apostas ganhas ("won")
      const wonBets = bets.filter((b) => b.status === 'won');
      // Lucro = para cada aposta ganha: (valor * odds) - valor
      // Ex: aposta de 100€ com odds 3.0 = 300€ - 100€ = 200€ de lucro
      const totalProfit = wonBets.reduce((sum, b) => sum + (b.amount * b.odds - b.amount), 0);

      /* ─── PERDA ─── */
      // Filtrar apostas perdidas ("lost")
      const lostBets = bets.filter((b) => b.status === 'lost');
      // Perda = soma dos valores apostados nas apostas perdidas
      const totalLoss = lostBets.reduce((sum, b) => sum + b.amount, 0);

      /* ─── EXPOSIÇÃO AO RISCO ─── */
      // Apostas pendentes representam risco pois o resultado é desconhecido
      // Exposição = soma de (valor * odds) de apostas pendentes
      const pendingBets = bets.filter((b) => b.status === 'pending');
      const riskExposure = pendingBets.reduce((sum, b) => sum + b.amount * b.odds, 0);

      /* ─── RISCO MÉDIO ─── */
      // Média = soma de todos os riskScores / número de apostas
      const avgRiskScore = bets.reduce((sum, b) => sum + b.riskScore, 0) / totalBets;

      /* ─── DISTRIBUIÇÃO POR DESPORTO ─── */
      // Cria um objeto onde cada chave é um desporto e o valor são as estatísticas
      // Ex: { football: { count: 100, amount: 50000, avgRisk: 45 }, ... }
      const bySport = {};
      bets.forEach((b) => {
        // Se este desporto ainda não existe no objeto, inicializar
        if (!bySport[b.sport]) {
          bySport[b.sport] = { count: 0, amount: 0, avgRisk: 0, totalRisk: 0 };
        }
        // Incrementar contadores
        bySport[b.sport].count++;
        bySport[b.sport].amount += b.amount;
        bySport[b.sport].totalRisk += b.riskScore;
      });
      // Calcular a média de risco e arredondar os valores
      Object.keys(bySport).forEach((sport) => {
        bySport[sport].avgRisk = Math.round(bySport[sport].totalRisk / bySport[sport].count);
        bySport[sport].amount = Math.round(bySport[sport].amount * 100) / 100;
        delete bySport[sport].totalRisk; // Remover campo auxiliar (não é necessário na resposta)
      });

      /* ─── DISTRIBUIÇÃO POR ESTADO ─── */
      // Similar à distribuição por desporto, mas agrupado por status
      // Ex: { pending: { count: 120, amount: 25000 }, won: { ... }, ... }
      const byStatus = {};
      bets.forEach((b) => {
        if (!byStatus[b.status]) {
          byStatus[b.status] = { count: 0, amount: 0 };
        }
        byStatus[b.status].count++;
        byStatus[b.status].amount += b.amount;
      });
      // Arredondar valores monetários a 2 casas decimais
      Object.keys(byStatus).forEach((status) => {
        byStatus[status].amount = Math.round(byStatus[status].amount * 100) / 100;
      });

      /* ─── DISTRIBUIÇÃO POR NÍVEL DE RISCO ─── */
      // Conta quantas apostas estão em cada nível de risco
      // Ex: { low: 150, medium: 200, high: 100, critical: 50 }
      const riskDistribution = {
        low: bets.filter((b) => b.riskScore <= 25).length,                              // 0-25
        medium: bets.filter((b) => b.riskScore > 25 && b.riskScore <= 50).length,        // 26-50
        high: bets.filter((b) => b.riskScore > 50 && b.riskScore <= 75).length,          // 51-75
        critical: bets.filter((b) => b.riskScore > 75).length,                           // 76-100
      };

      // Enviar todas as métricas calculadas como resposta JSON
      // Math.round(x * 100) / 100 arredonda a 2 casas decimais
      // Math.round(x * 10) / 10 arredonda a 1 casa decimal
      res.json({
        totalBets,
        totalAmount: Math.round(totalAmount * 100) / 100,
        totalProfit: Math.round(totalProfit * 100) / 100,
        totalLoss: Math.round(totalLoss * 100) / 100,
        riskExposure: Math.round(riskExposure * 100) / 100,
        avgRiskScore: Math.round(avgRiskScore * 10) / 10,
        bySport,
        byStatus,
        riskDistribution,
      });
    } catch (error) {
      console.error('Erro ao calcular métricas:', error);
      res.status(500).json({ error: 'Erro interno ao calcular métricas' });
    }
  });

  return router;
}
