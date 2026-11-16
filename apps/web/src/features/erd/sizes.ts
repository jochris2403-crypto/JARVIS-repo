import type { TableInfo } from '@jarvis/shared';
import { nodeColumns, type DetailLevel } from './graph';

/*
 * Table-node geometry, in rem so the diagram follows the interface scale.
 * The layout engine needs sizes before anything is rendered, so they are
 * computed here and the node component is styled to match exactly.
 */
export const NODE_WIDTH_REM = 15;
export const NODE_HEADER_REM = 1.875;
export const NODE_ROW_REM = 1.375;
export const NODE_FOOTER_REM = 1.25;
/** Vertical padding around the column list. */
export const NODE_BODY_PADDING_REM = 0.25;

export function nodeSize(
  table: TableInfo,
  detail: DetailLevel,
  rem: number,
): { width: number; height: number } {
  const { columns, hidden } = nodeColumns(table, detail, undefined);
  let height = NODE_HEADER_REM;
  if (columns.length > 0) {
    height += columns.length * NODE_ROW_REM + NODE_BODY_PADDING_REM * 2;
    if (hidden > 0) height += NODE_FOOTER_REM;
  }
  return { width: NODE_WIDTH_REM * rem, height: height * rem };
}
