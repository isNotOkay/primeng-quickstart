// file: src/app/app.component.ts
import { Component, OnInit } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { TableModule } from 'primeng/table';
import { SplitterModule } from 'primeng/splitter';
import { SelectModule } from 'primeng/select';
import { ListboxModule } from 'primeng/listbox';
import { InputTextModule } from 'primeng/inputtext';
import { Toolbar } from 'primeng/toolbar';
import { ButtonDirective } from 'primeng/button';

import { ProductService } from './service/productsservice';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';

// Types for grouped listbox
type ItemOption = { label: string; value: string | null; disabled?: boolean; __placeholder?: boolean };
type Group = { label: string; items: ItemOption[] };

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    // Angular
    DecimalPipe,
    FormsModule,
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
  templateUrl: './app.component.html'
})
export class AppComponent implements OnInit {
  products: any[] = [];

  // Toolbar: Datenquelle select
  dataSources = [
    { label: 'Alle', value: 'all' },
    { label: 'Lokal', value: 'local' },
    { label: 'Remote', value: 'remote' }
  ];
  selectedDataSource: string = 'all';

  // Left panel options (20 each)
  tableOptions: ItemOption[] = [
    { label: 'Products', value: 'Products' },
    { label: 'Orders', value: 'Orders' },
    { label: 'Customers', value: 'Customers' },
    { label: 'Suppliers', value: 'Suppliers' },
    { label: 'Shipments', value: 'Shipments' },
    { label: 'Invoices', value: 'Invoices' },
    { label: 'Payments', value: 'Payments' },
    { label: 'Employees', value: 'Employees' },
    { label: 'Departments', value: 'Departments' },
    { label: 'Categories', value: 'Categories' },
    { label: 'Inventory', value: 'Inventory' },
    { label: 'PurchaseOrders', value: 'PurchaseOrders' },
    { label: 'Sales', value: 'Sales' },
    { label: 'SalesItems', value: 'SalesItems' },
    { label: 'Returns', value: 'Returns' },
    { label: 'ReturnItems', value: 'ReturnItems' },
    { label: 'Regions', value: 'Regions' },
    { label: 'Countries', value: 'Countries' },
    { label: 'Cities', value: 'Cities' },
    { label: 'Warehouses', value: 'Warehouses' }
  ];

  viewOptions: ItemOption[] = [
    { label: 'Top Sellers', value: 'Top Sellers' },
    { label: 'Low Stock', value: 'Low Stock' },
    { label: 'Recent Orders', value: 'Recent Orders' },
    { label: 'Pending Shipments', value: 'Pending Shipments' },
    { label: 'High Value Customers', value: 'High Value Customers' },
    { label: 'Monthly Revenue', value: 'Monthly Revenue' },
    { label: 'Sales by Category', value: 'Sales by Category' },
    { label: 'Orders by Region', value: 'Orders by Region' },
    { label: 'Inventory Aging', value: 'Inventory Aging' },
    { label: 'Customer Churn', value: 'Customer Churn' },
    { label: 'Supplier Performance', value: 'Supplier Performance' },
    { label: 'On-Time Delivery', value: 'On-Time Delivery' },
    { label: 'Profit Margin by Product', value: 'Profit Margin by Product' },
    { label: 'Returns Rate', value: 'Returns Rate' },
    { label: 'Daily Sales Trend', value: 'Daily Sales Trend' },
    { label: 'Backordered Items', value: 'Backordered Items' },
    { label: 'New Customers', value: 'New Customers' },
    { label: 'Active Promotions', value: 'Active Promotions' },
    { label: 'Overdue Invoices', value: 'Overdue Invoices' },
    { label: 'Forecasted Demand', value: 'Forecasted Demand' }
  ];

  // Grouped data for the listbox
  private allGroups: Group[] = [];
  groupedOptions: Group[] = [];

  // Selection + external filter
  selectedItem?: string;
  listFilter = '';

  constructor(private productService: ProductService) {}

  ngOnInit() {
    // Load table data for the right pane
    this.productService.getProducts().then(d => (this.products = d));

    // Initialize groups
    this.allGroups = [
      { label: 'Tabellen', items: this.tableOptions },
      { label: 'Sichten',  items: this.viewOptions }
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
        : [{ label: 'Keine Treffer', value: null, disabled: true, __placeholder: true }];

      return { label: g.label, items };
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
}
