import * as Dialog from "@radix-ui/react-dialog"
import "./HighlightRulesSheet.scss"
import {
  RULE_FIELDS,
  RULE_OPERATORS,
  RULE_COLORS,
  createDefaultRule,
  formatRulePreview,
  countActiveRules,
} from "../utils/highlightRules"

/**
 * Painel lateral (Sheet, baseado em @radix-ui/react-dialog) para gerir as
 * Regras de Highlight. O estado vive no componente pai; aqui recebemos `rules`
 * e emitimos atualizações via `onRulesChange`.
 */
export default function HighlightRulesSheet({ rules, onRulesChange }) {
  const activeCount = countActiveRules(rules)

  function addRule() {
    onRulesChange([...rules, createDefaultRule()])
  }

  function updateRule(id, patch) {
    onRulesChange(rules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)))
  }

  function removeRule(id) {
    onRulesChange(rules.filter((rule) => rule.id !== id))
  }

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button type="button" className="hr-trigger" aria-label="Gerir regras de highlight">
          <FilterIcon />
          <span>Regras</span>
          {activeCount > 0 && <span className="hr-trigger-badge">{activeCount}</span>}
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="hr-overlay" />
        <Dialog.Content className="hr-sheet" aria-describedby={undefined}>
          <header className="hr-sheet-header">
            <div>
              <Dialog.Title className="hr-sheet-title">Regras de Highlight</Dialog.Title>
              <p className="hr-sheet-subtitle">
                Uma linha é destacada quando <strong>todas</strong> as regras ativas se verificam.
              </p>
            </div>
            <Dialog.Close className="hr-icon-button" aria-label="Fechar">
              <CloseIcon />
            </Dialog.Close>
          </header>

          <div className="hr-sheet-body">
            {rules.length === 0 ? (
              <div className="hr-empty">
                <FilterIcon />
                <p className="hr-empty-title">Sem regras definidas</p>
                <p className="hr-empty-sub">
                  Adiciona uma regra para destacar linhas — por exemplo, “Stake Total &gt; 8000”.
                </p>
              </div>
            ) : (
              rules.map((rule) => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  onUpdate={(patch) => updateRule(rule.id, patch)}
                  onRemove={() => removeRule(rule.id)}
                />
              ))
            )}
          </div>

          <footer className="hr-sheet-footer">
            <button type="button" className="hr-add-button" onClick={addRule}>
              <PlusIcon />
              Adicionar Regra
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function RuleCard({ rule, onUpdate, onRemove }) {
  const disabled = !rule.active

  return (
    <div className={`hr-card ${disabled ? "inactive" : ""}`}>
      <div className="hr-card-head">
        <input
          className="hr-card-name"
          type="text"
          value={rule.name}
          onChange={(event) => onUpdate({ name: event.target.value })}
          placeholder="Nome da regra"
          aria-label="Nome da regra"
        />

        <div className="hr-card-actions">
          <button
            type="button"
            className={`hr-icon-button ${rule.active ? "on" : ""}`}
            onClick={() => onUpdate({ active: !rule.active })}
            aria-label={rule.active ? "Desativar regra" : "Ativar regra"}
            aria-pressed={rule.active}
            title={rule.active ? "Ativa" : "Inativa"}
          >
            {rule.active ? <EyeIcon /> : <EyeOffIcon />}
          </button>
          <button
            type="button"
            className="hr-icon-button danger"
            onClick={onRemove}
            aria-label="Eliminar regra"
            title="Eliminar"
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      <div className="hr-card-grid">
        <select
          value={rule.field}
          onChange={(event) => onUpdate({ field: event.target.value })}
          disabled={disabled}
          aria-label="Campo"
        >
          {RULE_FIELDS.map((field) => (
            <option key={field.key} value={field.key}>
              {field.label}
            </option>
          ))}
        </select>

        <select
          value={rule.operator}
          onChange={(event) => onUpdate({ operator: event.target.value })}
          disabled={disabled}
          aria-label="Operador"
        >
          {RULE_OPERATORS.map((operator) => (
            <option key={operator.key} value={operator.key}>
              {operator.label}
            </option>
          ))}
        </select>

        <input
          type="number"
          value={rule.value}
          onChange={(event) => onUpdate({ value: event.target.value === "" ? 0 : Number(event.target.value) })}
          disabled={disabled}
          aria-label="Valor"
          placeholder="Valor"
        />
      </div>

      <div className="hr-card-footer">
        <div className="hr-swatches">
          {RULE_COLORS.map((color) => (
            <button
              key={color.key}
              type="button"
              className={`hr-swatch ${rule.color === color.key ? "selected" : ""}`}
              style={{ background: color.border }}
              onClick={() => onUpdate({ color: color.key })}
              disabled={disabled}
              aria-label={`Cor ${color.label}`}
              title={color.label}
            />
          ))}
        </div>
        <span className="hr-preview">{formatRulePreview(rule)}</span>
      </div>
    </div>
  )
}

// ─── Ícones ─────────────────────────────────────────────────────────────────

function FilterIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  )
}
