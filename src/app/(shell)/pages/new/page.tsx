'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Github,
  Gitlab,
  ChevronRight,
  Loader2,
  Search,
  Plus,
  RefreshCw,
  FolderGit2,
} from 'lucide-react';
import { api } from '@/lib/client/api';
import { getToken } from '@/lib/client/auth';
import { useI18n } from '@/lib/client/i18n';

interface Repo {
  name: string;
  branch: string;
  language: string | null;
}

// Step indicator (like CF Pages' "Select a repository → Set up builds and deployments →
// Deploy site"). Step 1 is active here.
const STEPS = [
  { key: '1', labelKey: 'pg.step1SelectRepo' },
  { key: '2', labelKey: 'pg.step2SetBuild' },
  { key: '3', labelKey: 'pg.step3Deploy' },
];

// "Select a repository" screen (/pages/new), modeled after Cloudflare Pages. Shows a
// GitHub / GitLab provider toggle and the connected account's repositories. Picking a
// repository continues to the build/deploy setup at /pages/deploy.
export default function NewProjectPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState<'github' | 'gitlab'>('github');
  const [github, setGithub] = useState<{ enabled: boolean; connected: boolean; repos: Repo[] }>({ enabled: false, connected: false, repos: [] });
  const [gitlab, setGitlab] = useState<{ enabled: boolean; connected: boolean; repos: Repo[] }>({ enabled: false, connected: false, repos: [] });
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const loadSources = () =>
    api
      .pagesSources()
      .then((s) => {
        setAvailable(s.available);
        setGithub(s.github);
        setGitlab(s.gitlab);
      })
      .catch(() => {});

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    loadSources().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  if (loading) {
    return (
      <div className="mx-auto flex max-w-3xl items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!available) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <p className="text-muted-foreground">{t('pg.notConfiguredMsg')}</p>
        <button onClick={() => router.push('/pages')} className="mt-4 text-primary hover:underline">
          {t('dd.back')}
        </button>
      </div>
    );
  }

  const active = provider === 'github' ? github : gitlab;
  const filteredRepos = active.repos.filter((r) => !query || r.name.toLowerCase().includes(query.toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(filteredRepos.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRepos = filteredRepos.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function chooseRepo(repo: Repo) {
    router.push(`/pages/deploy?source=${provider}&repo=${encodeURIComponent(repo.name)}&ref=${encodeURIComponent(repo.branch)}`);
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      {/* Back link */}
      <Link href="/pages" className="mb-6 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> {t('pg.backProjects')}
      </Link>

      {/* Step indicator */}
      <div className="mb-8 flex items-center gap-2 text-xs">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                  i === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}
              >
                {s.key}
              </span>
              <span className={i === 0 ? 'font-medium text-foreground' : 'text-muted-foreground'}>{t(s.labelKey)}</span>
            </div>
            {i < STEPS.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
          </div>
        ))}
      </div>

      <h1 className="text-2xl font-bold">{t('pg.selectRepoTitle')}</h1>

      {/* Provider toggle */}
      <div className="mt-6 flex items-center gap-2 rounded-lg border bg-card p-2">
        <button
          onClick={() => { setProvider('github'); setPage(1); }}
          disabled={!github.enabled}
          className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${
            provider === 'github' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'
          } disabled:opacity-40`}
        >
          <Github className="h-4 w-4" /> GitHub
          {!github.enabled && <span className="text-xs">({t('pg.notConfigured')})</span>}
        </button>
        <button
          onClick={() => { setProvider('gitlab'); setPage(1); }}
          disabled={!gitlab.enabled}
          className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${
            provider === 'gitlab' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'
          } disabled:opacity-40`}
        >
          <Gitlab className="h-4 w-4" /> GitLab
          {!gitlab.enabled && <span className="text-xs">({t('pg.notConfigured')})</span>}
        </button>
      </div>

      {/* Account / connect */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {active.connected ? t('pg.connectedAccount') : t('pg.notConnected')}
        </p>
        {active.connected ? (
          <button
            onClick={loadSources}
            className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs hover:bg-secondary"
          >
            <RefreshCw className="h-3 w-3" /> {t('pg.refresh')}
          </button>
        ) : (
          <Link href="/connections" className="flex items-center gap-1 text-sm text-primary hover:underline">
            <Plus className="h-3.5 w-3.5" /> {t('pg.connectGitAccount')}
          </Link>
        )}
      </div>

      {/* Search */}
      {active.repos.length > 0 && (
        <div className="mt-4 flex items-center gap-2 rounded-md border bg-card px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            placeholder={t('pg.searchRepos')}
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>
      )}

      {/* Repository list */}
      <div className="mt-4 space-y-2">
        {active.repos.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            {active.connected ? t('pg.noRepos') : t('pg.connectToSeeRepos')}
          </div>
        ) : filteredRepos.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            {t('pg.noMatchRepos')}
          </div>
        ) : (
          <>
            {pageRepos.map((r) => (
              <button
                key={r.name}
                onClick={() => chooseRepo(r)}
                className="flex w-full items-center gap-3 rounded-lg border bg-card p-3 text-left transition hover:border-primary/50 hover:bg-secondary/50"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <FolderGit2 className="h-4 w-4" />
                </span>
                <span className="flex-1 truncate">
                  <span className="block truncate text-sm font-medium">{r.name}</span>
                  <span className="block text-xs text-muted-foreground">{r.branch}</span>
                </span>
                <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {r.language || '—'}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t pt-3">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className="rounded-md border px-3 py-1.5 text-xs hover:bg-secondary disabled:opacity-40"
                >
                  {t('pg.prevPage')}
                </button>
                <span className="text-xs text-muted-foreground">
                  {safePage} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className="rounded-md border px-3 py-1.5 text-xs hover:bg-secondary disabled:opacity-40"
                >
                  {t('pg.nextPage')}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
