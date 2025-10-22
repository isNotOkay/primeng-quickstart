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
    },
    datatable: {
      bodyCell: {
        sm: { padding: '0.25rem 0.5rem' }
      }
    },
  },
  semantic: {
    primary: {
      50: '{blue.50}',
      100: '{blue.100}',
      200: '{blue.200}',
      300: '{blue.300}',
      400: '{blue.400}',
      500: '{blue.500}',
      600: '{blue.600}',
      700: '{blue.700}',
      800: '{blue.800}',
      900: '{blue.900}',
      950: '{blue.950}'
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
