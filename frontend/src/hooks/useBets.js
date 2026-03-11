/*
 * ===== useBets.js =====
 * HOOKS PERSONALIZADOS para gestão de apostas, métricas e WebSocket.
 *
 * Hooks incluídos:
 * 1. useBets()     - Gestão de apostas com paginação, filtros e ordenação
 * 2. useMetrics()  - Métricas de risco agregadas
 * 3. useLiveBets() - Apostas em tempo real via WebSocket
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';

/**
 * ═══════════════════════════════════════════════════
 * HOOK: useBets
 * Gere a listagem de apostas com paginação, filtros e ordenação.
 * ═══════════════════════════════════════════════════
 */
export function useBets() {
  const [bets, setBets] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    totalItems: 0,
    totalPages: 0,
  });
  const [filters, setFilters] = useState({});
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchBets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit,
        sortBy,
        sortOrder,
        ...filters,
      };
      const result = await api.getBets(params);
      setBets(result.data);
      setPagination((prev) => ({
        ...prev,
        totalItems: result.pagination.totalItems,
        totalPages: result.pagination.totalPages,
        hasNextPage: result.pagination.hasNextPage,
        hasPrevPage: result.pagination.hasPrevPage,
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, sortBy, sortOrder, filters]);

  useEffect(() => {
    fetchBets();
  }, [fetchBets]);

  const setPage = (page) => {
    setPagination((prev) => ({ ...prev, page }));
  };

  const setLimit = (limit) => {
    setPagination((prev) => ({ ...prev, page: 1, limit }));
  };

  const updateFilters = (newFilters) => {
    setFilters(newFilters);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const clearFilters = () => {
    setFilters({});
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  return {
    bets,
    pagination,
    filters,
    sortBy,
    sortOrder,
    loading,
    error,
    setPage,
    setLimit,
    updateFilters,
    clearFilters,
    handleSort,
    refetch: fetchBets,
  };
}

/**
 * ═══════════════════════════════════════════════════
 * HOOK: useMetrics
 * Gere as métricas de risco agregadas.
 * ═══════════════════════════════════════════════════
 */
export function useMetrics() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
  }, []);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  return { metrics, loading, error, refetch: fetchMetrics };
}

/**
 * ═══════════════════════════════════════════════════
 * HOOK: useLiveBets
 * Recebe apostas em tempo real via WebSocket.
 *
 * O backend gera apostas periodicamente e envia-as via WebSocket.
 * Este hook mantém um buffer das últimas N apostas recebidas e
 * um contador total.
 *
 * WebSocket vs Polling:
 * - Polling: o frontend pergunta "há dados novos?" a cada X segundos
 * - WebSocket: o backend ENVIA dados assim que existem (tempo real)
 * ═══════════════════════════════════════════════════
 */
export function useLiveBets(maxBuffer = 50) {
  const [liveBets, setLiveBets] = useState([]);
  const [connected, setConnected] = useState(false);
  const [totalReceived, setTotalReceived] = useState(0);
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);

  useEffect(() => {
    function connect() {
      // Construir URL do WebSocket
      // Em desenvolvimento com Vite proxy: usa o mesmo host
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        // Limpar timer de reconexão se existir
        if (reconnectRef.current) {
          clearTimeout(reconnectRef.current);
          reconnectRef.current = null;
        }
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'new_bets' && Array.isArray(message.data)) {
            setTotalReceived((prev) => prev + message.data.length);
            setLiveBets((prev) => {
              // Adicionar novas apostas ao início e manter apenas maxBuffer
              const updated = [...message.data, ...prev];
              return updated.slice(0, maxBuffer);
            });
          }
        } catch {
          // Ignorar mensagens malformadas
        }
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        // Reconectar após 3 segundos
        reconnectRef.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    // Cleanup: fechar WebSocket e limpar timers quando o componente desmonta
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
      }
    };
  }, [maxBuffer]);

  return { liveBets, connected, totalReceived };
}
