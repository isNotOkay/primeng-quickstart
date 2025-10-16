import { Component, OnInit } from '@angular/core';
import { TableModule } from 'primeng/table';
import { SplitterModule } from 'primeng/splitter';
import { DecimalPipe, NgFor } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { ProductService } from './service/productsservice';
import { Toolbar } from 'primeng/toolbar';
import { ButtonDirective } from 'primeng/button';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    TableModule,
    SplitterModule,
    DecimalPipe,
    NgFor,
    FormsModule,
    SelectModule,
    Toolbar,
    ButtonDirective
  ],
  templateUrl: './app.component.html'
})
export class AppComponent implements OnInit {
  products: any[] = [];

  dataSources = [
    { label: 'Alle', value: 'all' },
    { label: 'Lokal', value: 'local' },
    { label: 'Remote', value: 'remote' }
  ];
  selectedDataSource: string = 'all';

  // NEW: lists for the left panel
  tables: string[] = [
    'Products','Orders','Customers','Suppliers','Shipments',
    'Invoices','Payments','Employees','Departments','Categories',
    'Inventory','PurchaseOrders','Sales','SalesItems','Returns',
    'ReturnItems','Regions','Countries','Cities','Warehouses'
  ];

  views: string[] = [
    'Top Sellers','Low Stock','Recent Orders','Pending Shipments','High Value Customers',
    'Monthly Revenue','Sales by Category','Orders by Region','Inventory Aging','Customer Churn',
    'Supplier Performance','On-Time Delivery','Profit Margin by Product','Returns Rate','Daily Sales Trend',
    'Backordered Items','New Customers','Active Promotions','Overdue Invoices','Forecasted Demand'
  ];

  constructor(private productService: ProductService) {}
  ngOnInit() { this.productService.getProducts().then(d => (this.products = d)); }

  rowTrackBy(i: number, p: any) { return p.id ?? p.code ?? i; }
}
