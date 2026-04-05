import { Mesh } from "@babylonjs/core";

/**
 * Generic object pool. Pre-allocates instances and recycles them
 * to avoid GC pressure during gameplay.
 */
export class ObjectPool<T extends Mesh> {
  private _available: T[] = [];
  private _active: Set<T> = new Set();
  private _factory: () => T;
  private _maxSize: number;

  constructor(factory: () => T, initialSize: number, maxSize: number = 2000) {
    this._factory = factory;
    this._maxSize = maxSize;

    for (let i = 0; i < initialSize; i++) {
      const obj = factory();
      obj.setEnabled(false);
      this._available.push(obj);
    }
  }

  acquire(): T | null {
    let obj: T;
    if (this._available.length > 0) {
      obj = this._available.pop()!;
    } else if (this._active.size + this._available.length < this._maxSize) {
      obj = this._factory();
    } else {
      return null; // pool exhausted
    }
    obj.setEnabled(true);
    this._active.add(obj);
    return obj;
  }

  release(obj: T): void {
    if (!this._active.has(obj)) return;
    obj.setEnabled(false);
    obj.position.set(0, -999, 0);
    this._active.delete(obj);
    this._available.push(obj);
  }

  releaseAll(): void {
    this._active.forEach((obj) => {
      obj.setEnabled(false);
      obj.position.set(0, -999, 0);
      this._available.push(obj);
    });
    this._active.clear();
  }

  forEachActive(fn: (obj: T) => void): void {
    this._active.forEach(fn);
  }

  get activeCount(): number {
    return this._active.size;
  }

  get availableCount(): number {
    return this._available.length;
  }

  dispose(): void {
    this._available.forEach((o) => o.dispose());
    this._active.forEach((o) => o.dispose());
    this._available.length = 0;
    this._active.clear();
  }
}
