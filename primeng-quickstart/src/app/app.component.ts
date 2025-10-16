import { Component, OnInit } from '@angular/core';
import { TableModule } from 'primeng/table';
import { DecimalPipe } from '@angular/common';
import { ProductService } from './service/productsservice';

export interface Product {
  id?: string;
  code?: string;
  name?: string;
  description?: string;
  price?: number;
  quantity?: number;
  inventoryStatus?: string;
  category?: string;
  image?: string;
  rating?: number;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [TableModule, DecimalPipe],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  products: Product[] = [];
  rowsPerPageOptions = [5, 10, 20, 50];

  constructor(private productService: ProductService) {}

  ngOnInit() {
    // use full dataset so pagination makes sense
    this.productService.getProducts().then(data => (this.products = data));
  }

  trackById(index: number, item: Product) {
    return item.id ?? index;
  }
}
