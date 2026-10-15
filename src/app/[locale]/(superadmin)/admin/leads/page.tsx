'use client';

/**
 * Leads (Super Admin): the landing page's demo requests.
 *
 * Filter by status, search, move each lead through the pipeline, keep notes,
 * open a WhatsApp chat, or delete. Data comes through React Query, so a slow
 * response can never overwrite a newer one.
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DataTable, type Column } from '@/components/tables/data-table';
import { ConfirmDialog } from '@/components/feedback/confirm-dialog';
import { useToast } from '@/components/feedback/toast-provider';
import { LEAD_STATUSES, type LeadStatus } from '@/schemas/lead.schema';
import {
  deleteLead,
  fetchLeads,
  leadKeys,
  updateLead,
  type Lead,
  type LeadsPage,
} from '@/components/superadmin/leads-api';
import { LeadNotesDialog } from '@/components/superadmin/lead-notes-dialog';

const BRANCH_KEYS: Record<string, 'one' | 'twoToFive' | 'sixPlus'> = {
  '1': 'one',
  '2-5': 'twoToFive',
  '6+': 'sixPlus',
};

const SEARCH_DEBOUNCE_MS = 300;

export default function LeadsPage() {
  const t = useTranslations('superAdmin.leads');
  const { locale } = useParams<{ locale: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<LeadStatus | undefined>();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [notesFor, setNotesFor] = useState<Lead | null>(null);
  const [deleting, setDeleting] = useState<Lead | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const leads = useQuery({
    queryKey: leadKeys.list({ status, search, page }),
    queryFn: () => fetchLeads({ status, search: search || undefined, page }),
    placeholderData: keepPreviousData,
  });

  const update = useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: { status?: LeadStatus; notes?: string | null } }) =>
      updateLead(id, changes),
    // Optimistic: show the change at once (a controlled <select> would
    // otherwise snap back to the old status until the refetch lands), and
    // put the previous data back if the save fails.
    onMutate: async ({ id, changes }) => {
      await queryClient.cancelQueries({ queryKey: leadKeys.all });
      const snapshots = queryClient.getQueriesData<LeadsPage>({ queryKey: [...leadKeys.all, 'list'] });
      for (const [key, data] of snapshots) {
        if (!data) continue;
        queryClient.setQueryData<LeadsPage>(key, {
          ...data,
          items: data.items.map((lead) => (lead.id === id ? { ...lead, ...changes } : lead)),
        });
      }
      return { snapshots };
    },
    onSuccess: () => {
      toast.success(t('updated'));
      setNotesFor(null);
    },
    onError: (_error, _variables, context) => {
      for (const [key, data] of context?.snapshots ?? []) queryClient.setQueryData(key, data);
      toast.error(t('updateError'));
    },
    // Either way, refetch: the per-status counts and the nav badge change too.
    onSettled: () => queryClient.invalidateQueries({ queryKey: leadKeys.all }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteLead(id),
    onSuccess: () => {
      toast.success(t('deleted'));
      setDeleting(null);
      return queryClient.invalidateQueries({ queryKey: leadKeys.all });
    },
    onError: () => toast.error(t('updateError')),
  });

  const received = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Africa/Cairo',
      }),
    [locale]
  );

  const counts = leads.data?.counts ?? {};
  const totalAll = LEAD_STATUSES.reduce((sum, key) => sum + (counts[key] ?? 0), 0);

  const columns: Column<Lead>[] = [
    {
      key: 'createdAt',
      header: t('columns.received'),
      render: (lead) => (
        <span className="whitespace-nowrap text-sm text-muted-foreground">{received.format(new Date(lead.createdAt))}</span>
      ),
    },
    {
      key: 'name',
      header: t('columns.name'),
      render: (lead) => <span className="font-medium text-foreground">{lead.name}</span>,
    },
    { key: 'academyName', header: t('columns.academy') },
    {
      key: 'phone',
      header: t('columns.phone'),
      render: (lead) => (
        <div className="flex flex-col gap-0.5">
          <span dir="ltr" className="whitespace-nowrap text-sm">
            {lead.phone}
          </span>
          <a
            href={`https://wa.me/${lead.phone.replace(/^\+/, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-primary hover:underline"
          >
            {t('whatsapp')}
          </a>
        </div>
      ),
    },
    {
      key: 'branches',
      header: t('columns.branches'),
      render: (lead) => (BRANCH_KEYS[lead.branches] ? t(`branches.${BRANCH_KEYS[lead.branches]}`) : lead.branches),
    },
    {
      key: 'sport',
      header: t('columns.sport'),
      render: (lead) => (t.has(`sports.${lead.sport}`) ? t(`sports.${lead.sport}`) : lead.sport),
    },
    {
      key: 'locale',
      header: t('columns.language'),
      render: (lead) => (lead.locale === 'ar' ? t('language.ar') : t('language.en')),
    },
    {
      key: 'status',
      header: t('columns.status'),
      render: (lead) => (
        <select
          value={lead.status}
          aria-label={t('statusLabel', { name: lead.name })}
          disabled={update.isPending}
          onChange={(event) =>
            update.mutate({ id: lead.id, changes: { status: event.target.value as LeadStatus } })
          }
          className="rounded-lg border border-input bg-card px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {LEAD_STATUSES.map((value) => (
            <option key={value} value={value}>
              {t(`status.${value}`)}
            </option>
          ))}
        </select>
      ),
    },
  ];

  const filterButton = (value: LeadStatus | undefined, label: string, count: number) => {
    const active = status === value;
    return (
      <button
        key={value ?? 'ALL'}
        type="button"
        aria-pressed={active}
        onClick={() => {
          setStatus(value);
          setPage(1);
        }}
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
          active
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border bg-card text-muted-foreground hover:text-foreground'
        }`}
      >
        {label}
        <span className={`rounded-full px-1.5 text-xs ${active ? 'bg-primary-foreground/20' : 'bg-muted'}`}>{count}</span>
      </button>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">{t('title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {filterButton(undefined, t('allStatuses'), totalAll)}
        {LEAD_STATUSES.map((value) => filterButton(value, t(`status.${value}`), counts[value] ?? 0))}
      </div>

      {leads.isError ? (
        <p role="alert" className="rounded-lg border border-border bg-card p-4 text-sm text-destructive">
          {t('loadError')}
        </p>
      ) : (
        <DataTable<Lead>
          columns={columns}
          data={leads.data?.items ?? []}
          isLoading={leads.isPending}
          searchValue={searchInput}
          searchPlaceholder={t('searchPlaceholder')}
          onSearchChange={setSearchInput}
          pagination={leads.data?.pagination}
          onPageChange={setPage}
          emptyMessage={status || search ? t('emptyFiltered') : `${t('empty')}. ${t('emptyDesc')}`}
          actions={(lead) => (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setNotesFor(lead)}
                className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
              >
                {lead.notes ? t('notes') : t('addNotes')}
              </button>
              <button
                type="button"
                onClick={() => setDeleting(lead)}
                className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-destructive hover:bg-muted"
              >
                {t('delete')}
              </button>
            </div>
          )}
        />
      )}

      <LeadNotesDialog
        lead={notesFor}
        labels={{
          title: notesFor ? t('notesTitle', { name: notesFor.name }) : '',
          placeholder: t('notesPlaceholder'),
          save: t('saveNotes'),
          cancel: t('cancel'),
        }}
        isSaving={update.isPending}
        onSave={(notes) => notesFor && update.mutate({ id: notesFor.id, changes: { notes } })}
        onClose={() => setNotesFor(null)}
      />

      <ConfirmDialog
        isOpen={deleting !== null}
        title={t('deleteTitle')}
        message={deleting ? t('deleteMessage', { name: deleting.name, academy: deleting.academyName }) : ''}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        variant="danger"
        isLoading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
