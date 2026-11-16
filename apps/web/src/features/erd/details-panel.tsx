import type { DatabaseSchema } from '@jarvis/shared';
import { ArrowDownRight, ArrowUpRight, Blocks, Network, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { workspacePath } from '@/app/paths';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { addTable, findTable } from '@/features/query/model';
import { formatCount } from '@/lib/utils';
import { useConnectionStore } from '@/stores/connection-store';
import { useErdStore } from '@/stores/erd-store';
import { useQueryStore } from '@/stores/query-store';
import { joinOrder, type ErdGraph, type ErdRelationship } from './graph';

const CARDINALITY_TEXT: Record<ErdRelationship['cardinality'], string> = {
  'many-to-one': 'many-to-one',
  'one-to-one': 'one-to-one',
  'many-to-many': 'many-to-many',
};

interface DetailsPanelProps {
  schema: DatabaseSchema;
  graph: ErdGraph;
  /** Selects exactly these tables and brings them into view. */
  onSelect: (tables: string[]) => void;
}

/** Side panel describing the selected tables and how they relate. */
export function DetailsPanel({ schema, graph, onSelect }: DetailsPanelProps) {
  const selected = useErdStore((s) => s.selected);
  const navigate = useNavigate();
  if (selected.length === 0) return null;

  /** Adds the selected tables to the query draft in an order the builder can join. */
  const addToQuery = () => {
    const { activeId } = useConnectionStore.getState();
    const query = useQueryStore.getState();
    query.ensureContext(`${activeId}:${schema.database}`);
    const present = new Set(useQueryStore.getState().builder.tables.map((t) => t.table));
    const additions = joinOrder(graph.relationships, selected).filter((name) => !present.has(name));
    query.update((builder) =>
      additions.reduce((state, name) => addTable(state, schema, name), builder),
    );
    void navigate(workspacePath('query'));
  };

  return (
    <aside
      aria-label="Selection details"
      className="flex w-72 shrink-0 flex-col overflow-y-auto border-l border-border bg-surface"
    >
      <header className="flex h-9 shrink-0 items-center justify-between border-b border-border pr-1.5 pl-3">
        <h2 className="truncate text-xs font-semibold">
          {selected.length === 1 ? (
            <span className="font-mono">{selected[0]}</span>
          ) : (
            `${selected.length} tables selected`
          )}
        </h2>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Clear selection"
          onClick={() => onSelect([])}
        >
          <X />
        </Button>
      </header>

      <div className="flex flex-col gap-4 p-3">
        {selected.length === 1 ? (
          <SingleTable table={selected[0]!} schema={schema} graph={graph} onSelect={onSelect} />
        ) : (
          <MultipleTables selected={selected} graph={graph} onSelect={onSelect} />
        )}
        <Button variant="primary" size="sm" onClick={addToQuery}>
          <Blocks />{' '}
          {selected.length === 1 ? 'Add table to query' : `Add ${selected.length} tables to query`}
        </Button>
      </div>
    </aside>
  );
}

function SingleTable({ table, schema, graph, onSelect }: { table: string } & DetailsPanelProps) {
  const info = findTable(schema, table);
  const parents = graph.relationships.filter(
    (r) => r.child === table && r.source !== 'many-to-many',
  );
  const children = graph.relationships.filter(
    (r) => r.parent === table && r.source !== 'many-to-many',
  );
  const manyToMany = graph.relationships.filter(
    (r) => r.source === 'many-to-many' && (r.parent === table || r.child === table),
  );
  const external = graph.external.filter((e) => e.table === table);
  const relatives = [
    ...new Set([...parents.map((r) => r.parent), ...children.map((r) => r.child)]),
  ];

  return (
    <>
      {info && (
        <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-border bg-border text-center">
          <Stat label="Columns" value={formatCount(info.columns.length)} />
          <Stat
            label="Rows"
            value={info.rowEstimate === null ? '—' : `≈ ${formatCount(info.rowEstimate)}`}
          />
          <Stat label="Type" value={info.type === 'view' ? 'View' : (info.engine ?? 'Table')} />
        </dl>
      )}

      <RelationList
        title="Parents"
        hint="Tables this one refers to."
        icon={<ArrowUpRight className="size-3.5 text-success" />}
        empty="This table does not reference any other table."
        items={parents.map((r) => ({ rel: r, other: r.parent }))}
        onSelect={onSelect}
      />
      <RelationList
        title="Children"
        hint="Tables that refer to this one."
        icon={<ArrowDownRight className="size-3.5 text-warning" />}
        empty="No table references this one."
        items={children.map((r) => ({ rel: r, other: r.child }))}
        onSelect={onSelect}
      />
      {manyToMany.length > 0 && (
        <RelationList
          title="Many-to-many"
          hint="Linked through a junction table."
          icon={<Network className="size-3.5 text-accent" />}
          empty=""
          items={manyToMany.map((r) => ({
            rel: r,
            other: r.parent === table ? r.child : r.parent,
          }))}
          onSelect={onSelect}
        />
      )}
      {external.length > 0 && (
        <section>
          <h3 className="text-2xs font-medium tracking-wide text-fg-subtle uppercase">
            Other databases
          </h3>
          <ul className="mt-1 flex flex-col gap-1 text-2xs text-fg-muted">
            {external.map((e) => (
              <li key={e.constraintName}>
                References <span className="font-mono text-fg">{e.target}</span>, which is outside
                this diagram.
              </li>
            ))}
          </ul>
        </section>
      )}
      {relatives.length > 0 && (
        <Button size="sm" onClick={() => onSelect([table, ...relatives])}>
          Select with parents and children
        </Button>
      )}
    </>
  );
}

function MultipleTables({
  selected,
  graph,
  onSelect,
}: {
  selected: string[];
  graph: ErdGraph;
  onSelect: (t: string[]) => void;
}) {
  const chosen = new Set(selected);
  const between = graph.relationships.filter((r) => chosen.has(r.parent) && chosen.has(r.child));
  const linked = new Set(between.flatMap((r) => [r.parent, r.child]));
  const unlinked = selected.filter((t) => !linked.has(t));

  return (
    <>
      <ul className="flex flex-wrap gap-1.5" aria-label="Selected tables">
        {selected.map((table) => (
          <li key={table}>
            <button
              type="button"
              onClick={() => onSelect([table])}
              className="rounded-sm border border-border-strong bg-surface-raised px-1.5 py-0.5 font-mono text-2xs text-fg hover:border-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {table}
            </button>
          </li>
        ))}
      </ul>
      <RelationList
        title="Relationships between them"
        icon={<Network className="size-3.5 text-accent" />}
        empty="None of the selected tables are directly related."
        items={between.map((r) => ({ rel: r, other: `${r.child} → ${r.parent}` }))}
      />
      {unlinked.length > 0 && between.length > 0 && (
        <p className="text-2xs leading-4 text-warning">
          {unlinked.join(', ')} {unlinked.length === 1 ? 'is' : 'are'} not directly related to the
          other selected tables.
        </p>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface px-1.5 py-1.5">
      <dt className="text-2xs text-fg-subtle">{label}</dt>
      <dd className="truncate font-mono text-xs text-fg">{value}</dd>
    </div>
  );
}

function RelationList({
  title,
  hint,
  icon,
  empty,
  items,
  onSelect,
}: {
  title: string;
  hint?: string;
  icon: ReactNode;
  empty: string;
  items: { rel: ErdRelationship; other: string }[];
  onSelect?: (tables: string[]) => void;
}) {
  return (
    <section aria-label={title}>
      <h3 className="flex items-center gap-1.5 text-2xs font-medium tracking-wide text-fg-subtle uppercase">
        {title} <span className="font-mono">{items.length}</span>
      </h3>
      {hint && <p className="text-2xs text-fg-subtle">{hint}</p>}
      {items.length === 0 ? (
        <p className="mt-1 text-2xs text-fg-muted">{empty}</p>
      ) : (
        <ul className="mt-1.5 flex flex-col gap-1.5">
          {items.map(({ rel, other }) => (
            <li key={rel.id} className="rounded-md border border-border bg-bg px-2 py-1.5">
              <div className="flex items-center gap-1.5">
                {icon}
                {onSelect ? (
                  <button
                    type="button"
                    onClick={() => onSelect([other])}
                    className="truncate rounded-sm font-mono text-xs text-fg hover:text-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {other}
                  </button>
                ) : (
                  <span className="truncate font-mono text-xs text-fg">{other}</span>
                )}
                {rel.source === 'inferred' && <Badge tone="warning">Inferred</Badge>}
              </div>
              <p className="mt-0.5 font-mono text-2xs break-all text-fg-muted">
                {rel.source === 'many-to-many'
                  ? `through ${rel.via}`
                  : `${rel.childColumns.join(', ')} → ${rel.parentColumns.join(', ')}`}
              </p>
              <p className="text-2xs text-fg-subtle">
                {CARDINALITY_TEXT[rel.cardinality]}
                {rel.constraintName && ` · ${rel.constraintName}`}
                {rel.onDelete &&
                  rel.onDelete !== 'NO ACTION' &&
                  rel.onDelete !== 'RESTRICT' &&
                  ` · on delete ${rel.onDelete.toLowerCase()}`}
              </p>
              {rel.source === 'inferred' && (
                <p className="mt-0.5 text-2xs text-warning">
                  Guessed from matching column names. Not enforced by the database.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
