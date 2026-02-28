/*
 * ===== useBets.js =====
 * Este ficheiro contém HOOKS PERSONALIZADOS (custom hooks).
 * 
 * O que é um Hook?
 * Um Hook é uma função especial do React que permite "ligar" lógica ao ciclo de vida
 * dos componentes. Os hooks do React começam sempre com "use" (useState, useEffect, etc.).
 *
 * O que é um Custom Hook?
 * É um hook que NÓS criamos para encapsular lógica reutilizável.
 * Em vez de ter toda a lógica de busca de dados dentro do App.jsx,
 * separamos num hook para manter o código organizado e reutilizável.
 *
 * HOOKS USADOS AQUI:
 * - useState: cria uma variável de "estado" (que quando muda, o componente redesenha)
 * - useEffect: executa código quando o componente monta ou quando dependências mudam
 * - useCallback: memoriza uma função para evitar recriações desnecessárias
 *
 * CONCEITO IMPORTANTE - "Estado" (State):
 * Em React, o "estado" são dados que podem mudar ao longo do tempo.
 * Quando o estado muda, o React automaticamente redesenha o componente com os novos dados.
 * Ex: useState([]) cria um array vazio como estado inicial, e uma função para o alterar.
 */

// Importar os hooks do React que vamos usar
import { useState, useEffect, useCallback } from 'react';

// Importar o nosso serviço de API para fazer pedidos ao backend
import api from '../services/api';

/**
 * ═══════════════════════════════════════════════════
 * HOOK: useBets
 * Gere todo o estado relacionado com as apostas:
 * - Lista de apostas
 * - Paginação (que página estamos, quantas existem)
 * - Filtros (por desporto, valor, risco, etc.)
 * - Ordenação (por que coluna, ascendente ou descendente)
 * - Loading e erros
 * ═══════════════════════════════════════════════════
 */
export function useBets() {
  /*
   * ─── DECLARAÇÃO DE ESTADO ───
   * useState(valorInicial) devolve um array com 2 elementos:
   *   [0] = o valor atual do estado
   *   [1] = função para alterar o estado
   * 
   * Exemplo: const [bets, setBets] = useState([])
   *   bets → valor atual (começa como array vazio [])
   *   setBets → função para atualizar (ex: setBets([...novosdados]))
   */

  // Array com as apostas da página atual (começa vazio)
  const [bets, setBets] = useState([]);

  // Objeto com informação de paginação
  const [pagination, setPagination] = useState({
    page: 1,         // Página atual (começa na 1)
    limit: 20,       // Número de apostas por página
    totalItems: 0,   // Total de apostas na base de dados
    totalPages: 0,   // Total de páginas disponíveis
  });

  // Objeto com os filtros ativos (começa sem filtros)
  const [filters, setFilters] = useState({});

  // Coluna pela qual estamos a ordenar (por defeito: data de criação)
  const [sortBy, setSortBy] = useState('createdAt');

  // Direção da ordenação ('desc' = mais recentes primeiro)
  const [sortOrder, setSortOrder] = useState('desc');

  // Flag de carregamento (true enquanto estamos à espera de dados)
  const [loading, setLoading] = useState(true);

  // Mensagem de erro (null se não houver erro)
  const [error, setError] = useState(null);

  /*
   * ─── FUNÇÃO PRINCIPAL: fetchBets ───
   * 
   * useCallback "memoriza" a função para evitar que seja recriada em cada render.
   * Isto é importante para o useEffect: se a função mudasse em cada render,
   * o useEffect executaria infinitamente.
   *
   * O array no final [pagination.page, pagination.limit, sortBy, sortOrder, filters]
   * diz ao React: "só recria esta função se algum destes valores mudar".
   */
  const fetchBets = useCallback(async () => {
    setLoading(true);   // Indicar que estamos a carregar
    setError(null);      // Limpar erro anterior

    try {
      // Construir o objeto com todos os parâmetros para enviar ao backend
      // O operador "spread" (...filters) expande o objeto filters para dentro deste novo objeto
      const params = {
        page: pagination.page,
        limit: pagination.limit,
        sortBy,
        sortOrder,
        ...filters, // Ex: se filters = { sport: 'football' }, adiciona sport: 'football'
      };

      // Chamar a API e esperar pela resposta
      const result = await api.getBets(params);

      // Atualizar o estado com os novos dados
      setBets(result.data); // Array de apostas

      // Atualizar a paginação com os dados vindos do servidor
      // (prev) => (...) é um "callback de atualização" que garante que temos o valor mais recente
      setPagination((prev) => ({
        ...prev, // Manter os valores que já temos (page, limit)
        totalItems: result.pagination.totalItems,
        totalPages: result.pagination.totalPages,
        hasNextPage: result.pagination.hasNextPage,
        hasPrevPage: result.pagination.hasPrevPage,
      }));
    } catch (err) {
      // Se algo correu mal, guardar a mensagem de erro
      setError(err.message);
    } finally {
      // "finally" executa SEMPRE, quer tenha havido erro ou não
      setLoading(false); // Parar de mostrar o indicador de carregamento
    }
  }, [pagination.page, pagination.limit, sortBy, sortOrder, filters]);

  /*
   * ─── EFEITO: Buscar dados quando algo muda ───
   * 
   * useEffect com [fetchBets] como dependência:
   * Sempre que fetchBets mudar (ou seja, quando page, limit, sortBy, sortOrder ou filters mudam),
   * este efeito é executado, chamando fetchBets para buscar os novos dados.
   *
   * Na prática: quando o utilizador muda de página ou aplica um filtro,
   * os dados são automaticamente atualizados.
   */
  useEffect(() => {
    fetchBets();
  }, [fetchBets]);

  /*
   * ─── FUNÇÕES AUXILIARES ───
   * Estas funções são passadas como props aos componentes filhos.
   * Quando o utilizador interage com a UI, estas funções atualizam o estado,
   * o que dispara o useEffect acima para buscar novos dados.
   */

  // Mudar para uma página específica
  const setPage = (page) => {
    setPagination((prev) => ({ ...prev, page }));
  };

  // Mudar o número de itens por página (volta à página 1)
  const setLimit = (limit) => {
    setPagination((prev) => ({ ...prev, page: 1, limit }));
  };

  // Aplicar novos filtros (volta à página 1 porque os resultados mudam)
  const updateFilters = (newFilters) => {
    setFilters(newFilters);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  // Limpar todos os filtros (volta à página 1)
  const clearFilters = () => {
    setFilters({});
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  // Mudar a ordenação de uma coluna
  // Se clicar na mesma coluna, inverte a direção (asc ↔ desc)
  // Se clicar numa coluna diferente, ordena por essa coluna (desc por defeito)
  const handleSort = (field) => {
    if (sortBy === field) {
      // Mesma coluna: inverter direção
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      // Coluna diferente: ordenar por esta coluna, descendente
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  /*
   * ─── RETORNO DO HOOK ───
   * Devolver todos os valores e funções que os componentes precisam.
   * Quem usar este hook (ex: App.jsx) terá acesso a tudo isto.
   */
  return {
    bets,           // Array de apostas
    pagination,     // Info de paginação
    filters,        // Filtros ativos
    sortBy,         // Coluna de ordenação
    sortOrder,      // Direção de ordenação
    loading,        // Flag de carregamento
    error,          // Mensagem de erro
    setPage,        // Função: mudar página
    setLimit,       // Função: mudar limite por página
    updateFilters,  // Função: aplicar filtros
    clearFilters,   // Função: limpar filtros
    handleSort,     // Função: ordenar coluna
    refetch: fetchBets, // Função: forçar atualização dos dados
  };
}

/**
 * ═══════════════════════════════════════════════════
 * HOOK: useMetrics
 * Gere o estado das métricas agregadas.
 * Similar ao useBets mas mais simples (não tem filtros nem paginação).
 * ═══════════════════════════════════════════════════
 */
export function useMetrics() {
  // Estado para guardar as métricas (null até serem carregadas)
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Função para buscar as métricas ao servidor
  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getMetrics();
      setMetrics(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []); // [] vazio = a função nunca muda (não tem dependências)

  // Buscar métricas quando o componente é montado
  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  // Devolver os valores e funções necessárias
  return { metrics, loading, error, refetch: fetchMetrics };
}
