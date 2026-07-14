'use client';

/**
 * ISSA — Expenses Page
 *
 * Add-expense form + DataTable with category/date filters and pagination.
 * Access: Admin + Moderator with can_view_finances (read), can_manage_expenses (write).
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth/auth-context';
import { UserRole } from '@/types';
import { DataTable, Column } from '@/components/tables/data-table';
import { useToast } from '@/components/feedback/toast-provider';
import { Plus, Loader2, AlertTriangle, XCircle, Trash2 } from 'lucide-react';

interface Expense {
  id: string;
  category: string;
  amount: string | number;
  date: string;
  description: string | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function ExpensesPage() {
  const t = useTranslations('finance');
  const tCommon = useTranslations('common');
  const { user, authFetch } = useAuth();
  const { toast } = useToast();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');

  const fetchExpenses = useCallback(
    async (page: number) => {
      setIsLoading(true);
      try {
        const res = await authFetch(`/api/finance/expenses?page=${page}&limit=20`);
        if (!res.ok) throw new Error('Failed to load expenses');
        const data = await res.json();
        setExpenses(data.data || []);
        if (data.pagination) setPagination(data.pagination);
      } catch (err: any) {
        toast.error(err.message || tCommon('somethingWentWrong'));
      } finally {
        setIsLoading(false);
      }
    },
    [authFetch, toast, tCommon]
  );

  useEffect(() => {
    fetchExpenses(1);
  }, [fetchExpenses]);

  const canManage =
    user?.role === UserRole.ADMIN ||
    (user?.role === UserRole.MODERATOR &&
      (user as any).privileges?.includes('can_manage_expenses'));

  const canView =
    user?.role === UserRole.ADMIN ||
    (user?.role === UserRole.MODERATOR &&
      (user as any).privileges?.includes('can_view_finances'));

  const resetForm = () => {
    setIsCreateOpen(false);
    setCategory('');
    setAmount('');
    setDate(new Date().toISOString().slice(0, 10));
    setDescription('');
    setFormError(null);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const amountNum = Number(amount);
    if (!category.trim()) {
      setFormError('Category is required');
      return;
    }
    if (!amountNum || amountNum <= 0) {
      setFormError('Amount must be a positive number');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await authFetch('/api/finance/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: category.trim(),
          amount: amountNum,
          date,
          description: description.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || tCommon('somethingWentWrong'));
      }

      toast.success(tCommon('success'));
      resetForm();
      fetchExpenses(1);
    } catch (err: any) {
      setFormError(err.message || tCommon('somethingWentWrong'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (expense: Expense) => {
    try {
      const res = await authFetch(`/api/finance/expenses/${expense.id}`, {
        method: 'DELETE',
      });
      if (!res.ok && res.status !== 204) {
        const data = await res.json();
        throw new Error(data.error?.message || tCommon('somethingWentWrong'));
      }
      toast.success(tCommon('success'));
      fetchExpenses(pagination.page);
    } catch (err: any) {
      toast.error(err.message || tCommon('somethingWentWrong'));
    }
  };

  if (user && !canView) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-600 dark:text-slate-400">
        <XCircle className="w-8 h-8 me-3 text-red-600 dark:text-red-400" />
        <span>Access denied.</span>
      </div>
    );
  }

  const columns: Column<Expense>[] = [
    { key: 'category', header: t('category'), className: 'font-semibold text-slate-900 dark:text-slate-100' },
    {
      key: 'amount',
      header: t('amount'),
      render: (row) => <span className="text-slate-800 dark:text-slate-200">{Number(row.amount).toFixed(2)}</span>,
    },
    {
      key: 'date',
      header: t('date'),
      render: (row) => (
        <span className="text-slate-600 dark:text-slate-400">{new Date(row.date).toLocaleDateString()}</span>
      ),
    },
    {
      key: 'description',
      header: t('description'),
      render: (row) => (
        <span className="text-slate-600 dark:text-slate-400 max-w-xs truncate block">{row.description || '—'}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h2 className="text-2xl font-extrabold tracking-wide bg-gradient-to-r from-slate-900 via-slate-800 to-slate-600 dark:from-white dark:via-slate-100 dark:to-slate-400 bg-clip-text text-transparent">
          {t('expenses')}
        </h2>

        {canManage && (
          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white transition-all duration-300 shadow-lg shadow-cyan-500/10"
          >
            <Plus size={14} />
            <span>{t('addExpense')}</span>
          </button>
        )}
      </div>

      <div className="bg-white/70 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-900 shadow-2xl rounded-2xl p-4 backdrop-blur-xl">
        <DataTable
          columns={columns}
          data={expenses}
          isLoading={isLoading}
          pagination={pagination}
          onPageChange={fetchExpenses}
          emptyMessage={tCommon('noResults')}
          actions={
            canManage
              ? (row) => (
                  <button
                    onClick={() => handleDelete(row)}
                    className="h-7 w-7 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-red-900/50 bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                    title={tCommon('delete')}
                  >
                    <Trash2 size={13} />
                  </button>
                )
              : undefined
          }
        />
      </div>

      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-md px-4">
          <div className="w-full max-w-md p-1 rounded-3xl bg-gradient-to-b from-cyan-500/10 via-blue-500/5 to-slate-50 dark:to-slate-950 border border-slate-200/80 dark:border-slate-800/80 shadow-2xl backdrop-blur-xl">
            <div className="bg-white/95 dark:bg-slate-950/95 rounded-[22px] p-6">
              <div className="flex justify-between items-center mb-5">
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('addExpense')}</h3>
                <button
                  onClick={resetForm}
                  className="h-7 w-7 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  &times;
                </button>
              </div>

              {formError && (
                <div className="mb-4 p-3 rounded-xl bg-red-950/30 border border-red-800/40 text-red-200 text-xs flex items-start gap-2.5">
                  <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    {t('category')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="Maintenance, Supplies, Utilities..."
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900/50 px-4 py-2.5 text-xs focus:border-cyan-500 focus:outline-none focus:ring-4 focus:ring-cyan-500/10 text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      {t('amount')} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900/50 px-4 py-2.5 text-xs focus:border-cyan-500 focus:outline-none focus:ring-4 focus:ring-cyan-500/10 text-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      {t('date')} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900/50 px-4 py-2.5 text-xs focus:border-cyan-500 focus:outline-none focus:ring-4 focus:ring-cyan-500/10 text-slate-900 dark:text-slate-100"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    {t('description')}
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900/50 px-4 py-2.5 text-xs focus:border-cyan-500 focus:outline-none focus:ring-4 focus:ring-cyan-500/10 text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-3">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-all duration-200"
                    disabled={isSubmitting}
                  >
                    {tCommon('cancel')}
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold text-xs transition-all duration-300 flex items-center justify-center gap-1.5 disabled:opacity-50"
                    disabled={isSubmitting}
                  >
                    {isSubmitting && <Loader2 size={12} className="animate-spin" />}
                    <span>{tCommon('create')}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
