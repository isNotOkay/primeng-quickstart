// file: src/app/app.component.ts
import {ChangeDetectorRef, Component, inject, OnDestroy, OnInit, signal, ViewChild} from '@angular/core';
import {FormControl, FormsModule, ReactiveFormsModule} from '@angular/forms';

import {Table, TableModule} from 'primeng/table';
import {SplitterModule} from 'primeng/splitter';
import {SelectModule} from 'primeng/select';
import {ListboxModule} from 'primeng/listbox';
import {InputTextModule} from 'primeng/inputtext';
import {Toolbar} from 'primeng/toolbar';
import {ButtonDirective} from 'primeng/button';

import {IconField} from 'primeng/iconfield';
import {InputIcon} from 'primeng/inputicon';
import {EngineType} from './enums/engine-type.enum';
import {ListItemModel} from './models/list-item.model';
import {DEFAULT_PAGE_INDEX, DEFAULT_PAGE_SIZE} from './constants/api-params.constants';
import {ApiService} from './services/api.service';
import {CreateOrUpdateRelationEvent, SignalRService} from './services/signalr.service';
import {NotificationService} from './services/notification.service';
import {finalize, forkJoin, of, Subscription} from 'rxjs';
import {RelationApiModel} from './models/api/relation.api-model';
import {RelationType} from './enums/relation-type.enum';
import {PagedResultApiModel} from './models/api/paged-result.api-model';
import {RowModel} from './models/row.model';
import {Toast} from 'primeng/toast';
import {LoadingIndicator} from './components/loading-indicator/loading-indicator';

// Types for grouped listbox
interface ItemOption {
  label: string;
  value: string | null;
  disabled?: boolean;
  __placeholder?: boolean;
}

interface Group {
  label: string;
  items: ItemOption[];
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    TableModule,
    SplitterModule,
    SelectModule,
    ListboxModule,
    InputTextModule,
    Toolbar,
    ButtonDirective,
    IconField,
    InputIcon,
    Toast,
    LoadingIndicator,
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnInit, OnDestroy {
  @ViewChild(Table) private dataTable?: Table;

  protected readonly EngineType = EngineType;
  readonly engineControl = new FormControl<EngineType | null>(null, {nonNullable: false});

  protected isExcel(): boolean {
    return this.engineControl.value === EngineType.Excel;
  }

  // ── Signals / state ────────────────────────────────────────────
  protected readonly listsLoading = signal(true);
  protected readonly loadingRows = signal(false);
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
  protected readonly renderTable = signal(true);
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly apiService = inject(ApiService);

  private readonly signalRService = inject(SignalRService);
  private readonly notificationService = inject(NotificationService);
  private loadRowsSubscription?: Subscription;
  private subscriptions: Subscription[] = [];
  // ── Datenquelle select ─────────────────────────────────────────

  dataSources: { label: string; value: EngineType }[] = [
    {label: 'SQLite', value: EngineType.Sqlite},
    {label: 'Excel', value: EngineType.Excel},
  ];
  // ── Listbox (reactive) ─────────────────────────────────────────

  readonly listControl = new FormControl<string | null>(null, {nonNullable: false});
  private allGroups: Group[] = [];
  groupedOptions: Group[] = [];
  listFilter = '';

  constructor() {
  }

  ngOnInit() {
    this.signalRService.start();

    this.subscriptions.push(
      this.signalRService.onCreateOrUpdateRelation$.subscribe((event) => {
        this.loadTablesAndViews(event);
        const kind = this.relationTypeLabel(event.relationType);
        this.notificationService.info(
          event.created ? `${kind} "${event.name}" wurde erstellt.` : `${kind} "${event.name}" wurde aktualisiert.`,
        );
      }),
    );

    this.subscriptions.push(
      this.signalRService.onDeleteRelation$.subscribe((event) => {
        const wasSelected = this.selectedListItem()?.id === event.name;
        this.loadTablesAndViews();
        if (wasSelected) this.listControl.setValue(null, {emitEvent: false});
        const kind = this.relationTypeLabel(event.relationType);
        this.notificationService.info(`${kind} "${event.name}" wurde gelöscht.`);
      }),
    );

    // Load persisted engine
    this.listsLoading.set(true);
    this.apiService.getEngine().subscribe({
      next: (dto) => {
        this.engineControl.setValue(dto.engine, {emitEvent: false});
        this.loadedTablesAndViews.set(false);
        this.clearSelectedListItem();
        this.loadTablesAndViews();
      },
      error: () => {
        this.notificationService.error('Datenquelle laden fehlgeschlagen.');
        this.loadedTablesAndViews.set(false);
      },
    });

    // Persist engine changes + refresh lists
    this.engineControl.valueChanges.subscribe((engine) => {
      if (engine == null) return;

      this.loadRowsSubscription?.unsubscribe();
      this.clearSelectedListItem();
      this.listControl.setValue(null, {emitEvent: false});
      this.groupedOptions = [];
      this.allGroups = [];
      this.listsLoading.set(true);
      this.loadedTablesAndViews.set(false);
      this.resetTableState();
      this.remountTable(); // ensure next table is fresh

      this.apiService.setEngine(engine).subscribe({
        next: () => this.loadTablesAndViews(),
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
        this.remountTable(); // unmount any previous table
        return;
      }
      const sel = this.parseSelection(val);
      const item = this.findInLists(sel.type, sel.id);
      if (item) this.selectListItem(item);
    });
  }

  ngOnDestroy(): void {
    this.loadRowsSubscription?.unsubscribe();
    for (const s of this.subscriptions) s.unsubscribe();
    this.signalRService.stop().catch(() => {
    });
  }

  protected onDownload(): void {
    const engine = this.engineControl.value;
    if (!engine) {
      this.notificationService.error('Bitte warten Sie, bis die Datenquelle geladen wurde.');
      return;
    }
    this.apiService.downloadEngineFile(engine).subscribe({
      next: (res) => {
        const blob = res.body!;
        const cd = res.headers.get('Content-Disposition') || '';
        const nameMatch = /filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i.exec(cd);
        const fileName = nameMatch?.[1] ?? (engine === EngineType.Excel ? 'workbook.xlsx' : 'database.db');

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      },
      error: () => this.notificationService.error('Download fehlgeschlagen.'),
    });
  }

  // ── Build options from API data and apply current filter ───────

  private rebuildGroupsFromApi(): void {
    const tables: ItemOption[] = this.tableItems().map((it) => ({
      label: it.label,
      value: this.makeValue(RelationType.Table, it.id),
    }));

    const views: ItemOption[] = this.viewItems().map((it) => ({
      label: it.label,
      value: this.makeValue(RelationType.View, it.id),
    }));

    const groups: Group[] = [{label: 'Tabellen', items: tables}];
    if (!this.isExcel()) groups.push({label: 'Sichten', items: views});

    this.allGroups = groups;
    this.applyFilter(this.listFilter);
  }

  applyFilter(query: string) {
    const q = this.normalize(query);
    const isExcel = this.isExcel();

    const sourceGroups = this.allGroups.filter((g) => !(isExcel && g.label === 'Sichten'));

    this.groupedOptions = sourceGroups.map((g) => {
      const matched = q ? g.items.filter((it) => this.normalize(it.label).includes(q)) : g.items;

      const items = matched.length
        ? matched
        : [{label: 'Keine Treffer', value: null, disabled: true, __placeholder: true}];

      return {label: g.label, items};
    });
  }

  isOptionDisabled = (opt: any) => !!opt?.disabled || !!opt?.__placeholder;

  private normalize(s: string) {
    return (s || '').toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  // Make sure the table is recreated on selection changes to reset column sizes.
  private remountTable() {
    this.renderTable.set(false);
    this.cdr.detectChanges();

    setTimeout(() => {
      this.renderTable.set(true);
    }, 0);
  }

  // ── API loading for tables & views ─────────────────────────────
  private loadTablesAndViews(createRelationEvent?: CreateOrUpdateRelationEvent): void {
    this.listsLoading.set(true);

    const tables$ = this.apiService.loadTables();
    const views$ = this.isExcel() ? of({items: [] as RelationApiModel[]}) : this.apiService.loadViews();

    forkJoin([tables$, views$]).subscribe({
      next: ([tablesResponse, viewsResponse]) => {
        this.tableItems.set(this.toListItems(tablesResponse.items, RelationType.Table));
        this.viewItems.set(this.toListItems(viewsResponse.items, RelationType.View));
        this.loadedTablesAndViews.set(true);
        this.listsLoading.set(false);

        this.rebuildGroupsFromApi();

        let listItem: ListItemModel | null = null;
        if (createRelationEvent) {
          const type =
            createRelationEvent.relationType === RelationType.View ? RelationType.View : RelationType.Table;
          listItem = this.findInLists(type, createRelationEvent.name);
        }

        if (listItem) {
          this.selectListItem(listItem);
          this.listControl.setValue(this.makeValue(listItem.relationType, listItem.id), {emitEvent: false});
        } else {
          this.clearSelectedListItem();
          this.listControl.setValue(null, {emitEvent: false});
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
    return list.find((item) => item.id === id) ?? null;
  }

  private selectListItem(item: ListItemModel): void {
    this.selectedListItem.set(item);
    this.updateColumnNames();

    // Reset paging/sort, then remount and load
    this.resetTableState();
    this.remountTable();
    this.loadTableData();
  }

  private updateColumnNames(): void {
    this.columnNames.set(this.selectedListItem()?.columnNames ?? []);
  }

  private clearSelectedListItem(): void {
    this.selectedListItem.set(null);
    this.columnNames.set([]);
    this.rows.set([]);
    this.totalCount.set(0);
    this.loadingRows.set(false);
    this.resetTableState();
    this.remountTable();
  }

  /** Reset paging & sort state and keep paginator UI in sync */
  private resetTableState(): void {
    this.pageIndex.set(DEFAULT_PAGE_INDEX);
    this.pageSize.set(DEFAULT_PAGE_SIZE);
    this.sortBy.set(null);
    this.sortDir.set('asc');

    if (this.dataTable) {
      (this.dataTable as any).first = 0;
    }
  }

  private loadTableData(): void {
    const listItem = this.selectedListItem();
    if (!listItem) return;

    this.loadingRows.set(true);
    this.loadRowsSubscription?.unsubscribe();

    this.loadRowsSubscription = this.apiService
      .loadTableData(
        listItem.relationType,
        listItem.id,
        this.pageIndex(),
        this.pageSize(),
        this.sortBy(),
        this.sortDir(),
      )
      .pipe(finalize(() => this.loadingRows.set(false)))
      .subscribe({
        next: (result: PagedResultApiModel<RowModel>) => {
          this.rows.set(result.items ?? []);
          this.totalCount.set((result.total as number) ?? 0);
        },
        error: () => {
          this.rows.set([]);
          this.totalCount.set(0);
          this.notificationService.error('Fehler beim Laden der Daten.');
        },
      });
  }

  onPage(event: any) {
    const newSize = event?.rows ?? this.pageSize();
    const newFirst = event?.first ?? 0;
    const newIndex = Math.floor(newFirst / Math.max(1, newSize));

    this.pageSize.set(newSize);
    this.pageIndex.set(newIndex);
    this.loadTableData();
  }

  onSort(event: any) {
    this.sortBy.set(event?.field ?? null);
    this.sortDir.set(event?.order === 1 ? 'asc' : 'desc');

    this.pageIndex.set(0);
    if (this.dataTable) {
      (this.dataTable as any).first = 0;
    }
    this.loadTableData();
  }

  private makeValue(type: RelationType, id: string) {
    return `${type}|${id}`;
  }

  private parseSelection(v: string): { type: RelationType; id: string } {
    const [typeStr, ...rest] = v.split('|');
    const id = rest.join('|');
    const type = typeStr === RelationType.View ? RelationType.View : RelationType.Table;
    return {type, id};
  }

  rowTrackBy(i: number, p: any) {
    return p?.id ?? p?.Id ?? p?.ID ?? i;
  }

  isNumber(v: any) {
    return typeof v === 'number';
  }

  private relationTypeLabel(t: RelationType) {
    return t === RelationType.View ? 'Sicht' : 'Tabelle';
  }
}
