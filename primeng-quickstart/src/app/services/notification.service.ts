import { Injectable, inject } from '@angular/core';
import { MessageService } from 'primeng/api';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly messages = inject(MessageService);

  info(detail: string, life = 6000): void {
    this.messages.add({ severity: 'info', summary: 'Info', detail, life });
  }

  success(detail: string, life = 5000): void {
    this.messages.add({ severity: 'success', summary: 'Erfolg', detail, life });
  }

  warn(detail: string, life = 6000): void {
    this.messages.add({ severity: 'warn', summary: 'Hinweis', detail, life });
  }

  error(detail: string, life = 7000): void {
    this.messages.add({ severity: 'error', summary: 'Fehler', detail, life });
  }

  clear(): void {
    this.messages.clear();
  }
}
