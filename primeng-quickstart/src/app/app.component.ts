import {Component, OnInit} from '@angular/core';
import {TableModule} from 'primeng/table';
import {SplitterModule} from 'primeng/splitter';
import {DecimalPipe} from '@angular/common';
import {ProductService} from './service/productsservice';
import {Toolbar} from 'primeng/toolbar';
import {ButtonDirective} from 'primeng/button';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [TableModule, SplitterModule, DecimalPipe, Toolbar, ButtonDirective],
  templateUrl: './app.component.html'
})
export class AppComponent implements OnInit {
  products: any[] = [];

  constructor(private productService: ProductService) {
  }

  ngOnInit() {
    this.productService.getProducts().then(d => this.products = d);
  }

  rowTrackBy(i: number, p: any) {
    return p.id ?? p.code ?? i;
  }
}
