// file: src/app/app.component.ts
import {Component, computed, inject, OnInit, signal} from '@angular/core';
import {DecimalPipe} from '@angular/common';
import {FormControl, FormsModule, ReactiveFormsModule} from '@angular/forms';

import {TableModule} from 'primeng/table';
import {SplitterModule} from 'primeng/splitter';
import {SelectModule} from 'primeng/select';
import {ListboxModule} from 'primeng/listbox';
import {InputTextModule} from 'primeng/inputtext';
import {Toolbar} from 'primeng/toolbar';
import {ButtonDirective} from 'primeng/button';

import {ProductService} from './services/productsservice';
import {IconField} from 'primeng/iconfield';
import {InputIcon} from 'primeng/inputicon';
import {toSignal} from '@angular/core/rxjs-interop';
import {EngineType} from "./enums/engine-type.enum";
import {ListItemModel} from './models/list-item.model';
import {DEFAULT_PAGE_INDEX, DEFAULT_PAGE_SIZE} from './constants/api-params.constants';
import {ApiService} from './services/api.service';
import {CreateOrUpdateRelationEvent, SignalRService} from './services/signalr.service';
import {NotificationService} from './services/notification.service';
import {forkJoin, of, Subscription} from 'rxjs';
import {RelationApiModel} from './models/api/relation.api-model';
import {RelationType} from './enums/relation-type.enum';

// Types for grouped listbox
type ItemOption = { label: string; value: string | null; disabled?: boolean; __placeholder?: boolean };
type Group = { label: string; items: ItemOption[] };

// NEW: type for dynamic table columns
type DynCol = { field: string; header: string };

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    // Angular
    DecimalPipe,
    FormsModule,         // still used for the search input
    ReactiveFormsModule, // for [formControl] on select + listbox
    // PrimeNG
    TableModule,
    SplitterModule,
    SelectModule,
    ListboxModule,
    InputTextModule,
    Toolbar,
    ButtonDirective,
    IconField,
    InputIcon
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  // ── Engine select (reactive) ───────────────────────────────────
  protected readonly EngineType = EngineType;
  readonly engineControl = new FormControl<EngineType | null>(null, { nonNullable: false });
  private readonly engineSignal = toSignal(this.engineControl.valueChanges, {
    initialValue: this.engineControl.value,
  });
  protected readonly isExcel = computed(() => this.engineSignal() === EngineType.Excel);

  // ── Signals / state ────────────────────────────────────────────
  protected readonly listsLoading = signal(true);
  protected readonly loadingRows = signal(true);
  protected readonly loadedTablesAndViews = signal(false);
  protected readonly tableItems = signal<ListItemModel[]>([]);
  protected readonly viewItems = signal<ListItemModel[]>([]);
  protected readonly selectedListItem = signal<ListItemModel | null>(null);
  protected readonly columnNames = signal<string[]>([]);
  protected readonly rows = signal<Record<string, unknown>[]>([]);
  protected readonly totalCount = signal(0);
  protected readonly pageIndex = signal(DEFAULT_PAGE_INDEX);
  protected readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  protected readonly sortBy = signal<string | null>(null);
  protected readonly sortDir = signal<'asc' | 'desc'>('asc');

  private readonly apiService = inject(ApiService);
  private readonly signalRService = inject(SignalRService);
  private readonly notificationService = inject(NotificationService);
  private loadRowsSubscription?: Subscription;

  // Table data (right pane demo)
  products: any[] = [];
  dynamicColumns: DynCol[] = [];

  // ── Datenquelle select: values match backend ("Sqlite" | "Excel") ─
  dataSources: Array<{ label: string; value: EngineType }> = [
    { label: 'SQLite', value: EngineType.Sqlite },
    { label: 'Excel',  value: EngineType.Excel  }
  ];

  // ── Listbox (reactive) ─────────────────────────────────────────
  // The listbox value encodes type+id like "table|Jet Journal Klein"
  readonly listControl = new FormControl<string | null>(null, { nonNullable: false });

  // Grouped data for the listbox (rebuilt from API items)
  private allGroups: Group[] = [];
  groupedOptions: Group[] = [];

  // External filter
  listFilter = '';

  constructor(private productService: ProductService) {}

  ngOnInit() {
    // Load persisted engine
    this.listsLoading.set(true);
    this.apiService.getEngine().subscribe({
      next: (dto) => {
        this.engineControl.setValue(dto.engine, { emitEvent: false });
        this.loadedTablesAndViews.set(false);
        this.clearSelectedListItem();
        this.loadTablesAndViews(); // initial load after engine arrives
      },
      error: () => {
        this.notificationService.error('Datenquelle laden fehlgeschlagen.');
        this.loadedTablesAndViews.set(false);
      },
    });

    // Persist engine changes + refresh lists
    this.engineControl.valueChanges.subscribe((engine) => {
      if (engine == null) return;
      this.listsLoading.set(true);
      this.loadedTablesAndViews.set(false);
      this.apiService.setEngine(engine).subscribe({
        next: () => {
          // Reload tables/views for the chosen engine
          this.loadTablesAndViews();
        },
        error: () => {
          this.notificationService.error('Fehler beim Speichern der Datenquelle.');
          this.listsLoading.set(false);
        },
      });
    });

    // React to list selection changes
    this.listControl.valueChanges.subscribe((val) => {
      if (!val) {
        this.selectedListItem.set(null);
        return;
      }
      const sel = this.parseSelection(val);
      const item = this.findInLists(sel.type, sel.id);
      if (item) {
        this.selectListItem(item);
      }
    });

    // Demo data (right pane)
    this.productService.getProducts().then(d => (this.products = d));
  }

  // ── Build options from API data and apply current filter ───────
  private rebuildGroupsFromApi(): void {
    // Map API list items to listbox options (value encodes type + id)
    const tables: ItemOption[] = this.tableItems().map(it => ({
      label: it.label,
      value: this.makeValue(RelationType.Table, it.id)
    }));

    const views: ItemOption[] = this.viewItems().map(it => ({
      label: it.label,
      value: this.makeValue(RelationType.View, it.id)
    }));

    this.allGroups = [
      { label: 'Tabellen', items: tables },
      { label: 'Sichten',  items: views  }
    ];

    // Re-apply current filter
    this.applyFilter(this.listFilter);
  }

  // External filter keeps groups visible; adds placeholder when no matches
  applyFilter(query: string) {
    const q = this.normalize(query);
    this.groupedOptions = this.allGroups.map(g => {
      const matched = q
        ? g.items.filter(it => this.normalize(it.label).includes(q))
        : g.items;

      const items = matched.length
        ? matched
        : [{ label: 'Keine Treffer', value: null, disabled: true, __placeholder: true }];

      return { label: g.label, items };
    });
  }

  // Used by p-listbox to prevent selecting placeholders/disabled items
  isOptionDisabled = (opt: any) => !!opt?.disabled || !!opt?.__placeholder;

  private normalize(s: string) {
    return (s || '')
      .toLocaleLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  // ── API loading for tables & views ─────────────────────────────
  private loadTablesAndViews(createRelationEvent?: CreateOrUpdateRelationEvent): void {
    this.listsLoading.set(true);

    const tables$ = this.apiService.loadTables();
    const views$  = this.isExcel() ? of({ items: [] as RelationApiModel[] }) : this.apiService.loadViews();

    forkJoin([tables$, views$]).subscribe({
      next: ([tablesResponse, viewsResponse]) => {
        this.tableItems.set(this.toListItems(tablesResponse.items, RelationType.Table));
        this.viewItems.set(this.toListItems(viewsResponse.items, RelationType.View));
        this.loadedTablesAndViews.set(true);
        this.listsLoading.set(false);

        // Rebuild listbox groups from fresh data
        this.rebuildGroupsFromApi();

        // Optional: preselect an item from a SignalR-created relation
        let listItem: ListItemModel | null = null;
        if (createRelationEvent) {
          const type = createRelationEvent.relationType === RelationType.View
            ? RelationType.View
            : RelationType.Table;
          listItem = this.findInLists(type, createRelationEvent.name);
        }

        if (listItem) {
          this.selectListItem(listItem);
          // reflect selection in the control
          this.listControl.setValue(this.makeValue(listItem.relationType, listItem.id), { emitEvent: false });
        } else {
          this.clearSelectedListItem();
          this.listControl.setValue(null, { emitEvent: false });
        }
      },
      error: () => {
        this.notificationService.error('Fehler beim Aktualisieren der Tabellen und Ansichten.');
        this.listsLoading.set(false);
      },
    });
  }

  private toListItems(relations: RelationApiModel[] | null | undefined, type: RelationType): ListItemModel[] {
    return (relations ?? []).map((relation) => ({
      id: relation.name,
      label: relation.name,
      relationType: type,
      columnNames: relation.columnNames ?? [],
    }));
  }

  private findInLists(type: RelationType, id: string): ListItemModel | null {
    const list = type === RelationType.Table ? this.tableItems() : this.viewItems();
    return list.find(item => item.id === id) ?? null;
  }

  private selectListItem(item: ListItemModel): void {
    this.selectedListItem.set(item);
    this.pageIndex.set(0);
    this.sortBy.set(null);
    this.sortDir.set('asc');
    // If you want to kick off row loading here, call your rows API.
  }

  private clearSelectedListItem(): void {
    this.selectedListItem.set(null);
    this.columnNames.set([]);
    this.rows.set([]);
    this.totalCount.set(0);
    this.loadingRows.set(false);
  }

  // ── Helpers for encoded selection values ───────────────────────
  private makeValue(type: RelationType, id: string) {
    return `${type}|${id}`;
  }

  private parseSelection(v: string): { type: RelationType; id: string } {
    const [typeStr, ...rest] = v.split('|');
    const id = rest.join('|'); // allow '|' in names just in case
    const type = typeStr === RelationType.View ? RelationType.View : RelationType.Table;
    return { type, id };
  }

  // ── Table helpers (right pane) ─────────────────────────────────
  rowTrackBy(i: number, p: any) {
    return p.id ?? p.code ?? i;
  }

  isNumber(v: any) {
    return typeof v === 'number';
  }
}
