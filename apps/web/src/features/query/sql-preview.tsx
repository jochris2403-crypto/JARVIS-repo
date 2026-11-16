import { Check, Copy } from 'lucide-react';
import { Fragment, useState } from 'react';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Spinner } from '@/components/ui/spinner';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';
import { useQueryStore } from '@/stores/query-store';

const KEYWORDS =
  'SELECT|DISTINCT|FROM|INNER|LEFT|RIGHT|CROSS|JOIN|ON|AS|WHERE|AND|OR|NOT|IN|BETWEEN|LIKE|REGEXP|IS|NULL|GROUP|BY|HAVING|ORDER|ASC|DESC|LIMIT|OFFSET|SEPARATOR';
/** Identifiers, strings, keywords, function names, numbers and placeholders — in that priority. */
const TOKEN = new RegExp(
  "(`(?:[^`]|``)*`)|('(?:[^'\\\\]|\\\\.|'')*')|\\b(" +
    KEYWORDS +
    ')\\b|\\b([A-Z_]+)(?=\\()|\\b(\\d+(?:\\.\\d+)?)\\b|(\\?)',
  'g',
);

/** Minimal SQL colouring for the statements the compiler produces. Purely presentational. */
function highlight(sql: string) {
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const match of sql.matchAll(TOKEN)) {
    const [text, identifier, string, keyword, fn, number, placeholder] = match;
    if (match.index > last) out.push(sql.slice(last, match.index));
    const className = identifier
      ? 'text-fg'
      : string
        ? 'text-success'
        : keyword
          ? 'text-accent'
          : fn
            ? 'text-warning'
            : number || placeholder
              ? 'text-warning'
              : undefined;
    out.push(
      <span key={match.index} className={className}>
        {text}
      </span>,
    );
    last = match.index + text.length;
  }
  if (last < sql.length) out.push(sql.slice(last));
  return out.map((node, i) => <Fragment key={i}>{node}</Fragment>);
}

const VIEW_OPTIONS = [
  { value: 'readable', label: 'Readable' },
  { value: 'parameterized', label: 'As sent' },
] as const;

/** Read-only view of the SQL the server generated for the current builder state. */
export function SqlPreview({ className }: { className?: string }) {
  const compiled = useQueryStore((s) => s.compiled);
  const status = useQueryStore((s) => s.compileStatus);
  const error = useQueryStore((s) => s.compileError);
  const issues = useQueryStore((s) => s.issues);
  const hasTables = useQueryStore((s) => s.builder.tables.length > 0);
  const [view, setView] = useState<'readable' | 'parameterized'>('readable');
  const [copied, setCopied] = useState(false);

  const blocked = issues.length > 0;
  const sql = compiled ? (view === 'readable' ? compiled.displaySql : compiled.sql) : null;

  const copy = async () => {
    if (!sql) return;
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      notify('error', 'Could not copy to the clipboard');
    }
  };

  return (
    <section
      aria-label="Generated SQL"
      className={cn('flex min-h-0 flex-col bg-surface', className)}
    >
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-border pr-2 pl-3">
        <h2 className="text-xs font-semibold">Generated SQL</h2>
        {status === 'loading' && (
          <Spinner className="size-3 text-fg-subtle" label="Generating SQL" />
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <SegmentedControl
            aria-label="SQL view"
            value={view}
            onChange={setView}
            options={VIEW_OPTIONS}
          />
          <Button size="xs" variant="ghost" disabled={!sql || blocked} onClick={() => void copy()}>
            {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        {!hasTables ? (
          <p className="px-3 py-4 text-xs text-fg-subtle">
            The SQL appears here as you build the query.
          </p>
        ) : (
          <>
            {blocked && (
              <div role="status" className="border-b border-border bg-warning-muted px-3 py-2">
                <p className="text-xs font-medium text-warning">
                  Finish these steps to update the SQL:
                </p>
                <ul className="mt-1 list-disc pl-4 text-xs text-fg-muted">
                  {issues.map((issue, i) => (
                    <li key={i}>{issue.message}</li>
                  ))}
                </ul>
              </div>
            )}
            {status === 'error' && (
              <p
                role="alert"
                className="border-b border-border bg-danger-muted px-3 py-2 text-xs text-danger"
              >
                {error}
              </p>
            )}
            {sql && (
              <pre
                aria-label="SQL statement"
                className={cn(
                  'px-3 py-2.5 font-mono text-xs leading-5 whitespace-pre-wrap text-fg-muted',
                  (blocked || status === 'error') && 'opacity-40',
                )}
              >
                <code>{highlight(sql)}</code>
              </pre>
            )}
            {compiled && view === 'parameterized' && compiled.params.length > 0 && !blocked && (
              <div className="border-t border-border px-3 py-2">
                <h3 className="text-2xs font-medium tracking-wide text-fg-subtle uppercase">
                  Bound values, in order
                </h3>
                <ol className="mt-1 flex flex-wrap gap-1.5" aria-label="Bound values">
                  {compiled.params.map((param, i) => (
                    <li
                      key={i}
                      className="rounded-sm bg-surface-active px-1.5 py-px font-mono text-2xs text-fg"
                    >
                      <span className="text-fg-subtle">{i + 1}:</span> {JSON.stringify(param)}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
