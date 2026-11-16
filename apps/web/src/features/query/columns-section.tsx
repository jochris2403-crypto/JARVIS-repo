import type { DatabaseSchema } from '@jarvis/shared';
import { ArrowDown, ArrowUp, KeyRound, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useQueryStore } from '@/stores/query-store';
import { findTable, isColumnSelected, move, setTableColumns, toggleColumn } from './model';
import { Hint, RemoveButton, Section } from './parts';

export function ColumnsSection({ schema }: { schema: DatabaseSchema }) {
  const state = useQueryStore((s) => s.builder);
  const update = useQueryStore((s) => s.update);
  const aliasOf = new Map(state.tables.map((t) => [t.id, t.alias]));

  return (
    <Section
      step={2}
      title="Columns"
      summary={state.columns.length > 0 ? `${state.columns.length} selected` : 'all columns'}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="query-distinct">Distinct rows only</Label>
          <p className="text-2xs text-fg-muted">Remove duplicate rows from the result.</p>
        </div>
        <Switch
          id="query-distinct"
          checked={state.distinct}
          onCheckedChange={(distinct) => update((b) => ({ ...b, distinct }))}
        />
      </div>

      {state.tables.map((table) => {
        const info = findTable(schema, table.table);
        if (!info) return null;
        const fkColumns = new Set(info.foreignKeys.flatMap((fk) => fk.columns));
        const selected = info.columns.filter((c) =>
          isColumnSelected(state, table.id, c.name),
        ).length;
        return (
          <fieldset key={table.id} className="rounded-md border border-border bg-bg">
            <legend className="sr-only">Columns of {table.alias}</legend>
            <div className="flex items-center gap-2 border-b border-border px-2.5 py-1.5">
              <span className="font-mono text-xs text-fg">{table.alias}</span>
              <span className="text-2xs text-fg-subtle">
                {selected} of {info.columns.length}
              </span>
              <div className="ml-auto flex gap-1">
                <Button
                  size="xs"
                  variant="ghost"
                  aria-label={`Select all columns of ${table.alias}`}
                  onClick={() =>
                    update((b) =>
                      setTableColumns(
                        b,
                        table.id,
                        info.columns.map((c) => c.name),
                      ),
                    )
                  }
                >
                  All
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  aria-label={`Clear columns of ${table.alias}`}
                  onClick={() => update((b) => setTableColumns(b, table.id, []))}
                >
                  None
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-x-3 p-1.5">
              {info.columns.map((column) => (
                <label
                  key={column.name}
                  className="flex h-6 cursor-pointer items-center gap-2 rounded-sm px-1 text-xs hover:bg-surface-hover"
                >
                  <Checkbox
                    checked={isColumnSelected(state, table.id, column.name)}
                    onChange={() => update((b) => toggleColumn(b, table.id, column.name))}
                    aria-label={`${table.alias}.${column.name}`}
                  />
                  <span className="truncate font-mono text-fg">{column.name}</span>
                  {column.isPrimaryKey && (
                    <KeyRound aria-label="Primary key" className="size-3 shrink-0 text-warning" />
                  )}
                  {fkColumns.has(column.name) && (
                    <Link2 aria-label="Foreign key" className="size-3 shrink-0 text-accent" />
                  )}
                  <span className="ml-auto truncate font-mono text-2xs text-fg-subtle">
                    {column.columnType}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        );
      })}

      {state.columns.length === 0 ? (
        <Hint>
          No columns selected, so the query returns every column of every table (
          <code className="font-mono">*</code>).
        </Hint>
      ) : (
        <div>
          <h3 className="mb-1.5 text-2xs font-medium tracking-wide text-fg-subtle uppercase">
            Output order and names
          </h3>
          <ol className="flex flex-col gap-1" aria-label="Selected columns">
            {state.columns.map((pick, index) => {
              const name = `${aliasOf.get(pick.tableId)}.${pick.column}`;
              return (
                <li key={pick.id} className="flex items-center gap-1.5">
                  <span className="w-5 shrink-0 text-right font-mono text-2xs text-fg-subtle">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg">{name}</span>
                  <Input
                    aria-label={`Output name for ${name}`}
                    value={pick.alias}
                    onChange={(e) =>
                      update((b) => ({
                        ...b,
                        columns: b.columns.map((c) =>
                          c.id === pick.id ? { ...c, alias: e.target.value } : c,
                        ),
                      }))
                    }
                    placeholder="Rename (optional)"
                    maxLength={64}
                    className="h-7 w-40 text-xs"
                  />
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`Move ${name} up`}
                    disabled={index === 0}
                    onClick={() => update((b) => ({ ...b, columns: move(b.columns, index, -1) }))}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`Move ${name} down`}
                    disabled={index === state.columns.length - 1}
                    onClick={() => update((b) => ({ ...b, columns: move(b.columns, index, 1) }))}
                  >
                    <ArrowDown />
                  </Button>
                  <RemoveButton
                    label={`Remove ${name}`}
                    onClick={() => update((b) => toggleColumn(b, pick.tableId, pick.column))}
                  />
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </Section>
  );
}
