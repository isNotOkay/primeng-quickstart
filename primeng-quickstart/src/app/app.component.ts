import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';

import { Table, TableModule } from 'primeng/table';
import { SplitterModule } from 'primeng/splitter';
import { SelectModule } from 'primeng/select';
import { ListboxModule } from 'primeng/listbox';
import { InputTextModule } from 'primeng/inputtext';
import { Toolbar } from 'primeng/toolbar';
import { Button, ButtonDirective } from 'primeng/button';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { Toast } from 'primeng/toast';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';

import { EngineType } from './enums/engine-type.enum';
import { ListItemModel } from './models/list-item.model';
import { DEFAULT_PAGE_INDEX, DEFAULT_PAGE_SIZE } from './constants/api-params.constants';
import { ApiService } from './services/api.service';
import { CreateOrUpdateRelationEvent, SignalRService } from './services/signalr.service';
import { NotificationService } from './services/notification.service';
import { finalize, forkJoin, of, Subscription } from 'rxjs';
import { RelationApiModel } from './models/api/relation.api-model';
import { RelationType } from './enums/relation-type.enum';
import { PagedResultApiModel } from './models/api/paged-result.api-model';
import { RowModel } from './models/row.model';
import { LoadingIndicator } from './components/loading-indicator/loading-indicator';
import { TableStateService } from './services/table-state.service';

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

type HubStatus = 'connecting' | 'connected' | 'failed';

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
    ConfirmDialog,
    LoadingIndicator,
    Button,
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  providers: [ConfirmationService],
})
export class AppComponent implements OnInit, OnDestroy {
  @ViewChild(Table) private dataTable?: Table;
  @ViewChild('filterInput') private filterInput?: ElementRef<HTMLInputElement>;

  protected readonly EngineType = EngineType;
  readonly engineControl = new FormControl<EngineType | null>(null, { nonNullable: false });

  protected isExcel(): boolean {
    return this.engineControl.value === EngineType.Excel;
  }

  // ── App boot/connection gating ─────────────────────────────────
  protected readonly hubStatus = signal<HubStatus>('connecting');

  // ── Signals / state ────────────────────────────────────────────
  protected readonly listsLoading = signal(true);
  protected readonly loadingRows = signal(false);
  protected readonly loadingSelection = signal(false);

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
  private readonly tableState = inject(TableStateService);
  private readonly confirmationService = inject(ConfirmationService);

  private loadRowsSubscription?: Subscription;
  private subscriptions: Subscription[] = [];
  private connectionDialogShown = false;
  private reconnectTimer: any = null;

  // ── Datenquelle select ─────────────────────────────────────────
  dataSources: { label: string; value: EngineType }[] = [
    { label: 'SQLite', value: EngineType.Sqlite },
    { label: 'Excel', value: EngineType.Excel },
  ];

  // ── Listbox (reactive) ─────────────────────────────────────────
  readonly listControl = new FormControl<string | null>(null, { nonNullable: false });
  private allGroups: Group[] = [];
  groupedOptions: Group[] = [];
  listFilter = '';

  private lastListSelection: string | null = null;
  private programmaticListSet = false;
  private recentRelationToasts = new Map<string, number>();

  constructor() {}

  ngOnInit() {
    this.subscriptions.push(
      this.signalRService.onCreateOrUpdateRelation$.subscribe((event) => {
        this.loadTablesAndViews(event);
        const kind = this.relationTypeLabel(event.relationType);
        this.toastOnceForRelation(kind, event);
      }),
    );

    this.subscriptions.push(
      this.signalRService.onDeleteRelation$.subscribe((event) => {
        const wasSelected = this.selectedListItem()?.id === event.name;
        this.loadTablesAndViews();
        if (wasSelected) this.setListSelection(null, false);
        const kind = this.relationTypeLabel(event.relationType);
        this.notificationService.info(`${kind} "${event.name}" wurde gelöscht.`);
      }),
    );

    this.subscriptions.push(
      this.signalRService.onReconnecting$.subscribe(() => {
        if (this.reconnectTimer || this.connectionDialogShown) return;
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          this.showReloadConfirm();
        }, 1500);
      }),
      this.signalRService.onReconnected$.subscribe(() => {
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      }),
      this.signalRService.onConnectionLost$.subscribe(() => {
        this.hubStatus.set('failed');
        this.showReloadConfirm();
      }),
    );

    // Boot: connect hub, then load engine & lists
    this.hubStatus.set('connecting');
    this.listsLoading.set(true);

    this.signalRService
      .startAndWait()
      .then(() => {
        this.hubStatus.set('connected');

        this.apiService.getEngine().subscribe({
          next: (dto) => {
            this.engineControl.setValue(dto.engine, { emitEvent: false });
            this.loadedTablesAndViews.set(false);
            this.clearSelectedListItem();
            this.loadTablesAndViews();
          },
          error: () => {
            this.notificationService.error('Datenquelle laden fehlgeschlagen.');
            this.loadedTablesAndViews.set(false);
            this.listsLoading.set(false);
          },
        });
      })
      .catch(() => {});

    // Persist engine changes + refresh lists
    this.engineControl.valueChanges.subscribe((engine) => {
      if (engine == null) return;

      this.saveCurrentTableWidths();
      this.loadRowsSubscription?.unsubscribe();
      this.clearSelectedListItem();
      this.setListSelection(null, false);
      this.groupedOptions = [];
      this.allGroups = [];
      this.listsLoading.set(true);
      this.loadedTablesAndViews.set(false);
      this.resetTableState();
      this.remountTable();

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
      this.saveCurrentTableWidths();

      if (!val) {
        if (this.programmaticListSet) {
          this.selectedListItem.set(null);
          this.remountTable();
          return;
        }
        if (this.lastListSelection) {
          this.listControl.setValue(this.lastListSelection, { emitEvent: false });
        }
        return;
      }

      this.lastListSelection = val;

      const sel = this.parseSelection(val);
      const item = this.findInLists(sel.type, sel.id);
      if (item) this.selectListItem(item);
    });
  }

  ngOnDestroy(): void {
    this.loadRowsSubscription?.unsubscribe();
    for (const s of this.subscriptions) s.unsubscribe();
    this.signalRService.stop().catch(() => {});
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

  protected onDeleteSelected(): void {
    const sel = this.selectedListItem();
    if (!sel) return;

    // Excel has no views, but list never shows them when Excel is selected.
    const isView = sel.relationType === RelationType.View;

    this.confirmationService.confirm({
      header: 'Löschen bestätigen',
      message: `Soll „${sel.label}“ wirklich gelöscht werden?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Löschen',
      rejectLabel: 'Abbrechen',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-secondary',
      accept: () => {
        this.apiService.deleteRelation(sel.relationType, sel.id).subscribe({
          next: () => {
            // ✅ Do NOT show a local success toast here.
            // Rely on the SignalR onDeleteRelation$ handler to show the single info toast.

            this.setListSelection(null, false);
            this.clearSelectedListItem();
          },
          error: (err) => {
            const status = err?.status;
            if (status === 404) {
              this.notificationService.warn(`${this.relationTypeLabel(sel.relationType)} existiert nicht mehr.`);
              this.setListSelection(null, false);
              this.clearSelectedListItem();
            } else if (status === 400) {
              this.notificationService.error('Ungültiger Name oder Anfrage.');
            } else if (sel.relationType === RelationType.View && this.isExcel()) {
              this.notificationService.warn('Sichten werden in Excel nicht unterstützt.');
            } else {
              this.notificationService.error('Löschen fehlgeschlagen.');
            }
          },
        });
      },
    });
  }

  // ── Build options & filter ─────────────────────────────────────
  private rebuildGroupsFromApi(): void {
    const tables: ItemOption[] = this.tableItems().map((it) => ({
      label: it.label,
      value: this.makeValue(RelationType.Table, it.id),
    }));

    const views: ItemOption[] = this.viewItems().map((it) => ({
      label: it.label,
      value: this.makeValue(RelationType.View, it.id),
    }));

    const groups: Group[] = [{ label: 'Tabellen', items: tables }];
    if (!this.isExcel()) groups.push({ label: 'Sichten', items: views });

    this.allGroups = groups;
    this.applyFilter(this.listFilter);
  }

  applyFilter(query: string) {
    const q = this.normalize(query);
    const isExcel = this.isExcel();
    const sourceGroups = this.allGroups.filter((g) => !(isExcel && g.label === 'Sichten'));

    this.groupedOptions = sourceGroups.map((g) => {
      const hadAnyItems = g.items.length > 0;
      const matched = q ? g.items.filter((it) => this.normalize(it.label).includes(q)) : g.items;

      const emptyLabel = hadAnyItems
        ? 'Keine Ergebnisse gefunden.'
        : g.label === 'Tabellen'
          ? 'Keine Tabellen vorhanden.'
          : 'Keine Sichten vorhanden.';

      const items = matched.length
        ? matched
        : [{ label: emptyLabel, value: `__placeholder__:${g.label}`, disabled: true, __placeholder: true }];

      return { label: g.label, items };
    });
  }

  isOptionDisabled = (opt: any) => !!opt?.disabled || !!opt?.__placeholder;

  private normalize(s: string) {
    return (s || '').toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  private remountTable() {
    this.renderTable.set(false);
    this.cdr.detectChanges();
    setTimeout(() => this.renderTable.set(true), 0);
  }

  // ── API loading for tables & views ─────────────────────────────
  private loadTablesAndViews(createRelationEvent?: CreateOrUpdateRelationEvent): void {
    this.listsLoading.set(true);

    const tables$ = this.apiService.loadTables();
    const views$ = this.isExcel() ? of({ items: [] as RelationApiModel[] }) : this.apiService.loadViews();

    forkJoin([tables$, views$]).subscribe({
      next: ([tablesResponse, viewsResponse]) => {
        this.tableItems.set(this.toListItems(tablesResponse.items, RelationType.Table));
        this.viewItems.set(this.toListItems(viewsResponse.items, RelationType.View));
        this.loadedTablesAndViews.set(true);
        this.listsLoading.set(false);

        this.rebuildGroupsFromApi();

        let listItem: ListItemModel | null = null;
        if (createRelationEvent) {
          const type = createRelationEvent.relationType === RelationType.View ? RelationType.View : RelationType.Table;
          listItem = this.findInLists(type, createRelationEvent.name);
        }

        if (listItem) {
          this.selectListItem(listItem);
          this.setListSelection(this.makeValue(listItem.relationType, listItem.id), false);
        } else {
          this.clearSelectedListItem();
          this.setListSelection(null, false);
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

    this.resetTableState();
    this.remountTable();

    this.refreshColumnsForCurrentSelection();
    this.loadTableData();
  }

  private updateColumnNames(): void {
    this.columnNames.set(this.selectedListItem()?.columnNames ?? []);
  }

  private clearSelectedListItem(): void {
    this.saveCurrentTableWidths();

    this.selectedListItem.set(null);
    this.columnNames.set([]);
    this.rows.set([]);
    this.totalCount.set(0);
    this.loadingRows.set(false);
    this.loadingSelection.set(false);
    this.resetTableState();
    this.remountTable();
  }

  private resetTableState(): void {
    this.pageIndex.set(DEFAULT_PAGE_INDEX);
    this.pageSize.set(DEFAULT_PAGE_SIZE);
    this.sortBy.set(null);
    this.sortDir.set('asc');

    if (this.dataTable) {
      (this.dataTable as any).first = 0;
    }
  }

  private refreshColumnsForCurrentSelection(): void {
    const sel = this.selectedListItem();
    if (!sel) return;

    this.loadingSelection.set(true);

    const meta$ =
      sel.relationType === RelationType.View && !this.isExcel()
        ? this.apiService.loadViews()
        : this.apiService.loadTables();

    const finish = () => this.loadingSelection.set(false);

    meta$.subscribe({
      next: (resp: { items?: RelationApiModel[] }) => {
        const found = (resp.items ?? []).find((r) => r.name === sel.id);
        const cols = found?.columnNames ?? [];
        if (cols.length) {
          this.columnNames.set(cols);
          const updated: ListItemModel = { ...sel, columnNames: cols };
          this.selectedListItem.set(updated);
          if (sel.relationType === RelationType.View) {
            this.viewItems.set(this.viewItems().map((i) => (i.id === sel.id ? updated : i)));
          } else {
            this.tableItems.set(this.tableItems().map((i) => (i.id === sel.id ? updated : i)));
          }
        }
        finish();
      },
      error: () => finish(),
    });
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

  // ── Column width state ─────────────────────────────────────────
  private currentRelationKey(): string | null {
    const sel = this.selectedListItem();
    if (!sel) return null;
    const typeKey = sel.relationType === RelationType.View ? 'View' : 'Table';
    return `${typeKey}|${sel.id}`;
  }

  onColResize(): void {
    setTimeout(() => this.saveCurrentTableWidths(), 0);
  }

  getColWidth(col: string): string | undefined {
    const key = this.currentRelationKey();
    return key ? this.tableState.getWidth(key, col) : undefined;
  }

  private saveCurrentTableWidths(): void {
    const key = this.currentRelationKey();
    if (!key || !this.dataTable) return;

    const host: HTMLElement | undefined = (this.dataTable as any).el?.nativeElement;
    if (!host) return;

    const tableEl =
      host.querySelector<HTMLElement>('.p-table-scrollable-header-table') ??
      host.querySelector<HTMLElement>('table');
    if (!tableEl) return;

    const ths = tableEl.querySelectorAll<HTMLElement>('thead th');
    const cols = this.columnNames();
    const widths: Record<string, string> = {};

    ths.forEach((th, i) => {
      const name = cols[i];
      if (!name) return;
      const px = Math.round(th.getBoundingClientRect().width);
      if (px > 0) widths[name] = `${px}px`;
    });

    this.tableState.setWidths(key, widths);
  }

  // ── Search clear button ────────────────────────────────────────
  clearSearch(): void {
    this.listFilter = '';
    this.applyFilter('');
    setTimeout(() => this.filterInput?.nativeElement?.focus(), 0);
  }

  // ── Connection lost dialog ─────────────────────────────────────
  private showReloadConfirm(): void {
    if (this.connectionDialogShown) return;
    this.connectionDialogShown = true;

    this.confirmationService.confirm({
      key: 'conn-lost',
      header: 'Verbindung getrennt',
      message: 'Die Verbindung zum Server wurde unterbrochen. Bitte laden Sie die Seite neu.',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Seite neu laden',
      rejectVisible: false,
      closable: false,
      closeOnEscape: false,
      dismissableMask: false,
      defaultFocus: 'accept',
      acceptButtonStyleClass: 'p-button-primary',
      accept: () => location.reload(),
    });
  }

  // ── Misc helpers ───────────────────────────────────────────────
  private makeValue(type: RelationType, id: string) {
    return `${type}|${id}`;
  }

  private parseSelection(v: string): { type: RelationType; id: string } {
    const [typeStr, ...rest] = v.split('|');
    const id = rest.join('|');
    const type = typeStr === RelationType.View ? RelationType.View : RelationType.Table;
    return { type, id };
  }

  private setListSelection(value: string | null, emitEvent = false) {
    this.programmaticListSet = true;
    this.listControl.setValue(value, { emitEvent });
    this.programmaticListSet = false;
    this.lastListSelection = value;
  }

  private toastOnceForRelation(kind: string, event: { name: string; relationType: RelationType; created: boolean }) {
    const key = `${event.relationType}|${event.name}|${event.created ? 'created' : 'updated'}`;
    const now = Date.now();
    const until = this.recentRelationToasts.get(key) ?? 0;
    if (until > now) return;

    this.recentRelationToasts.set(key, now + 1000);
    this.notificationService.info(
      event.created
        ? `${kind} "${event.name}" wurde erstellt.`
        : `${kind} "${event.name}" wurde aktualisiert.`,
    );

    for (const [k, t] of this.recentRelationToasts) if (t <= now) this.recentRelationToasts.delete(k);
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
