/*
 * ===== Pagination.jsx =====
 * COMPONENTE: Paginação da Tabela
 *
 * Permite navegar entre páginas de resultados quando existem
 * muitas apostas. Mostra:
 * - Informação "A mostrar X-Y de Z registos"
 * - Botões de primeira, anterior, páginas numéricas, próxima, última
 * - Seletor de itens por página (10, 20, 50, 100)
 *
 * CONCEITO: Destructuring de props
 * Em vez de receber "props" como objeto e usar props.pagination,
 * extraímos diretamente { pagination, onPageChange, onLimitChange }
 * E depois fazemos outro destructuring de pagination para extrair os sub-campos.
 */

import './Pagination.scss';

/**
 * Componente Pagination
 *
 * Props:
 * @param {object} pagination - Objeto com info de paginação:
 *   { page, limit, totalItems, totalPages, hasNextPage, hasPrevPage }
 * @param {function} onPageChange - Callback quando o user muda de página
 * @param {function} onLimitChange - Callback quando o user muda itens por página
 */
export default function Pagination({ pagination, onPageChange, onLimitChange }) {
  // Destructuring: extrair cada campo do objeto pagination
  const { page, limit, totalItems, totalPages, hasNextPage, hasPrevPage } = pagination;

  // Opções disponíveis para itens por página
  const limitOptions = [10, 20, 50, 100];

  /**
   * Calcula quais números de página mostrar nos botões.
   * Se temos 100 páginas, não queremos mostrar 100 botões!
   * Mostra no máximo 5 botões centrados na página atual.
   * Ex: Se estamos na página 15 de 100, mostra [13, 14, 15, 16, 17]
   */
  const getVisiblePages = () => {
    const pages = [];
    const maxVisible = 5; // Máximo de botões de página a mostrar

    // Calcular o início (centrado na página atual)
    let start = Math.max(1, page - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);

    // Ajustar o início se ficámos perto do fim
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }

    // Construir o array de números de página
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  };

  return (
    <div className="pagination">
      {/* ─── INFO: "A mostrar X-Y de Z registos" ─── */}
      {/* Math.min() garante que não mostramos números maiores que o total */}
      <div className="pagination__info">
        <span>
          A mostrar {Math.min((page - 1) * limit + 1, totalItems)}–
          {Math.min(page * limit, totalItems)} de {totalItems} registos
        </span>
      </div>

      {/* ─── BOTÕES DE NAVEGAÇÃO ─── */}
      <div className="pagination__controls">
        {/* Primeira página (««) - desativado se não há página anterior */}
        <button
          className="pagination__btn"
          onClick={() => onPageChange(1)}
          disabled={!hasPrevPage}
          title="Primeira página"
        >
          ««
        </button>

        {/* Página anterior («) */}
        <button
          className="pagination__btn"
          onClick={() => onPageChange(page - 1)}
          disabled={!hasPrevPage}
          title="Página anterior"
        >
          «
        </button>

        {/* Botões numéricos das páginas */}
        {/* O botão da página atual tem a classe --active (cor diferente) */}
        {getVisiblePages().map((p) => (
          <button
            key={p}
            className={`pagination__btn ${p === page ? 'pagination__btn--active' : ''}`}
            onClick={() => onPageChange(p)}
          >
            {p}
          </button>
        ))}

        {/* Próxima página (») */}
        <button
          className="pagination__btn"
          onClick={() => onPageChange(page + 1)}
          disabled={!hasNextPage}
          title="Próxima página"
        >
          »
        </button>

        {/* Última página (»») */}
        <button
          className="pagination__btn"
          onClick={() => onPageChange(totalPages)}
          disabled={!hasNextPage}
          title="Última página"
        >
          »»
        </button>
      </div>

      {/* ─── SELETOR DE ITENS POR PÁGINA ─── */}
      <div className="pagination__limit">
        <label htmlFor="page-limit">Por página:</label>
        {/* htmlFor liga a <label> ao <select> pelo id (acessibilidade) */}
        {/* parseInt converte o valor de string para número inteiro */}
        <select
          id="page-limit"
          value={limit}
          onChange={(e) => onLimitChange(parseInt(e.target.value))}
        >
          {limitOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
