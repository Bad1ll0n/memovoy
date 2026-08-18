'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PlusCircle, Trash2, Wallet, Pencil, X } from 'lucide-react'
import { api } from '@/lib/api'
import { Spinner } from '@/components/ui/Spinner'
import { AlertBanner } from '@/components/ui/AlertBanner'

const CATEGORIES = ['transporte', 'alojamento', 'refeições', 'lazer', 'compras', 'outros'] as const
type Category = typeof CATEGORIES[number]

interface Expense {
  id: string
  amount: number
  currency: string
  category: Category
  description: string
  expenseDate: string | null
  createdAt: string
}

interface ExpensesData {
  expenses: Expense[]
  total: number
  byCategory: Record<string, number>
}

const CAT_COLORS: Record<string, string> = {
  transporte:  '#60a5fa',
  alojamento:  '#f472b6',
  'refeições': '#4ade80',
  lazer:       '#fca311',
  compras:     '#c084fc',
  outros:      '#94a3b8',
}

interface Props {
  itineraryId: string
  budget: number | null
  currency: string
  isOwner: boolean
}

const EMPTY_FORM = (currency: string) => ({
  amount: '', currency: currency || 'EUR', category: 'outros' as Category, description: '', expense_date: '',
})

export function ExpensesPanel({ itineraryId, budget, currency, isOwner }: Props) {
  const qc = useQueryClient()
  const qKey = ['expenses', itineraryId]

  const { data, isLoading } = useQuery<ExpensesData>({
    queryKey: qKey,
    queryFn:  () => api.get(`/expenses/itinerary/${itineraryId}`),
    enabled:  isOwner,
  })

  const [showForm, setShowForm]   = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm]           = useState(EMPTY_FORM(currency))
  const [formErr, setFormErr]     = useState('')

  function openAdd() {
    setEditingId(null)
    setForm(EMPTY_FORM(currency))
    setFormErr('')
    setShowForm(true)
  }

  function openEdit(exp: Expense) {
    setEditingId(exp.id)
    setForm({
      amount:       String(exp.amount),
      currency:     exp.currency,
      category:     exp.category,
      description:  exp.description,
      expense_date: exp.expenseDate ?? '',
    })
    setFormErr('')
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setFormErr('')
  }

  const addMutation = useMutation({
    mutationFn: () =>
      api.post(`/expenses/itinerary/${itineraryId}`, {
        amount:       parseFloat(form.amount),
        currency:     form.currency,
        category:     form.category,
        description:  form.description,
        expense_date: form.expense_date || null,
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qKey }); closeForm() },
    onError: (err: unknown) => setFormErr(err instanceof Error ? err.message : 'Erro ao adicionar.'),
  })

  const editMutation = useMutation({
    mutationFn: (id: string) =>
      api.patch(`/expenses/${id}`, {
        amount:       parseFloat(form.amount),
        currency:     form.currency,
        category:     form.category,
        description:  form.description,
        expense_date: form.expense_date || null,
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qKey }); closeForm() },
    onError: (err: unknown) => setFormErr(err instanceof Error ? err.message : 'Erro ao editar.'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/expenses/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qKey }),
  })

  if (!isOwner) return null

  const total      = data?.total ?? 0
  const pct        = budget && budget > 0 ? Math.min((total / budget) * 100, 100) : 0
  const overBudget = budget && total > budget
  const isPending  = addMutation.isPending || editMutation.isPending

  function handleSubmit() {
    if (!form.amount) return
    if (editingId) editMutation.mutate(editingId)
    else addMutation.mutate()
  }

  return (
    <div className="card p-4 mt-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Wallet className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
            Despesas
          </h3>
        </div>
        <button
          onClick={openAdd}
          className="btn btn-secondary text-xs gap-1.5 py-1 px-2.5"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          Adicionar
        </button>
      </div>

      {/* Budget progress */}
      {budget && budget > 0 && (
        <div className="mb-4">
          <div className="flex justify-between text-xs mb-1">
            <span style={{ color: 'var(--text-muted)' }}>Gasto: {total.toFixed(2)} {currency}</span>
            <span style={{ color: overBudget ? 'var(--danger)' : 'var(--text-muted)' }}>
              Orçamento: {budget} {currency}
            </span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface2)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, background: overBudget ? 'var(--danger)' : 'var(--accent)' }}
            />
          </div>
        </div>
      )}

      {/* Add / Edit form */}
      {showForm && (
        <div className="rounded-xl p-3 mb-4 space-y-2.5" style={{ background: 'var(--surface2)' }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
              {editingId ? 'Editar despesa' : 'Nova despesa'}
            </span>
            <button onClick={closeForm} className="btn btn-ghost p-1" style={{ color: 'var(--text-muted)' }}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {formErr && <AlertBanner variant="danger" message={formErr} />}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Valor</label>
              <input
                type="number"
                className="input text-sm"
                placeholder="0.00"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <label className="label">Moeda</label>
              <input
                type="text"
                className="input text-sm"
                maxLength={5}
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))}
              />
            </div>
          </div>
          <div>
            <label className="label">Categoria</label>
            <select
              className="input text-sm"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as Category }))}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Descrição</label>
            <input
              type="text"
              className="input text-sm"
              placeholder="Ex: Jantar no restaurante X"
              maxLength={200}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Data (opcional)</label>
            <input
              type="date"
              className="input text-sm"
              value={form.expense_date}
              onChange={(e) => setForm((f) => ({ ...f, expense_date: e.target.value }))}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSubmit}
              disabled={isPending || !form.amount}
              className="btn btn-primary text-xs flex-1"
            >
              {isPending ? <Spinner size="sm" /> : editingId ? 'Actualizar' : 'Guardar'}
            </button>
            <button onClick={closeForm} className="btn btn-secondary text-xs">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-4"><Spinner /></div>
      ) : data && data.expenses.length > 0 ? (
        <>
          {/* By category summary */}
          <div className="flex flex-wrap gap-2 mb-3">
            {CATEGORIES.filter((c) => (data.byCategory[c] ?? 0) > 0).map((c) => (
              <span
                key={c}
                className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                style={{ background: `${CAT_COLORS[c]}22`, color: CAT_COLORS[c] }}
              >
                {c}: {data.byCategory[c].toFixed(0)} {currency}
              </span>
            ))}
          </div>

          {/* Expense list */}
          <ul className="space-y-2">
            {data.expenses.map((exp) => (
              <li
                key={exp.id}
                className="group flex items-center gap-2.5 p-2.5 rounded-xl"
                style={{ background: 'var(--surface2)' }}
              >
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: CAT_COLORS[exp.category] ?? 'var(--text-muted)' }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {exp.description || exp.category}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {exp.category}{exp.expenseDate ? ` · ${exp.expenseDate}` : ''}
                  </p>
                </div>
                <span className="text-sm font-bold shrink-0" style={{ color: 'var(--accent)' }}>
                  {exp.amount.toFixed(2)} {exp.currency}
                </span>
                <button
                  onClick={() => openEdit(exp)}
                  className="btn btn-ghost p-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: 'var(--text-muted)' }}
                  aria-label="Editar despesa"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => deleteMutation.mutate(exp.id)}
                  className="btn btn-ghost p-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: 'var(--text-muted)' }}
                  aria-label="Eliminar despesa"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>

          <p className="text-xs text-right mt-3 font-bold" style={{ color: 'var(--text-secondary)' }}>
            Total: {total.toFixed(2)} {currency}
          </p>
        </>
      ) : (
        <p className="text-xs text-center py-3" style={{ color: 'var(--text-muted)' }}>
          Ainda sem despesas registadas.
        </p>
      )}
    </div>
  )
}
