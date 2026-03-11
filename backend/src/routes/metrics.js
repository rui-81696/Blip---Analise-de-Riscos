/*
 * ===== metrics.js (Router de Métricas / Análise de Risco) =====
 * Define o endpoint que calcula e devolve a ANÁLISE DE RISCO da empresa.
 *
 * CONCEITO DE RISCO (perspetiva da casa de apostas):
 * Para cada seleção (ex: "Manchester United to Win"):
 * - Potencial Perda = Σ(stake × odd) → quanto a empresa paga se a seleção se verificar
 * - Potencial Ganho = Σ(stake) → quanto a empresa fica se a seleção NÃO se verificar
 *
 * EXEMPLO:
 *   1000 apostas em "Manchester United to Win" com odd média 1.5 e total stake 15000€
 *   → Potencial Perda = 22500€ (empresa paga se ManUtd ganhar)
 *   → Potencial Ganho = 15000€ (empresa fica se ManUtd NÃO ganhar)
 *
 * O risco é maior quando:
 * - Muitas apostas concentradas na mesma seleção (volume alto)
 * - Total stake alto × odds favoráveis = potencial perda elevada
 */

import { Router } from 'express';

export default function metricsRouter(db) {
  const router = Router();

  /**
   * GET /api/metrics
   * Calcula e devolve todas as métricas de risco.
   *
   * Resposta:
   * {
   *   overview: { totalBets, totalStake, totalPotentialLoss, avgOdd, avgStake, ... },
   *   bySelection: [...],   // Top seleções por risco (potentialLoss desc)
   *   byEvent: [...],       // Risco agregado por evento
   *   bySport: { ... },     // Risco agregado por desporto
   * }
   */
  router.get('/', (req, res) => {
    try {
      const bets = db.data.bets;

      // Se não há apostas, devolver zeros
      if (!bets || bets.length === 0) {
        return res.json({
          overview: {
            totalBets: 0,
            totalStake: 0,
            totalPotentialLoss: 0,
            avgOdd: 0,
            avgStake: 0,
            uniqueEvents: 0,
            uniqueSelections: 0,
          },
          bySelection: [],
          byEvent: [],
          bySport: {},
        });
      }

      /* ─── VISÃO GERAL (Overview) ─── */
      const totalBets = bets.length;
      const totalStake = bets.reduce((sum, b) => sum + b.stake, 0);
      // Potencial perda total = soma de (stake × odd) para TODAS as apostas
      const totalPotentialLoss = bets.reduce((sum, b) => sum + b.stake * b.odd, 0);
      const avgOdd = bets.reduce((sum, b) => sum + b.odd, 0) / totalBets;
      const avgStake = totalStake / totalBets;
      const uniqueEvents = new Set(bets.map((b) => b.event)).size;
      // Seleção única = combinação evento + seleção (mesma seleção em eventos diferentes são distintas)
      const uniqueSelections = new Set(bets.map((b) => `${b.event}|${b.selection}`)).size;

      /* ─── RISCO POR SELEÇÃO (a análise principal) ─── */
      // Agrupar apostas por seleção dentro de cada evento
      const selectionMap = {};
      bets.forEach((b) => {
        // Chave única: evento + seleção (ex: "ManUtd vs Liverpool|ManUtd to Win")
        const key = `${b.event}|${b.selection}`;
        if (!selectionMap[key]) {
          selectionMap[key] = {
            selection: b.selection,
            event: b.event,
            sport: b.sport,
            betType: b.betType,
            count: 0,
            totalStake: 0,
            potentialLoss: 0,
            odds: new Set(), // Odds únicas usadas nesta seleção
          };
        }
        selectionMap[key].count++;
        selectionMap[key].totalStake += b.stake;
        selectionMap[key].potentialLoss += b.stake * b.odd;
        selectionMap[key].odds.add(b.odd);
      });

      // Converter para array, calcular médias, ordenar por risco (potentialLoss desc)
      const bySelection = Object.values(selectionMap)
        .map((s) => ({
          selection: s.selection,
          event: s.event,
          sport: s.sport,
          betType: s.betType,
          count: s.count,
          totalStake: Math.round(s.totalStake * 100) / 100,
          // avgOdd = potentialLoss / totalStake (média ponderada pela stake)
          avgOdd: Math.round((s.potentialLoss / s.totalStake) * 100) / 100,
          potentialLoss: Math.round(s.potentialLoss * 100) / 100,
          odds: [...s.odds].sort((a, b) => a - b), // Array das odds usadas, ordenado
        }))
        .sort((a, b) => b.potentialLoss - a.potentialLoss); // Maior risco primeiro

      /* ─── RISCO POR EVENTO ─── */
      const eventMap = {};
      bets.forEach((b) => {
        if (!eventMap[b.event]) {
          eventMap[b.event] = {
            event: b.event,
            sport: b.sport,
            count: 0,
            totalStake: 0,
            potentialLoss: 0,
          };
        }
        eventMap[b.event].count++;
        eventMap[b.event].totalStake += b.stake;
        eventMap[b.event].potentialLoss += b.stake * b.odd;
      });

      // Contar seleções únicas por evento e arredondar valores
      Object.keys(eventMap).forEach((event) => {
        eventMap[event].selectionsCount = new Set(
          bets.filter((b) => b.event === event).map((b) => b.selection)
        ).size;
        eventMap[event].totalStake = Math.round(eventMap[event].totalStake * 100) / 100;
        eventMap[event].potentialLoss = Math.round(eventMap[event].potentialLoss * 100) / 100;
      });

      const byEvent = Object.values(eventMap)
        .sort((a, b) => b.potentialLoss - a.potentialLoss); // Maior risco primeiro

      /* ─── RISCO POR DESPORTO ─── */
      const bySport = {};
      bets.forEach((b) => {
        if (!bySport[b.sport]) {
          bySport[b.sport] = { count: 0, totalStake: 0, potentialLoss: 0 };
        }
        bySport[b.sport].count++;
        bySport[b.sport].totalStake += b.stake;
        bySport[b.sport].potentialLoss += b.stake * b.odd;
      });
      // Arredondar valores
      Object.keys(bySport).forEach((sport) => {
        bySport[sport].totalStake = Math.round(bySport[sport].totalStake * 100) / 100;
        bySport[sport].potentialLoss = Math.round(bySport[sport].potentialLoss * 100) / 100;
      });

      /* ─── RESPOSTA ─── */
      res.json({
        overview: {
          totalBets,
          totalStake: Math.round(totalStake * 100) / 100,
          totalPotentialLoss: Math.round(totalPotentialLoss * 100) / 100,
          avgOdd: Math.round(avgOdd * 100) / 100,
          avgStake: Math.round(avgStake * 100) / 100,
          uniqueEvents,
          uniqueSelections,
        },
        bySelection: bySelection.slice(0, 20), // Top 20 seleções de maior risco
        byEvent,
        bySport,
      });
    } catch (error) {
      console.error('Erro ao calcular métricas:', error);
      res.status(500).json({ error: 'Erro interno ao calcular métricas' });
    }
  });

  return router;
}
