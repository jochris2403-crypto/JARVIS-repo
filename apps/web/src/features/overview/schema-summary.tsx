import type { DatabaseSchema, TableInfo } from '@jarvis/shared';
import { Eye, KeyRound, Link2, Table2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatBytes, formatCount } from '@/lib/utils';

/**
 * What schema introspection found in the active database, straight from
 * MySQL's metadata. (The full dashboard — largest tables, most connected
 * tables, activity — is Phase 9.)
 */
export function SchemaSummary({ schema }: { schema: DatabaseSchema }) {
  const tables = schema.tables.filter((t) => t.type === 'table');
  const views = schema.tables.filter((t) => t.type === 'view');
  const columnCount = schema.tables.reduce((sum, t) => sum + t.columns.length, 0);

  const stats = [
    { label: 'Tables', value: tables.length },
    { label: 'Views', value: views.length },
    { label: 'Columns', value: columnCount },
    { label: 'Relationships', value: schema.relationships.length },
    { label: 'Routines', value: schema.routines.length },
    { label: 'Triggers', value: schema.triggers.length },
  ];

  return (
    <div className="flex flex-col gap-5">
      <dl
        aria-label="Schema totals"
        className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border bg-border shadow-raised lg:grid-cols-6"
      >
        {stats.map(({ label, value }) => (
          <div key={label} className="bg-surface px-4 py-3">
            <dt className="text-2xs tracking-wide text-fg-subtle uppercase">{label}</dt>
            <dd className="mt-1 font-mono text-lg text-fg tabular-nums">{formatCount(value)}</dd>
          </div>
        ))}
      </dl>

      <section
        aria-label="Tables and views"
        className="overflow-hidden rounded-lg border border-border bg-surface shadow-raised"
      >
        <header className="flex h-10 items-center justify-between border-b border-border px-4">
          <h2 className="text-xs font-semibold">Tables and views</h2>
          <span className="text-2xs text-fg-subtle">Row counts are InnoDB estimates</span>
        </header>
        {schema.tables.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-fg-muted">
            This database has no tables or views.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border text-2xs tracking-wide text-fg-subtle uppercase">
                  <th scope="col" className="px-4 py-2 font-medium">
                    Name
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Primary key
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Columns
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Foreign keys
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Rows
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Size
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Engine
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {schema.tables.map((table) => (
                  <TableRow key={table.name} table={table} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function TableRow({ table }: { table: TableInfo }) {
  const isView = table.type === 'view';
  const Icon = isView ? Eye : Table2;
  const size = table.dataBytes === null ? null : table.dataBytes + (table.indexBytes ?? 0);
  return (
    <tr className="transition-colors hover:bg-surface-hover">
      <th scope="row" className="px-4 py-2 font-normal">
        <span className="flex items-center gap-2">
          <Icon className="size-3.5 shrink-0 text-fg-subtle" />
          <span className="font-mono text-fg">{table.name}</span>
          {isView && <Badge>View</Badge>}
        </span>
      </th>
      <td className="px-3 py-2">
        {table.primaryKey.length > 0 ? (
          <span className="flex items-center gap-1.5 font-mono text-fg-muted">
            <KeyRound className="size-3 shrink-0 text-warning" />
            {table.primaryKey.join(', ')}
          </span>
        ) : (
          <span className="text-fg-subtle">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-right font-mono text-fg-muted tabular-nums">
        {table.columns.length}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums">
        {table.foreignKeys.length > 0 ? (
          <span className="inline-flex items-center gap-1 text-accent">
            <Link2 className="size-3" />
            {table.foreignKeys.length}
          </span>
        ) : (
          <span className="text-fg-subtle">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-right font-mono text-fg-muted tabular-nums">
        {table.rowEstimate === null ? (
          <span className="text-fg-subtle">—</span>
        ) : (
          `≈ ${formatCount(table.rowEstimate)}`
        )}
      </td>
      <td className="px-3 py-2 text-right font-mono text-fg-muted tabular-nums">
        {size === null ? <span className="text-fg-subtle">—</span> : formatBytes(size)}
      </td>
      <td className="px-4 py-2 text-fg-muted">
        {table.engine ?? <span className="text-fg-subtle">—</span>}
      </td>
    </tr>
  );
}
