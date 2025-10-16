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
    FormsModule,            // still used for listbox filter & selection
    ReactiveFormsModule,    // <-- needed for [formControl] with p-select
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
  // expose enum to template
  protected readonly EngineType = EngineType;

  // Form control keeps exact server casing ("Sqlite" | "Excel")
  readonly engineControl = new FormControl<EngineType | null>(null, {nonNullable: false});

  // Reactive engine signal driven by the form control
  private readonly engineSignal = toSignal(this.engineControl.valueChanges, {
    initialValue: this.engineControl.value, // null until initial GET returns
  });

  protected readonly isExcel = computed(() => this.engineSignal() === EngineType.Excel);

  // Signals
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

  products: any[] = [];

  // NEW: dynamic columns container
  dynamicColumns: DynCol[] = [];

  // Toolbar: Datenquelle select (values must match backend: "Sqlite" | "Excel")
  dataSources: Array<{ label: string; value: EngineType }> = [
    { label: 'SQLite', value: EngineType.Sqlite },
    { label: 'Excel',  value: EngineType.Excel }
  ];

  // Left panel options (20 each)
  tableOptions: ItemOption[] = [
    {label: 'Products', value: 'Products'},
    {label: 'Orders', value: 'Orders'},
    {label: 'Customers', value: 'Customers'},
    {label: 'Suppliers', value: 'Suppliers'},
    {label: 'Shipments', value: 'Shipments'},
    {label: 'Invoices', value: 'Invoices'},
    {label: 'Payments', value: 'Payments'},
    {label: 'Employees', value: 'Employees'},
    {label: 'Departments', value: 'Departments'},
    {label: 'Categories', value: 'Categories'},
    {label: 'Inventory', value: 'Inventory'},
    {label: 'PurchaseOrders', value: 'PurchaseOrders'},
    {label: 'Sales', value: 'Sales'},
    {label: 'SalesItems', value: 'SalesItems'},
    {label: 'Returns', value: 'Returns'},
    {label: 'ReturnItems', value: 'ReturnItems'},
    {label: 'Regions', value: 'Regions'},
    {label: 'Countries', value: 'Countries'},
    {label: 'Cities', value: 'Cities'},
    {label: 'Warehouses', value: 'Warehouses'}
  ];

  viewOptions: ItemOption[] = [
    {label: 'Top Sellers', value: 'Top Sellers'},
    {label: 'Low Stock', value: 'Low Stock'},
    {label: 'Recent Orders', value: 'Recent Orders'},
    {label: 'Pending Shipments', value: 'Pending Shipments'},
    {label: 'High Value Customers', value: 'High Value Customers'},
    {label: 'Monthly Revenue', value: 'Monthly Revenue'},
    {label: 'Sales by Category', value: 'Sales by Category'},
    {label: 'Orders by Region', value: 'Orders by Region'},
    {label: 'Inventory Aging', value: 'Inventory Aging'},
    {label: 'Customer Churn', value: 'Customer Churn'},
    {label: 'Supplier Performance', value: 'Supplier Performance'},
    {label: 'On-Time Delivery', value: 'On-Time Delivery'},
    {label: 'Profit Margin by Product', value: 'Profit Margin by Product'},
    {label: 'Returns Rate', value: 'Returns Rate'},
    {label: 'Daily Sales Trend', value: 'Daily Sales Trend'},
    {label: 'Backordered Items', value: 'Backordered Items'},
    {label: 'New Customers', value: 'New Customers'},
    {label: 'Active Promotions', value: 'Active Promotions'},
    {label: 'Overdue Invoices', value: 'Overdue Invoices'},
    {label: 'Forecasted Demand', value: 'Forecasted Demand'}
  ];

  // Grouped data for the listbox
  private allGroups: Group[] = [];
  groupedOptions: Group[] = [];

  // Selection + external filter
  selectedItem?: string;
  listFilter = '';

  constructor(private productService: ProductService) {}

  ngOnInit() {
    // 1) Load persisted engine; keep select empty until this completes
    this.listsLoading.set(true);
    this.apiService.getEngine().subscribe({
      next: (dto) => {
        // Set enum value as-is from the backend ("Sqlite"/"Excel")
        this.engineControl.setValue(dto.engine, {emitEvent: false});
        this.loadedTablesAndViews.set(false);
        this.clearSelectedListItem();
        this.loadTablesAndViews(); // initial load after engine arrives
      },
      error: () => {
        this.notificationService.error('Datenquelle laden fehlgeschlagen.');
        this.loadedTablesAndViews.set(false);
      },
    });

    // 2) Persist engine changes when user selects a value
    this.engineControl.valueChanges.subscribe((engine) => {
      if (engine == null) return; // ignore null
      this.listsLoading.set(true);
      this.loadedTablesAndViews.set(false);
      this.apiService.setEngine(engine).subscribe({
        next: () => {
          // Optionally reload lists/data when engine changes
          // this.clearSelectedListItem();
          // this.loadTablesAndViews();
        },
        error: () => {
          this.notificationService.error('Fehler beim Speichern der Datenquelle.');
          this.listsLoading.set(false);
        },
      });
    });

    // Load table data for the right pane
    this.productService.getProducts().then(d => (this.products = d));

    // Initialize groups
    this.allGroups = [
      {label: 'Tabellen', items: this.tableOptions},
      {label: 'Sichten', items: this.viewOptions}
    ];

    // Initial (no) filter
    this.applyFilter('');
  }

  // Keep groups visible; when a group has no matches, insert a disabled placeholder row
  applyFilter(query: string) {
    const q = this.normalize(query);
    this.groupedOptions = this.allGroups.map(g => {
      const matched = q
        ? g.items.filter(it => this.normalize(it.label).includes(q))
        : g.items;

      const items = matched.length
        ? matched
        : [{label: 'Keine Treffer', value: null, disabled: true, __placeholder: true}];

      return {label: g.label, items};
    });
  }

  // Used by p-listbox to prevent selecting placeholders/disabled items
  isOptionDisabled = (opt: any) => !!opt?.disabled || !!opt?.__placeholder;

  private normalize(s: string) {
    // case-insensitive, diacritic-insensitive search
    return (s || '')
      .toLocaleLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''); // strip combining marks
  }

  // For the PrimeNG table on the right
  rowTrackBy(i: number, p: any) {
    return p.id ?? p.code ?? i;
  }

  isNumber(v: any) {
    return typeof v === 'number';
  }

  private clearSelectedListItem(): void {
    this.selectedListItem.set(null);
    this.columnNames.set([]);
    this.rows.set([]);
    this.totalCount.set(0);
    this.loadingRows.set(false);
  }

  private loadTablesAndViews(createRelationEvent?: CreateOrUpdateRelationEvent): void {
    this.listsLoading.set(true);

    // Backend reads engine from settings; no engine query parameter needed
    const tables$ = this.apiService.loadTables();
    const views$ = this.isExcel() ? of({items: [] as RelationApiModel[]}) : this.apiService.loadViews();

    forkJoin([tables$, views$]).subscribe({
      next: ([tablesResponse, viewsResponse]) => {
        this.tableItems.set(this.toListItems(tablesResponse.items, RelationType.Table));
        this.viewItems.set(this.toListItems(viewsResponse.items, RelationType.View));
        this.loadedTablesAndViews.set(true);
        this.listsLoading.set(false);

        let listItem: ListItemModel | null = null;

        if (createRelationEvent) {
          const type = createRelationEvent.relationType === RelationType.View
            ? RelationType.View
            : RelationType.Table;
          listItem = this.findInLists(type, createRelationEvent.name);
        }

        if (listItem) {
          this.selectListItem(listItem);
        } else {
          this.clearSelectedListItem();
        }
      },
      error: () => {
        this.notificationService.error('Fehler beim Aktualisieren der Tabellen und Ansichten.');
        this.listsLoading.set(false);
      },
    });
  }

  private findInLists(type: RelationType, id: string): ListItemModel | null {
    const listItems = type === RelationType.Table ? this.tableItems() : this.viewItems();
    return listItems.find(item => item.id === id) ?? null;
  }

  private selectListItem(item: ListItemModel): void {
    this.selectedListItem.set(item);
    this.pageIndex.set(0);
    this.sortBy.set(null);
    this.sortDir.set('asc');
  }

  private toListItems(relations: RelationApiModel[] | null | undefined, type: RelationType): ListItemModel[] {
    return (relations ?? []).map((relation) => ({
      id: relation.name,
      label: relation.name,
      relationType: type,
      columnNames: relation.columnNames ?? [],
    }));
  }
}
