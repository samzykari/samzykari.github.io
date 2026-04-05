import { GRID_CELL_SIZE } from "../constants";

/**
 * Lightweight spatial-hash grid for broad-phase collision.
 * Maps objects to grid cells so only nearby pairs are checked.
 * Rebuilt every frame — no incremental updates needed.
 */
export class SpatialGrid<T> {
  private _cells: Map<string, T[]> = new Map();
  private _cellSize: number;
  private _queryResult: T[] = [];
  private _keyBuf = "";

  constructor(cellSize: number = GRID_CELL_SIZE) {
    this._cellSize = cellSize;
  }

  clear(): void {
    // Reuse bucket arrays instead of dropping them for GC
    for (const bucket of this._cells.values()) {
      bucket.length = 0;
    }
  }

  /** Insert an object at world position (x, z). */
  insert(obj: T, x: number, z: number): void {
    const key = this._key(x, z);
    let bucket = this._cells.get(key);
    if (!bucket) {
      bucket = [];
      this._cells.set(key, bucket);
    }
    bucket.push(obj);
  }

  /** Return all objects in the same cell and 8 neighbours of (x, z). */
  query(x: number, z: number): readonly T[] {
    const cx = Math.floor(x / this._cellSize);
    const cz = Math.floor(z / this._cellSize);
    this._queryResult.length = 0;

    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        this._keyBuf = `${cx + dx},${cz + dz}`;
        const bucket = this._cells.get(this._keyBuf);
        if (bucket) {
          for (let i = 0; i < bucket.length; i++) {
            this._queryResult.push(bucket[i]);
          }
        }
      }
    }
    return this._queryResult;
  }

  private _key(x: number, z: number): string {
    return `${Math.floor(x / this._cellSize)},${Math.floor(z / this._cellSize)}`;
  }
}
