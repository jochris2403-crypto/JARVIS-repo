import dagre from '@dagrejs/dagre';

export interface LayoutNode {
  id: string;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface LayoutOptions {
  /** Gap between tables in the same column. */
  nodeGap: number;
  /** Gap between columns of the hierarchy. */
  rankGap: number;
}

/**
 * Positions tables left to right, parents before children, so foreign keys
 * read as a hierarchy. Tables with no relationships would otherwise stack in
 * one endless column, so they are packed into a grid underneath.
 *
 * Returns top-left corners.
 */
export function layoutGraph(
  nodes: readonly LayoutNode[],
  edges: readonly { source: string; target: string }[],
  options: LayoutOptions,
): Record<string, Point> {
  const ids = new Set(nodes.map((n) => n.id));
  const usable = edges.filter(
    (e) => ids.has(e.source) && ids.has(e.target) && e.source !== e.target,
  );
  const linked = new Set(usable.flatMap((e) => [e.source, e.target]));
  const positions: Record<string, Point> = {};

  const graph = new dagre.graphlib.Graph();
  graph.setGraph({
    rankdir: 'LR',
    nodesep: options.nodeGap,
    ranksep: options.rankGap,
    marginx: 0,
    marginy: 0,
  });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const node of nodes) {
    if (linked.has(node.id)) graph.setNode(node.id, { width: node.width, height: node.height });
  }
  for (const edge of usable) graph.setEdge(edge.source, edge.target);
  dagre.layout(graph);

  let bottom = 0;
  let right = 0;
  for (const node of nodes) {
    if (!linked.has(node.id)) continue;
    const placed = graph.node(node.id);
    // dagre reports centres.
    positions[node.id] = { x: placed.x - node.width / 2, y: placed.y - node.height / 2 };
    bottom = Math.max(bottom, placed.y + node.height / 2);
    right = Math.max(right, placed.x + node.width / 2);
  }

  const isolated = nodes.filter((n) => !linked.has(n.id));
  if (isolated.length > 0) {
    const columnWidth = Math.max(...isolated.map((n) => n.width)) + options.nodeGap;
    // Roughly as wide as the hierarchy above, and never fewer than four across.
    const perRow = Math.max(
      4,
      Math.floor(right / columnWidth) || Math.ceil(Math.sqrt(isolated.length)),
    );
    let y = linked.size > 0 ? bottom + options.rankGap : 0;
    for (let start = 0; start < isolated.length; start += perRow) {
      const row = isolated.slice(start, start + perRow);
      row.forEach((node, column) => {
        positions[node.id] = { x: column * columnWidth, y };
      });
      y += Math.max(...row.map((n) => n.height)) + options.nodeGap;
    }
  }
  return positions;
}
