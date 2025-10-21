import { Injectable } from '@angular/core';

export type ColWidths = Record<string, string>; // e.g. { Id: '120px', Name: '240px' }

@Injectable({ providedIn: 'root' })
export class TableStateService {
  private widthsByKey = new Map<string, ColWidths>();

  getWidths(relationKey: string): ColWidths | undefined {
    return this.widthsByKey.get(relationKey);
  }

  getWidth(relationKey: string, col: string): string | undefined {
    return this.widthsByKey.get(relationKey)?.[col];
  }

  setWidths(relationKey: string, widths: ColWidths): void {
    this.widthsByKey.set(relationKey, widths);
  }

  clear(relationKey?: string): void {
    relationKey ? this.widthsByKey.delete(relationKey) : this.widthsByKey.clear();
  }
}
