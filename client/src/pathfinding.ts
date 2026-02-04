type GridNode = { row: number; col: number };

const neighbors = (node: GridNode) => [
  { row: node.row + 1, col: node.col },
  { row: node.row - 1, col: node.col },
  { row: node.row, col: node.col + 1 },
  { row: node.row, col: node.col - 1 },
];

const manhattan = (a: GridNode, b: GridNode) =>
  Math.abs(a.row - b.row) + Math.abs(a.col - b.col);

const key = (node: GridNode) => `${node.row},${node.col}`;

const findPath = (grid: number[][], start: GridNode, end: GridNode) => {
  const rows = grid.length;
  const cols = rows > 0 ? grid[0].length : 0;
  const inBounds = (node: GridNode) =>
    node.row >= 0 && node.col >= 0 && node.row < rows && node.col < cols;
  const isWalkable = (node: GridNode) => grid[node.row][node.col] > 0;

  const open = new Set<string>([key(start)]);
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>([[key(start), 0]]);
  const fScore = new Map<string, number>([[key(start), manhattan(start, end)]]);

  const lowestScore = (): string | null => {
    let best: string | null = null;
    let bestValue = Number.POSITIVE_INFINITY;
    open.forEach((nodeKey) => {
      const score = fScore.get(nodeKey) ?? Number.POSITIVE_INFINITY;
      if (score < bestValue) {
        bestValue = score;
        best = nodeKey;
      }
    });
    return best;
  };

  while (open.size > 0) {
    const currentKey = lowestScore();
    if (currentKey === null) break;
    const [r, c] = currentKey.split(",").map(Number);
    if (r === end.row && c === end.col) {
      const path: GridNode[] = [];
      let cursor: string | undefined = currentKey;
      while (cursor) {
        const [cr, cc] = cursor.split(",").map(Number);
        path.push({ row: cr, col: cc });
        cursor = cameFrom.get(cursor);
      }
      return path.reverse();
    }

    open.delete(currentKey);
    neighbors({ row: r, col: c }).forEach((next) => {
      if (!inBounds(next)) return;
      if (!isWalkable(next)) return;
      const nextKey = key(next);
      const tentative = (gScore.get(currentKey) ?? Number.POSITIVE_INFINITY) + 1;
      if (tentative < (gScore.get(nextKey) ?? Number.POSITIVE_INFINITY)) {
        cameFrom.set(nextKey, currentKey);
        gScore.set(nextKey, tentative);
        fScore.set(nextKey, tentative + manhattan(next, end));
        open.add(nextKey);
      }
    });
  }

  return [] as GridNode[];
};

export type { GridNode };
export { findPath };
