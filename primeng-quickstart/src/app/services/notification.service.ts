import { inject, Injectable } from '@angular/core';
import { MessageService } from 'primeng/api';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly messages = inject(MessageService);
  private readonly duration = 3000;

  info(detail: string): void {
    this.messages.add({ severity: 'info', summary: 'Info', detail, life: this.duration });
  }

  success(detail: string): void {
    this.messages.add({ severity: 'success', summary: 'Erfolg', detail, life: this.duration });
  }

  warn(detail: string): void {
    this.messages.add({ severity: 'warn', summary: 'Hinweis', detail, life: this.duration });
  }

  error(detail: string): void {
    this.messages.add({ severity: 'error', summary: 'Fehler', detail, life: this.duration });
  }

  clear(): void {
    this.messages.clear();
  }
}
