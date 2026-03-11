/*
 * ===== bets.js (Router de Apostas) =====
 * Define todos os ENDPOINTS relacionados com apostas.
 *
 * MODELO DE APOSTA (Bet):
 * { id, sport, event, betType, selection, odd, stake, createdAt }
 *
 * ENDPOINTS:
 * GET /api/bets              → Listagem paginada e filtrada
 * GET /api/bets/sports/list  → Lista de desportos únicos
 * GET /api/bets/events/list  → Lista de eventos (com filtro por desporto)
 * GET /api/bets/bet-types/list → Lista de tipos de aposta
 * GET /api/bets/selections/list → Lista de seleções (com filtros)
 * GET /api/bets/:id          → Detalhe de uma aposta
 */

import { Router } from 'express';

export default function betsRouter(db) {
  const router = Router();

  /*
   * ─── ROTAS ESPECÍFICAS (antes de /:id para evitar conflito) ───
   */

  /**
   * GET /api/bets/sports/list
   * Lista todos os desportos únicos na base de dados.
   */
  router.get('/sports/list', (req, res) => {
    const sports = [...new Set(db.data.bets.map((b) => b.sport))].sort();
    res.json({ data: sports });
  });

  /**
   * GET /api/bets/events/list
   * Lista eventos únicos (com filtro opcional por desporto).
   * Ex: /api/bets/events/list?sport=Football
   */
  router.get('/events/list', (req, res) => {
    let bets = db.data.bets;
    if (req.query.sport) {
      bets = bets.filter((b) => b.sport.toLowerCase() === req.query.sport.toLowerCase());
    }
    const events = [...new Set(bets.map((b) => b.event))].sort();
    res.json({ data: events });
  });

  /**
   * GET /api/bets/bet-types/list
   * Lista todos os tipos de aposta únicos.
   */
  router.get('/bet-types/list', (req, res) => {
    const betTypes = [...new Set(db.data.bets.map((b) => b.betType))].sort();
    res.json({ data: betTypes });
  });

  /**
   * GET /api/bets/selections/list
   * Lista seleções únicas (com filtro por evento e/ou tipo).
   * Ex: /api/bets/selections/list?event=Manchester+United+vs+Liverpool&betType=Win
   */
  router.get('/selections/list', (req, res) => {
    let bets = db.data.bets;
    if (req.query.event) {
      bets = bets.filter((b) => b.event.toLowerCase() === req.query.event.toLowerCase());
    }
    if (req.query.betType) {
      bets = bets.filter((b) => b.betType.toLowerCase() === req.query.betType.toLowerCase());
    }
    const selections = [...new Set(bets.map((b) => b.selection))].sort();
    res.json({ data: selections });
  });

  /*
   * ─── ROTA PRINCIPAL: LISTAGEM ───
   */

  /**
   * GET /api/bets
   * Listagem paginada e filtrada de apostas.
   *
   * Query params:
   *   page, limit, sortBy, sortOrder
   *   sport, event, betType, selection
   *   minStake, maxStake, minOdd, maxOdd
   *   dateFrom, dateTo, search
   *
   * Ex: /api/bets?page=1&limit=20&sport=Football&sortBy=stake&sortOrder=desc
   */
  router.get('/', (req, res) => {
    try {
      const {
        page = 1,
        limit = 20,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        sport,
        event,
        betType,
        selection,
        minStake,
        maxStake,
        minOdd,
        maxOdd,
        dateFrom,
        dateTo,
        search,
      } = req.query;

      let bets = [...db.data.bets];

      /* ─── FILTROS ─── */

      // Filtro por desporto (suporta múltiplos: "Football,Basketball")
      if (sport) {
        const sports = sport.split(',').map((s) => s.trim().toLowerCase());
        bets = bets.filter((b) => sports.includes(b.sport.toLowerCase()));
      }

      // Filtro por evento (pesquisa parcial)
      if (event) {
        const eventLower = event.toLowerCase();
        bets = bets.filter((b) => b.event.toLowerCase().includes(eventLower));
      }

      // Filtro por tipo de aposta (suporta múltiplos: "Win,Over/Under")
      if (betType) {
        const types = betType.split(',').map((t) => t.trim().toLowerCase());
        bets = bets.filter((b) => types.includes(b.betType.toLowerCase()));
      }

      // Filtro por seleção (pesquisa parcial)
      if (selection) {
        const selLower = selection.toLowerCase();
        bets = bets.filter((b) => b.selection.toLowerCase().includes(selLower));
      }

      // Filtro por intervalo de stake (€)
      if (minStake) {
        bets = bets.filter((b) => b.stake >= parseFloat(minStake));
      }
      if (maxStake) {
        bets = bets.filter((b) => b.stake <= parseFloat(maxStake));
      }

      // Filtro por intervalo de odds
      if (minOdd) {
        bets = bets.filter((b) => b.odd >= parseFloat(minOdd));
      }
      if (maxOdd) {
        bets = bets.filter((b) => b.odd <= parseFloat(maxOdd));
      }

      // Filtro por intervalo de datas
      if (dateFrom) {
        const from = new Date(dateFrom);
        bets = bets.filter((b) => new Date(b.createdAt) >= from);
      }
      if (dateTo) {
        const to = new Date(dateTo);
        bets = bets.filter((b) => new Date(b.createdAt) <= to);
      }

      // Pesquisa geral: procura o texto em evento, seleção, tipo, desporto ou ID
      if (search) {
        const searchLower = search.toLowerCase();
        bets = bets.filter(
          (b) =>
            b.event.toLowerCase().includes(searchLower) ||
            b.selection.toLowerCase().includes(searchLower) ||
            b.betType.toLowerCase().includes(searchLower) ||
            b.sport.toLowerCase().includes(searchLower) ||
            b.id.toLowerCase().includes(searchLower)
        );
      }

      /* ─── ORDENAÇÃO ─── */
      const validSortFields = [
        'createdAt', 'stake', 'odd', 'sport', 'event', 'betType', 'selection',
      ];
      const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
      const order = sortOrder === 'asc' ? 1 : -1;

      bets.sort((a, b) => {
        const aVal = a[sortField];
        const bVal = b[sortField];
        if (typeof aVal === 'string') {
          return aVal.localeCompare(bVal) * order;
        }
        return (aVal - bVal) * order;
      });

      /* ─── PAGINAÇÃO ─── */
      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
      const totalItems = bets.length;
      const totalPages = Math.ceil(totalItems / limitNum);
      const startIndex = (pageNum - 1) * limitNum;
      const paginatedBets = bets.slice(startIndex, startIndex + limitNum);

      res.json({
        data: paginatedBets,
        pagination: {
          page: pageNum,
          limit: limitNum,
          totalItems,
          totalPages,
          hasNextPage: pageNum < totalPages,
          hasPrevPage: pageNum > 1,
        },
        filters: {
          sport: sport || null,
          event: event || null,
          betType: betType || null,
          selection: selection || null,
          minStake: minStake ? parseFloat(minStake) : null,
          maxStake: maxStake ? parseFloat(maxStake) : null,
          minOdd: minOdd ? parseFloat(minOdd) : null,
          maxOdd: maxOdd ? parseFloat(maxOdd) : null,
          dateFrom: dateFrom || null,
          dateTo: dateTo || null,
          search: search || null,
        },
      });
    } catch (error) {
      console.error('Erro ao listar apostas:', error);
      res.status(500).json({ error: 'Erro interno ao processar o pedido' });
    }
  });

  /**
   * GET /api/bets/:id
   * Retorna o detalhe de uma aposta específica.
   */
  router.get('/:id', (req, res) => {
    const bet = db.data.bets.find((b) => b.id === req.params.id);
    if (!bet) {
      return res.status(404).json({ error: 'Aposta não encontrada' });
    }
    res.json({ data: bet });
  });

  return router;
}
