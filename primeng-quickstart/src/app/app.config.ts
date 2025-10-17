import {ApplicationConfig, provideZoneChangeDetection} from '@angular/core';
import {providePrimeNG} from 'primeng/config';
import {provideAnimationsAsync} from '@angular/platform-browser/animations/async';
import Aura from '@primeuix/themes/aura';
import {provideHttpClient} from '@angular/common/http';
import {MessageService} from 'primeng/api';
import {definePreset} from '@primeuix/themes';

export const MyPreset = definePreset(Aura, {
  components: {
    toast: {
      css: `
        .p-toast { --p-toast-width: 40vw; }
      `
    }
  }
});

export const appConfig: ApplicationConfig = {
  providers: [
    provideAnimationsAsync(),
    providePrimeNG({
      theme: {
        preset: MyPreset,
        options: {darkModeSelector: '.p-dark'},
      },
    }),
    provideZoneChangeDetection({eventCoalescing: true}),
    provideHttpClient(),
    MessageService
  ],
};
