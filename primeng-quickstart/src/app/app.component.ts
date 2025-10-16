// file: src/app/app.component.ts
import { Component, OnInit } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { TableModule } from 'primeng/table';
import { SplitterModule } from 'primeng/splitter';
import { SelectModule } from 'primeng/select';
import { ListboxModule } from 'primeng/listbox';
import { Toolbar } from 'primeng/toolbar';
import { ButtonDirective } from 'primeng/button';

import { ProductService } from './service/productsservice';

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
    Toolbar,
    ButtonDirective
  ],
  templateUrl: './app.component.html'
})
export class AppComponent implements OnInit {
  products: any[] = [];

  // Datenquelle Select (top-left)
  dataSources = [
    { label: 'Alle', value: 'all' },
    { label: 'Lokal', value: 'local' },
    { label: 'Remote', value: 'remote' }
  ];
  selectedDataSource: string = 'all';

  // Options (20 each)
  tableOptions = [
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

  viewOptions = [
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

  // Grouped Listbox options
  groupedOptions: Array<{ label: string; items: { label: string; value: string }[] }> = [];

  // Single selection from grouped list
  selectedItem?: string;

  constructor(private productService: ProductService) {}

  ngOnInit() {
    this.productService.getProducts().then(d => (this.products = d));

    // Build grouped options for the listbox
    this.groupedOptions = [
      { label: 'Tabellen', items: this.tableOptions },
      { label: 'Sichten', items: this.viewOptions }
    ];
  }

  rowTrackBy(i: number, p: any) {
    return p.id ?? p.code ?? i;
  }
}
