/*
 * ===== bets.js (Router de Apostas) =====
 * Define todos os ENDPOINTS (URLs) relacionados com apostas.
 *
 * O QUE É UM ROUTER?
 * Um Router agrupa endpoints relacionados. Em vez de definir tudo no index.js,
 * separamos por funcionalidade. Este router é "montado" em '/api/bets' no index.js,
 * por isso GET '/' aqui corresponde a GET '/api/bets' na API.
 *
 * O QUE É UM ENDPOINT?
 * É uma URL que a API disponibiliza. Cada endpoint responde a um método HTTP:
 * - GET: pedir dados (leitura)
 * - POST: criar dados
 * - PUT/PATCH: atualizar dados
 * - DELETE: apagar dados
 *
 * CONCEITOS EXPRESS:
 * - router.get(caminho, handler): define um endpoint GET
 * - req (request): objeto com toda a info do pedido (query params, body, etc.)
 * - res (response): objeto para enviar a resposta ao cliente
 * - req.query: parâmetros da URL (ex: ?page=1&limit=20)
 * - req.params: parâmetros da rota (ex: /bets/:id → req.params.id)
 * - res.json(): envia uma resposta em formato JSON
 */

// Router do Express (módulo para agrupar endpoints)
import { Router } from 'express';

/**
 * Função que cria e configura o router de apostas.
 * Recebe a instância da base de dados (db) como parâmetro.
 *
 * @param {object} db - Instância da base de dados LowDB
 * @returns {Router} Router configurado com todos os endpoints
 */
export default function betsRouter(db) {
  // Criar nova instância de Router
  const router = Router();

  /**
   * ═══════════════════════════════════════════════════
   * GET /api/bets
   * Endpoint principal: listagem paginada e filtrada de apostas
   *
   * Query params (parâmetros na URL após o ?):
   *   - page: número da página (começa em 1)
   *   - limit: quantos itens por página (máx 100)
   *   - sortBy: campo para ordenar (ex: 'createdAt', 'amount')
   *   - sortOrder: 'asc' (crescente) ou 'desc' (decrescente)
   *   - sport: filtrar por desporto (ex: 'football')
   *   - status: filtrar por estado (ex: 'pending')
   *   - minAmount/maxAmount: intervalo de valor
   *   - minRisk/maxRisk: intervalo de risco
   *   - dateFrom/dateTo: intervalo de datas
   *   - search: pesquisa geral em texto
   *
   * Exemplo de URL:
   *   /api/bets?page=1&limit=20&sport=football&sortBy=amount&sortOrder=desc
   * ═══════════════════════════════════════════════════
   */
  router.get('/', (req, res) => {
    try {
      /*
       * ─── EXTRAIR PARÂMETROS DA QUERY STRING ───
       * Destructuring com valores por defeito:
       * { page = 1 } significa: se 'page' não existir na query, usa 1
       */
      const {
        page = 1,
        limit = 20,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        sport,
        event,
        status,
        minAmount,
        maxAmount,
        minRisk,
        maxRisk,
        dateFrom,
        dateTo,
        search,
      } = req.query;

      // Criar uma CÓPIA do array de apostas para não alterar o original
      // [...array] cria um novo array com os mesmos elementos (spread operator)
      let bets = [...db.data.bets];

      /*
       * ─── APLICAR FILTROS ───
       * Cada filtro reduz o array de apostas usando .filter()
       * .filter() cria um novo array com apenas os elementos que passam a condição
       * Ex: bets.filter(b => b.sport === 'football') → só apostas de futebol
       */

      // Filtro por desporto (suporta múltiplos: "football,basketball")
      if (sport) {
        const sports = sport.split(',').map((s) => s.trim().toLowerCase());
        bets = bets.filter((b) => sports.includes(b.sport.toLowerCase()));
      }

      // Filtro por evento (pesquisa parcial com .includes())
      // .includes() verifica se uma string contém outra string
      if (event) {
        const eventLower = event.toLowerCase();
        bets = bets.filter((b) => b.event.toLowerCase().includes(eventLower));
      }

      // Filtro por status (suporta múltiplos: "pending,won")
      if (status) {
        const statuses = status.split(',').map((s) => s.trim().toLowerCase());
        bets = bets.filter((b) => statuses.includes(b.status.toLowerCase()));
      }

      // Filtro por intervalo de valor (mínimo e máximo)
      // parseFloat() converte string para número decimal
      if (minAmount) {
        bets = bets.filter((b) => b.amount >= parseFloat(minAmount));
      }
      if (maxAmount) {
        bets = bets.filter((b) => b.amount <= parseFloat(maxAmount));
      }

      // Filtro por intervalo de risco score
      // parseInt() converte string para número inteiro
      if (minRisk) {
        bets = bets.filter((b) => b.riskScore >= parseInt(minRisk));
      }
      if (maxRisk) {
        bets = bets.filter((b) => b.riskScore <= parseInt(maxRisk));
      }

      // Filtro por intervalo de datas
      // new Date() converte string ISO num objeto Date para comparação
      if (dateFrom) {
        const from = new Date(dateFrom);
        bets = bets.filter((b) => new Date(b.createdAt) >= from);
      }
      if (dateTo) {
        const to = new Date(dateTo);
        bets = bets.filter((b) => new Date(b.createdAt) <= to);
      }

      // Pesquisa geral: procura o texto em userId, event, sport ou id
      // O operador || (OU) retorna true se QUALQUER condição for true
      if (search) {
        const searchLower = search.toLowerCase();
        bets = bets.filter(
          (b) =>
            b.userId.toLowerCase().includes(searchLower) ||
            b.event.toLowerCase().includes(searchLower) ||
            b.sport.toLowerCase().includes(searchLower) ||
            b.id.toLowerCase().includes(searchLower)
        );
      }

      /*
       * ─── ORDENAÇÃO ───
       * .sort() ordena o array "in-place" (modifica o próprio array).
       * A função de comparação recebe 2 elementos (a, b):
       * - Retorna negativo: a vem antes de b
       * - Retorna positivo: b vem antes de a
       * - Retorna 0: mantém a ordem
       *
       * "order" é 1 (asc) ou -1 (desc) - multiplicar inverte a ordem.
       */

      // Validar que o campo de ordenação é permitido (segurança)
      const validSortFields = [
        'createdAt', 'amount', 'odds', 'riskScore',
        'sport', 'event', 'status', 'userId',
      ];
      const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
      const order = sortOrder === 'asc' ? 1 : -1;

      bets.sort((a, b) => {
        const aVal = a[sortField]; // Acesso dinâmico: a['amount'] = a.amount
        const bVal = b[sortField];

        // Strings usam localeCompare (comparação alfabética correta)
        if (typeof aVal === 'string') {
          return aVal.localeCompare(bVal) * order;
        }
        // Números usam subtração simples
        return (aVal - bVal) * order;
      });

      /*
       * ─── PAGINAÇÃO ───
       * Divide os resultados em "páginas" para não enviar tudo de uma vez.
       * Ex: 500 apostas com limit=20 → 25 páginas de 20 apostas cada
       *
       * Math.max(1, ...) garante que a página é pelo menos 1
       * Math.min(100, ...) limita o máximo de itens por página a 100
       * .slice(start, end) extrai uma parte do array
       */
      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
      const totalItems = bets.length;
      const totalPages = Math.ceil(totalItems / limitNum); // Math.ceil arredonda para cima

      // Calcular o índice de início e extrair a "fatia" da página atual
      const startIndex = (pageNum - 1) * limitNum;
      const paginatedBets = bets.slice(startIndex, startIndex + limitNum);

      // Enviar a resposta JSON ao frontend
      res.json({
        data: paginatedBets,    // Apostas desta página
        pagination: {           // Info de paginação
          page: pageNum,
          limit: limitNum,
          totalItems,
          totalPages,
          hasNextPage: pageNum < totalPages,  // Há próxima página?
          hasPrevPage: pageNum > 1,           // Há página anterior?
        },
        filters: {              // Filtros que foram aplicados (echo back)
          sport: sport || null,
          event: event || null,
          status: status || null,
          minAmount: minAmount ? parseFloat(minAmount) : null,
          maxAmount: maxAmount ? parseFloat(maxAmount) : null,
          minRisk: minRisk ? parseInt(minRisk) : null,
          maxRisk: maxRisk ? parseInt(maxRisk) : null,
          dateFrom: dateFrom || null,
          dateTo: dateTo || null,
          search: search || null,
        },
      });
    } catch (error) {
      // Se algum erro ocorrer, log no servidor e resposta 500 ao cliente
      console.error('Erro ao listar apostas:', error);
      res.status(500).json({ error: 'Erro interno ao processar o pedido' });
    }
  });

  /**
   * ═══════════════════════════════════════════════════
   * GET /api/bets/:id
   * Retorna o detalhe de UMA aposta específica.
   * :id é um parâmetro dinâmico na URL (req.params.id).
   * Ex: GET /api/bets/a1b2c3d4-... → devolve a aposta com esse ID
   * ═══════════════════════════════════════════════════
   */
  router.get('/:id', (req, res) => {
    // .find() procura o primeiro elemento que satisfaz a condição
    const bet = db.data.bets.find((b) => b.id === req.params.id);

    // Se não encontrou, responde com status 404 (Not Found)
    if (!bet) {
      return res.status(404).json({ error: 'Aposta não encontrada' });
    }

    // Se encontrou, responde com a aposta
    res.json({ data: bet });
  });

  /**
   * ═══════════════════════════════════════════════════
   * GET /api/bets/sports/list
   * Lista todos os desportos únicos existentes na base de dados.
   *
   * new Set() remove duplicados de um array (um Set só guarda valores únicos)
   * [...new Set(array)] converte o Set de volta para array
   * .sort() ordena alfabeticamente
   * ═══════════════════════════════════════════════════
   */
  router.get('/sports/list', (req, res) => {
    const sports = [...new Set(db.data.bets.map((b) => b.sport))].sort();
    res.json({ data: sports });
  });

  /**
   * ═══════════════════════════════════════════════════
   * GET /api/bets/events/list
   * Lista todos os eventos únicos (com filtro opcional por desporto).
   * Ex: /api/bets/events/list?sport=football → só eventos de futebol
   * ═══════════════════════════════════════════════════
   */
  router.get('/events/list', (req, res) => {
    let bets = db.data.bets;

    // Se foi especificado um desporto, filtrar primeiro
    if (req.query.sport) {
      bets = bets.filter((b) => b.sport.toLowerCase() === req.query.sport.toLowerCase());
    }

    // Extrair eventos únicos e ordenar
    const events = [...new Set(bets.map((b) => b.event))].sort();
    res.json({ data: events });
  });

  // Devolver o router configurado para ser usado no index.js
  return router;
}
