import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type Edge,
  type EdgeProps,
} from '@xyflow/react';
import { memo } from 'react';
import { cn } from '@/lib/utils';
import { useErdStore } from '@/stores/erd-store';
import { describeRelationship, type ErdRelationship } from './graph';

export type RelationshipEdgeType = Edge<{ relationship: ErdRelationship }, 'relationship'>;

/** Distance of the cardinality markers from the ends of the line, in px. */
const MARKER_OFFSET = 14;

function Marker({
  x,
  y,
  text,
  className,
}: {
  x: number;
  y: number;
  text: string;
  className: string;
}) {
  return (
    <span
      style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` }}
      className={cn(
        'pointer-events-none absolute rounded-sm bg-bg px-0.5 font-mono text-2xs leading-none font-semibold',
        className,
      )}
    >
      {text}
    </span>
  );
}

/**
 * A relationship line, drawn from the parent (the "1" side) to the child.
 * Solid = foreign key or many-to-many through a junction; dashed amber = inferred.
 */
export const RelationshipEdge = memo(function RelationshipEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<RelationshipEdgeType>) {
  const emphasis = useErdStore((s) => s.activeEdges[id]);
  const dimmed = useErdStore((s) => s.selected.length > 0 && !(id in s.activeEdges));
  const rel = data?.relationship;
  if (!rel) return null;

  let path: string;
  let labelX: number;
  let labelY: number;
  if (source === target) {
    // Self-reference: loop from the right edge over the top to the left edge.
    const lift = Math.max(60, (sourceX - targetX) * 0.35);
    path = `M ${sourceX} ${sourceY} C ${sourceX + 50} ${sourceY - lift}, ${targetX - 50} ${targetY - lift}, ${targetX} ${targetY}`;
    labelX = (sourceX + targetX) / 2;
    labelY = sourceY - lift * 0.75;
  } else {
    [path, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
    });
  }

  const inferred = rel.source === 'inferred';
  const color = emphasis ? 'var(--accent)' : inferred ? 'var(--warning)' : 'var(--fg-subtle)';
  const tone = emphasis ? 'text-accent' : inferred ? 'text-warning' : 'text-fg-muted';
  const parentMark = rel.cardinality === 'many-to-many' ? 'N' : '1';
  const childMark = rel.cardinality === 'one-to-one' ? '1' : 'N';

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: color,
          strokeWidth: emphasis === 'strong' ? 2.5 : emphasis ? 1.75 : 1.25,
          strokeDasharray: inferred ? '5 4' : undefined,
          opacity: dimmed ? 0.12 : 1,
          transition: 'opacity 150ms, stroke 150ms',
        }}
      />
      <EdgeLabelRenderer>
        <div
          data-relationship={id}
          data-source={rel.source}
          data-active={emphasis ?? 'none'}
          className={cn('transition-opacity', dimmed && 'opacity-10')}
        >
          <Marker x={sourceX + MARKER_OFFSET} y={sourceY} text={parentMark} className={tone} />
          <Marker x={targetX - MARKER_OFFSET} y={targetY} text={childMark} className={tone} />
          {/* Lines from one table fan out from the same point, so labelling all of them would
              pile up; the details panel lists the columns instead. */}
          {(emphasis === 'strong' || inferred || rel.source === 'many-to-many') && (
            <span
              style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
              title={describeRelationship(rel)}
              className={cn(
                'pointer-events-none absolute rounded-sm border bg-surface-overlay px-1 py-px font-mono text-2xs whitespace-nowrap',
                inferred ? 'border-warning/40 text-warning' : 'border-border-strong text-fg-muted',
              )}
            >
              {inferred
                ? 'inferred'
                : rel.source === 'many-to-many'
                  ? `via ${rel.via}`
                  : rel.childColumns.join(', ')}
            </span>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
});
