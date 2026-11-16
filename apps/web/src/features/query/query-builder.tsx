import type { DatabaseSchema } from '@jarvis/shared';
import { Blocks, CircleSlash, Eraser, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Kbd } from '@/components/ui/kbd';
import { Tooltip } from '@/components/ui/tooltip';
import { modKeyLabel } from '@/lib/utils';
import { useConnectionStore } from '@/stores/connection-store';
import { useQueryStore } from '@/stores/query-store';
import { AggregatesSection } from './aggregates-section';
import { ColumnsSection } from './columns-section';
import { ConditionEditor } from './condition-editor';
import { countConditions, type BuilderSection } from './model';
import { Section } from './parts';
import { ResultsPanel } from './results-panel';
import { SortSection } from './sort-section';
import { SqlPreview } from './sql-preview';
import { TablesSection } from './tables-section';

/**
 * The Visual Query Builder workspace: build a SELECT with visual controls,
 * see the SQL the server generates for it, run it and inspect the rows.
 */
export function QueryBuilder({ schema }: { schema: DatabaseSchema }) {
  const activeId = useConnectionStore((s) => s.activeId);
  const state = useQueryStore((s) => s.builder);
  const issues = useQueryStore((s) => s.issues);
  const running = useQueryStore((s) => s.run.status === 'running');
  const execute = useQueryStore((s) => s.execute);
  const cancel = useQueryStore((s) => s.cancel);
  const clear = useQueryStore((s) => s.clear);
  const ensureContext = useQueryStore((s) => s.ensureContext);
  const revalidate = useQueryStore((s) => s.revalidate);
  const [confirmClear, setConfirmClear] = useState(false);

  // A draft belongs to one database; switching connection or database starts a new one.
  useEffect(() => {
    ensureContext(`${activeId}:${schema.database}`);
  }, [activeId, schema.database, ensureContext]);

  // The schema may have been reloaded with tables or columns added or removed.
  useEffect(() => {
    revalidate();
  }, [schema, revalidate]);

  const hasTables = state.tables.length > 0;
  const canRun = hasTables && issues.length === 0 && !running;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        void useQueryStore.getState().execute();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const sectionHasIssue = (section: BuilderSection) =>
    issues.some((issue) => issue.section === section);
  const filterCount = countConditions(state.where);

  return (
    <div className="flex h-full flex-col bg-bg">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-surface px-3">
        <Blocks className="size-4 text-accent" />
        <h1 className="text-sm font-semibold">Query Builder</h1>
        <Badge tone="accent" className="font-mono">
          {schema.database}
        </Badge>
        <div className="ml-auto flex items-center gap-1.5">
          {hasTables && (
            <Button
              size="sm"
              variant="ghost"
              disabled={running}
              onClick={() => setConfirmClear(true)}
            >
              <Eraser /> Clear
            </Button>
          )}
          {running ? (
            <Button size="sm" onClick={() => void cancel()}>
              <CircleSlash /> Cancel
            </Button>
          ) : (
            <Tooltip
              content={
                canRun
                  ? 'Run query'
                  : hasTables
                    ? 'Finish the highlighted steps first'
                    : 'Choose a table first'
              }
              shortcut={canRun ? [modKeyLabel, '↵'] : undefined}
            >
              {/* The span keeps the tooltip working while the button is disabled. */}
              <span>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!canRun}
                  onClick={() => void execute()}
                >
                  <Play /> Run query
                </Button>
              </span>
            </Tooltip>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div
          aria-label="Query steps"
          className="flex w-[46%] max-w-3xl min-w-96 shrink-0 flex-col gap-2.5 overflow-y-auto border-r border-border p-3"
        >
          <TablesSection schema={schema} hasIssue={sectionHasIssue('tables')} />
          {hasTables ? (
            <>
              <ColumnsSection schema={schema} />
              <Section
                step={3}
                title="Filter rows"
                summary={
                  filterCount > 0
                    ? `${filterCount} condition${filterCount === 1 ? '' : 's'}`
                    : undefined
                }
                hasIssue={sectionHasIssue('filters')}
              >
                <ConditionEditor
                  tree="where"
                  schema={schema}
                  tables={state.tables}
                  includeAggregates={false}
                />
              </Section>
              <AggregatesSection schema={schema} hasIssue={sectionHasIssue('aggregates')} />
              <SortSection schema={schema} hasIssue={sectionHasIssue('sort')} />
              <p className="px-1 pb-2 text-2xs leading-4 text-fg-subtle">
                Subqueries, UNION, CASE expressions, scalar functions, window functions and CTEs are
                not available in the builder yet.
              </p>
            </>
          ) : (
            <EmptyState
              icon={Blocks}
              title="Start with a table"
              description={
                <>
                  Choose a table above, or press <Kbd>+</Kbd> next to a table in the sidebar
                  Explorer. Related tables are joined for you using their foreign keys.
                </>
              }
              className="py-10"
            />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <SqlPreview className="max-h-[42%] shrink-0 border-b border-border" />
          <ResultsPanel className="flex-1" />
        </div>
      </div>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear this query?"
        description="All tables, columns, filters and results in the builder will be removed. Nothing in the database is affected."
        confirmLabel="Clear query"
        onConfirm={clear}
      />
    </div>
  );
}
