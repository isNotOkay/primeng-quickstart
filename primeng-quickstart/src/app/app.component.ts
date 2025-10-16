// file: src/app/app.component.ts
import { Component, OnInit } from '@angular/core';
import { TableModule } from 'primeng/table';
import { SplitterModule } from 'primeng/splitter';
import { DecimalPipe } from '@angular/common';
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
    FormsModule,
    SelectModule,
    Toolbar,
    ButtonDirective
  ],
  templateUrl: './app.component.html'
})
export class AppComponent implements OnInit {
  products: any[] = [];

  // --- Added for Select ---
  dataSources = [
    { label: 'SQLite', value: 'sqlite' },
    { label: 'Excel', value: 'excel' }
  ];
  selectedDataSource: string = 'all';
  // ------------------------

  constructor(private productService: ProductService) {}

  ngOnInit() {
    this.productService.getProducts().then(d => (this.products = d));
  }

  rowTrackBy(i: number, p: any) {
    return p.id ?? p.code ?? i;
  }
}
