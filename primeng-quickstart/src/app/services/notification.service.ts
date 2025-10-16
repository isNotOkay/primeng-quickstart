import {inject, Injectable} from '@angular/core';
import {MatSnackBar} from '@angular/material/snack-bar';

@Injectable({providedIn: 'root'})
export class NotificationService {
  private snackBar = inject(MatSnackBar);

  info(message: string): void {
    this.show(message);
  }

  error(message: string): void {
    this.show(message);
  }

  private show(message: string, duration = 6000): void {
    this.snackBar.open(message, undefined, {duration, verticalPosition: 'bottom', horizontalPosition: 'center'});
  }
}
