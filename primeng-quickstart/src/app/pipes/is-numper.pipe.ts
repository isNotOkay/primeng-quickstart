import { Pipe, PipeTransform } from '@angular/core';
import { isNumber } from 'underscore';

@Pipe({
  name: 'isNumber',
  standalone: true,
  pure: true,
})
export class IsNumberPipe implements PipeTransform {
  transform(value: unknown): boolean {
    return isNumber(value);
  }
}
