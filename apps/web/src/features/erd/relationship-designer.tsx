import type { DatabaseSchema } from '@jarvis/shared';
import {
  Background,
  Controls,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  type OnSelectionChangeFunc,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Crosshair, Expand, LayoutGrid, Maximize, Minimize, Network, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tooltip } from '@/components/ui/tooltip';
import { useResolvedTheme } from '@/hooks/use-theme';
import { cn, formatCount, modKeyLabel } from '@/lib/utils';
import { useConnectionStore } from '@/stores/connection-store';
import { useErdStore } from '@/stores/erd-store';
import { useUiStore } from '@/stores/ui-store';
import { DetailsPanel } from './details-panel';
import {
  buildGraph,
  computeHighlight,
  defaultDetail,
  type DetailLevel,
  type HighlightMode,
} from './graph';
import { layoutGraph } from './layout';
import { RelationshipEdge, type RelationshipEdgeType } from './relationship-edge';
import { nodeSize } from './sizes';
import { TableNode, type TableNodeType } from './table-node';

const nodeTypes = { table: TableNode };
const edgeTypes = { relationship: RelationshipEdge };

/** Above this many tables, only what is on screen is rendered. */
const VIRTUALIZE_ABOVE = 60;
const FIT_OPTIONS = { padding: 0.12, duration: 300 };

const DETAIL_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'keys', label: 'Keys' },
  { value: 'none', label: 'Names' },
] as const satisfies readonly { value: DetailLevel; label: string }[];

const HIGHLIGHT_LABEL: Record<HighlightMode, string> = {
  direct: 'Direct parents and children',
  parents: 'All parents (ancestors)',
  children: 'All children (descendants)',
  connected: 'Everything connected',
};

/**
 * The Relationship Designer workspace: an interactive entity-relationship
 * diagram of the active database, built from its declared foreign keys.
 */
export function RelationshipDesigner({ schema }: { schema: DatabaseSchema }) {
  return (
    <ReactFlowProvider>
      <Designer schema={schema} />
    </ReactFlowProvider>
  );
}

function Designer({ schema }: { schema: DatabaseSchema }) {
  const activeId = useConnectionStore((s) => s.activeId);
  const contextKey = `${activeId}:${schema.database}`;
  const theme = useResolvedTheme();
  const rem = 16 * useUiStore((s) => s.uiScale);
  const flow = useReactFlow<TableNodeType, RelationshipEdgeType>();

  const detailPreference = useErdStore((s) => s.detail);
  const showInferred = useErdStore((s) => s.showInferred);
  const mergeJunctions = useErdStore((s) => s.mergeJunctions);
  const highlightMode = useErdStore((s) => s.highlightMode);
  const focus = useErdStore((s) => s.focus);
  const selected = useErdStore((s) => s.selected);
  const roles = useErdStore((s) => s.roles);
  const store = useErdStore.getState;

  // Selection and per-table overrides belong to one database.
  useEffect(() => {
    useErdStore.getState().resetSession();
  }, [contextKey]);

  const graph = useMemo(
    () => buildGraph(schema, { includeInferred: showInferred, mergeJunctions }),
    [schema, showInferred, mergeJunctions],
  );
  const detail = detailPreference ?? defaultDetail(schema.tables.length);
  const junctionNames = useMemo(
    () => new Set(graph.junctions.map((j) => j.table)),
    [graph.junctions],
  );

  /** Bumped by "Auto layout" to discard hand-placed positions. */
  const [layoutVersion, setLayoutVersion] = useState(0);

  /** Full screen: the diagram covers the whole window, hiding the sidebar and top bars. */
  const [fullScreen, setFullScreen] = useState(false);
  useEffect(() => {
    if (!fullScreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullScreen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fullScreen]);
  const autoLayout = useMemo(
    () =>
      layoutGraph(
        graph.tables.map((t) => ({ id: t.name, ...nodeSize(t, detail, rem) })),
        graph.relationships.map((r) => ({ source: r.parent, target: r.child })),
        { nodeGap: 1.75 * rem, rankGap: 6 * rem },
      ),
    [graph, detail, rem],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<TableNodeType>([]);
  /** Identifies the arrangement on screen: changes only for a new database or "Auto layout". */
  const arrangement = `${contextKey}:${layoutVersion}`;
  const shownArrangement = useRef<string | null>(null);

  // (Re)build nodes when the graph changes. Toggling an option must not move anything:
  // tables keep the position they have on screen, and the viewport is left alone. Only a
  // new database or an explicit "Auto layout" arranges from scratch and fits the view.
  useEffect(() => {
    const fresh = shownArrangement.current !== arrangement;
    shownArrangement.current = arrangement;
    const saved = useErdStore.getState().layouts[contextKey] ?? {};
    setNodes((previous) => {
      const current = new Map(fresh ? [] : previous.map((n) => [n.id, n]));
      const wasSelected = new Set(previous.filter((n) => n.selected).map((n) => n.id));
      return graph.tables.map((table) => ({
        id: table.name,
        type: 'table' as const,
        position: current.get(table.name)?.position ??
          saved[table.name] ??
          autoLayout[table.name] ?? { x: 0, y: 0 },
        data: { table, detail, junction: junctionNames.has(table.name) },
        selected: wasSelected.has(table.name),
      }));
    });
    if (!fresh) return;
    const timer = setTimeout(() => void flow.fitView({ padding: 0.12 }), 60);
    return () => clearTimeout(timer);
  }, [graph, detail, autoLayout, junctionNames, contextKey, arrangement, setNodes, flow]);

  useEffect(() => {
    // Tables can leave the diagram (e.g. merged junctions); drop them from the selection.
    const present = new Set(graph.tables.map((t) => t.name));
    const valid = selected.filter((t) => present.has(t));
    useErdStore
      .getState()
      .setHighlight(computeHighlight(graph.relationships, valid, highlightMode));
  }, [graph, selected, highlightMode]);

  // Focus mode: show only the selection and what is highlighted with it.
  const hiding = focus && selected.length > 0;
  const visibleNodes = useMemo(
    () => (hiding ? nodes.map((n) => ({ ...n, hidden: !(n.id in roles) })) : nodes),
    [nodes, hiding, roles],
  );
  const edges = useMemo<RelationshipEdgeType[]>(
    () =>
      graph.relationships.map((relationship) => ({
        id: relationship.id,
        source: relationship.parent,
        target: relationship.child,
        type: 'relationship',
        data: { relationship },
        hidden: hiding && !(relationship.parent in roles && relationship.child in roles),
        focusable: false,
        selectable: false,
      })),
    [graph.relationships, hiding, roles],
  );

  const onSelectionChange = useCallback<OnSelectionChangeFunc>(({ nodes: picked }) => {
    const ids = picked.map((n) => n.id);
    const current = useErdStore.getState().selected;
    if (ids.length !== current.length || ids.some((id, i) => id !== current[i])) {
      useErdStore.getState().setSelection(ids);
    }
  }, []);

  /** Selects exactly these tables and brings them into view. */
  const selectTables = useCallback(
    (tables: string[]) => {
      const wanted = new Set(tables);
      setNodes((current) =>
        current.map((n) =>
          n.selected === wanted.has(n.id) ? n : { ...n, selected: wanted.has(n.id) },
        ),
      );
      if (tables.length > 0) {
        setTimeout(
          () =>
            void flow.fitView({
              nodes: tables.map((id) => ({ id })),
              duration: 350,
              maxZoom: 1,
              padding: 0.6,
            }),
          60,
        );
      }
    },
    [setNodes, flow],
  );

  if (schema.tables.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          icon={Network}
          title="Nothing to draw"
          description={`${schema.database} has no tables or views.`}
        />
      </div>
    );
  }

  const fkCount = graph.relationships.filter((r) => r.source !== 'inferred').length;
  const inferredCount = graph.relationships.length - fkCount;

  return (
    <div
      data-fullscreen={fullScreen}
      className={cn('flex flex-col bg-bg', fullScreen ? 'fixed inset-0 z-40' : 'h-full')}
    >
      {/* One fixed-height row: if the toolbar could wrap, toggling an option would shift the canvas. */}
      <header className="flex h-11 shrink-0 items-center gap-3 overflow-x-auto border-b border-border bg-surface px-3 [scrollbar-width:none] [&>*]:shrink-0">
        <div className="flex items-center gap-2">
          <Network className="size-4 text-accent" />
          <h1 className="text-sm font-semibold">Relationship Designer</h1>
          <Badge tone="accent" className="font-mono">
            {schema.database}
          </Badge>
          <span role="status" className="text-2xs text-fg-subtle">
            {formatCount(graph.tables.length)} tables · {formatCount(fkCount)} relationship
            {fkCount === 1 ? '' : 's'}
            {inferredCount > 0 && ` · ${formatCount(inferredCount)} inferred`}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-3 [&>*]:shrink-0">
          <TableSearch
            tables={graph.tables.map((t) => t.name)}
            onPick={(table) => selectTables([table])}
          />

          <div className="flex items-center gap-1.5">
            <span className="text-2xs text-fg-subtle">Columns</span>
            <SegmentedControl
              aria-label="Columns shown in each table"
              value={detail}
              onChange={(value) => store().setDetail(value)}
              options={DETAIL_OPTIONS}
            />
          </div>

          <div className="flex items-center gap-1.5">
            <Label htmlFor="erd-highlight" className="text-2xs font-normal text-fg-subtle">
              Highlight
            </Label>
            <Select
              id="erd-highlight"
              value={highlightMode}
              onChange={(e) => store().setHighlightMode(e.target.value as HighlightMode)}
              className="w-48"
            >
              {(Object.keys(HIGHLIGHT_LABEL) as HighlightMode[]).map((mode) => (
                <option key={mode} value={mode}>
                  {HIGHLIGHT_LABEL[mode]}
                </option>
              ))}
            </Select>
          </div>

          <Tooltip
            content={
              selected.length === 0
                ? 'Select a table first'
                : 'Show only the selection and its highlighted tables'
            }
          >
            <span>
              <Button
                size="sm"
                aria-pressed={hiding}
                disabled={selected.length === 0}
                onClick={() => store().setFocus(!focus)}
                className={cn(hiding && 'border-accent bg-accent-muted text-accent')}
              >
                <Crosshair /> {hiding ? 'Show all' : 'Hide unrelated'}
              </Button>
            </span>
          </Tooltip>

          <ToggleOption
            id="erd-merge"
            label="Merge junctions"
            title="Draw a many-to-many link directly between two tables and hide the junction table between them"
            checked={mergeJunctions}
            onChange={(value) => store().setMergeJunctions(value)}
          />
          <ToggleOption
            id="erd-inferred"
            label="Show inferred"
            title="Also draw guessed relationships (matching column names with no foreign key). They are dashed and labelled; the database does not enforce them."
            checked={showInferred}
            onChange={(value) => store().setShowInferred(value)}
          />

          <div className="flex items-center gap-1">
            <Tooltip content="Arrange tables automatically (discards your manual positions)">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  store().clearLayout(contextKey);
                  setLayoutVersion((v) => v + 1);
                }}
              >
                <LayoutGrid /> Auto layout
              </Button>
            </Tooltip>
            <Tooltip content="Fit the whole diagram in view">
              <Button size="sm" variant="ghost" onClick={() => void flow.fitView(FIT_OPTIONS)}>
                <Maximize /> Fit
              </Button>
            </Tooltip>
            <Tooltip
              content={fullScreen ? 'Exit full screen' : 'Show the diagram full screen'}
              shortcut={fullScreen ? ['Esc'] : undefined}
            >
              <Button
                size="sm"
                variant={fullScreen ? 'secondary' : 'ghost'}
                aria-pressed={fullScreen}
                onClick={() => setFullScreen((value) => !value)}
              >
                {fullScreen ? <Minimize /> : <Expand />}{' '}
                {fullScreen ? 'Exit full screen' : 'Full screen'}
              </Button>
            </Tooltip>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1" aria-label="Relationship diagram">
          <ReactFlow
            nodes={visibleNodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onSelectionChange={onSelectionChange}
            onNodeDragStop={(_event, _node, dragged) =>
              store().savePositions(
                contextKey,
                Object.fromEntries(dragged.map((n) => [n.id, n.position])),
              )
            }
            colorMode={theme}
            minZoom={0.05}
            maxZoom={2}
            nodesConnectable={false}
            deleteKeyCode={null}
            multiSelectionKeyCode={['Meta', 'Control']}
            selectionKeyCode="Shift"
            selectNodesOnDrag={false}
            edgesFocusable={false}
            elevateNodesOnSelect
            onlyRenderVisibleElements={graph.tables.length > VIRTUALIZE_ABOVE}
          >
            <Background gap={1.25 * rem} size={1} color="var(--border-strong)" />
            <Controls showInteractive={false} position="bottom-left" />
            <Panel position="top-left">
              <Legend showInferred={showInferred} />
            </Panel>
          </ReactFlow>
        </div>
        <DetailsPanel schema={schema} graph={graph} onSelect={selectTables} />
      </div>
    </div>
  );
}

function ToggleOption(props: {
  id: string;
  label: string;
  title: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-1.5" title={props.title}>
      <Switch id={props.id} checked={props.checked} onCheckedChange={props.onChange} />
      <Label htmlFor={props.id} className="cursor-pointer text-2xs font-normal text-fg-muted">
        {props.label}
      </Label>
    </div>
  );
}

/** Finds a table by name and jumps to it. */
function TableSearch({ tables, onPick }: { tables: string[]; onPick: (table: string) => void }) {
  const [query, setQuery] = useState('');

  const go = (text: string) => {
    const wanted = text.trim().toLowerCase();
    if (!wanted) return;
    const match =
      tables.find((t) => t.toLowerCase() === wanted) ??
      tables.find((t) => t.toLowerCase().startsWith(wanted)) ??
      tables.find((t) => t.toLowerCase().includes(wanted));
    if (match) {
      onPick(match);
      setQuery('');
    }
  };

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-fg-subtle" />
      <Input
        aria-label="Find table"
        list="erd-table-names"
        value={query}
        placeholder="Find table…"
        spellCheck={false}
        onChange={(e) => {
          const value = e.target.value;
          setQuery(value);
          // Choosing an entry from the suggestion list fills in an exact name.
          if (tables.some((t) => t === value)) go(value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') go(query);
        }}
        className="h-7 w-44 pl-7 text-xs"
      />
      <datalist id="erd-table-names">
        {tables.map((table) => (
          <option key={table} value={table} />
        ))}
      </datalist>
    </div>
  );
}

function Legend({ showInferred }: { showInferred: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-surface/90 px-2.5 py-2 text-2xs text-fg-muted shadow-raised">
      <div className="flex items-center gap-2">
        <svg width="28" height="6" aria-hidden>
          <line x1="0" y1="3" x2="28" y2="3" stroke="var(--fg-subtle)" strokeWidth="1.5" />
        </svg>
        Foreign key
        <span className="font-mono text-fg-subtle">1 → N</span>
      </div>
      {showInferred && (
        <div className="flex items-center gap-2">
          <svg width="28" height="6" aria-hidden>
            <line
              x1="0"
              y1="3"
              x2="28"
              y2="3"
              stroke="var(--warning)"
              strokeWidth="1.5"
              strokeDasharray="5 4"
            />
          </svg>
          Inferred — not enforced
        </div>
      )}
      <p className="text-fg-subtle">
        Click a table · {modKeyLabel}-click to add · Shift-drag to box-select · scroll to zoom
      </p>
    </div>
  );
}
