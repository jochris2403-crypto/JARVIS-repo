import type { Cell, QueryResult } from '@jarvis/shared';
import { ChevronLeft, ChevronRight, CircleAlert, CircleSlash, Play, Rows3 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Kbd } from '@/components/ui/kbd';
import { Spinner } from '@/components/ui/spinner';
import { cn, formatCount, modKeyLabel } from '@/lib/utils';
import { useQueryStore } from '@/stores/query-store';

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, []);
  return <span className="font-mono tabular-nums">{((now - since) / 1000).toFixed(1)} s</span>;
}

function CellValue({ value }: { value: Cell }) {
  if (value === null) return <span className="text-fg-subtle italic">NULL</span>;
  if (typeof value === 'object') {
    return (
      <span className="text-fg-muted" title={`${value.bytes} bytes of binary data`}>
        0x{value.binary}
        {value.bytes * 2 > value.binary.length ? '…' : ''}{' '}
        <span className="text-fg-subtle">({value.bytes} B)</span>
      </span>
    );
  }
  if (typeof value === 'boolean') return <>{value ? 'true' : 'false'}</>;
  if (value === '') return <span className="text-fg-subtle italic">empty</span>;
  return <>{String(value)}</>;
}

/** Execution status and the result grid for the most recent run. */
export function ResultsPanel({ className }: { className?: string }) {
  const run = useQueryStore((s) => s.run);
  const execute = useQueryStore((s) => s.execute);
  const cancel = useQueryStore((s) => s.cancel);
  const canRun = useQueryStore((s) => s.builder.tables.length > 0 && s.issues.length === 0);

  return (
    <section aria-label="Results" className={cn('flex min-h-0 flex-col bg-bg', className)}>
      {run.status === 'success' ? (
        <ResultGrid result={run.result} />
      ) : (
        <div className="flex flex-1 items-center justify-center">
          {run.status === 'idle' && (
            <EmptyState
              icon={Rows3}
              title="No results yet"
              description={
                canRun ? (
                  <>
                    Run the query to see its rows here.{' '}
                    <span className="inline-flex gap-0.5 align-middle">
                      <Kbd>{modKeyLabel}</Kbd>
                      <Kbd>↵</Kbd>
                    </span>
                  </>
                ) : (
                  'Choose a table to start building a query.'
                )
              }
              actions={
                canRun && (
                  <Button variant="primary" onClick={() => void execute()}>
                    <Play /> Run query
                  </Button>
                )
              }
            />
          )}
          {run.status === 'running' && (
            <div role="status" className="flex flex-col items-center gap-3 text-sm text-fg-muted">
              <div className="flex items-center gap-2.5">
                <Spinner label="Running query" />
                {run.cancelling ? 'Cancelling…' : 'Running query…'}{' '}
                <Elapsed since={run.startedAt} />
              </div>
              <Button size="sm" disabled={run.cancelling} onClick={() => void cancel()}>
                <CircleSlash /> Cancel query
              </Button>
            </div>
          )}
          {run.status === 'cancelled' && (
            <EmptyState
              icon={CircleSlash}
              title="Query cancelled"
              description="The query was stopped on the server before it finished."
              actions={
                <Button onClick={() => void execute()}>
                  <Play /> Run again
                </Button>
              }
            />
          )}
          {run.status === 'error' && (
            <div
              role="alert"
              className="flex max-w-xl flex-col items-center gap-3 px-6 text-center"
            >
              <div className="flex size-9 items-center justify-center rounded-lg bg-danger-muted text-danger">
                <CircleAlert className="size-4" />
              </div>
              <h3 className="text-sm font-semibold">
                {run.code === 'QUERY_TIMEOUT' ? 'Query timed out' : 'The query failed'}
              </h3>
              <p className="font-mono text-xs leading-relaxed text-fg-muted">{run.message}</p>
              {run.mysqlCode && (
                <p className="font-mono text-2xs text-fg-subtle">{run.mysqlCode}</p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ResultGrid({ result }: { result: QueryResult }) {
  const page = useQueryStore((s) => s.page);
  const first = result.offset + 1;
  const last = result.offset + result.rowCount;
  // A full page suggests there may be more; an underfull one is definitely the end.
  const mayHaveMore = result.rowCount === result.limit;

  return (
    <>
      <header className="flex h-9 shrink-0 items-center gap-3 border-b border-border bg-surface pr-2 pl-3 text-xs">
        <h2 className="font-semibold">Results</h2>
        <span role="status" className="text-fg-muted">
          {result.rowCount === 0
            ? 'No rows'
            : `${formatCount(result.rowCount)} row${result.rowCount === 1 ? '' : 's'}`}
          <span className="text-fg-subtle"> · {formatCount(result.durationMs)} ms</span>
        </span>
        <div className="ml-auto flex items-center gap-1">
          {result.rowCount > 0 && (
            <span className="mr-1 font-mono text-2xs text-fg-subtle tabular-nums">
              rows {formatCount(first)}–{formatCount(last)}
            </span>
          )}
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Previous page"
            disabled={result.offset === 0}
            onClick={() => void page(-1)}
          >
            <ChevronLeft />
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Next page"
            disabled={!mayHaveMore}
            onClick={() => void page(1)}
          >
            <ChevronRight />
          </Button>
        </div>
      </header>

      {result.rowCount === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon={Rows3}
            size="sm"
            title="No rows matched"
            description={
              result.offset > 0
                ? 'There are no rows at this offset. Go back a page.'
                : 'The query ran successfully and returned nothing.'
            }
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky top-0 left-0 z-20 w-10 border-r border-b border-border bg-surface-raised px-2 py-1.5 text-right font-mono text-2xs font-normal text-fg-subtle"
                >
                  #
                </th>
                {result.columns.map((column, i) => (
                  <th
                    key={i}
                    scope="col"
                    title={`${column.table ? `${column.table}.` : ''}${column.name} · ${column.dataType}`}
                    className={cn(
                      'sticky top-0 z-10 border-r border-b border-border bg-surface-raised px-2.5 py-1.5 text-left font-medium whitespace-nowrap text-fg',
                      column.numeric && 'text-right',
                    )}
                  >
                    {column.name}
                    <span className="ml-1.5 font-mono text-2xs font-normal text-fg-subtle">
                      {column.dataType}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, r) => (
                <tr key={r} className="group">
                  <td className="sticky left-0 z-10 border-r border-b border-border bg-surface px-2 py-1 text-right font-mono text-2xs text-fg-subtle tabular-nums">
                    {result.offset + r + 1}
                  </td>
                  {row.map((cell, c) => (
                    <td
                      key={c}
                      className={cn(
                        'max-w-96 truncate border-r border-b border-border px-2.5 py-1 font-mono text-fg group-hover:bg-surface-hover',
                        result.columns[c]?.numeric && 'text-right tabular-nums',
                      )}
                      title={typeof cell === 'string' && cell.length > 40 ? cell : undefined}
                    >
                      <CellValue value={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
