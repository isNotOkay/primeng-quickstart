import { effect, Injectable, signal, WritableSignal } from '@angular/core';
import { Subject } from 'rxjs';
import { AppStateModel } from '../models/app-state.model';

@Injectable({
  providedIn: 'root',
})
export class LayoutService {
  _appState: AppStateModel = {
    preset: 'Aura',
    primary: 'emerald',
    surface: null,
    darkMode: false,
  };

  appState = signal<AppStateModel>(this._appState);

  transitionComplete: WritableSignal<boolean> = signal<boolean>(false);

  private initialized = false;

  private appStateUpdate = new Subject<AppStateModel>();

  appStateUpdate$ = this.appStateUpdate.asObservable();

  constructor() {
    effect(() => {
      const appState = this.appState();
      if (appState) {
        this.onAppStateUpdate();
      }
    });

    effect(() => {
      const state = this.appState();

      if (!this.initialized || !state) {
        this.initialized = true;
        return;
      }

      this.handleDarkModeTransition(state);
    });
  }

  private handleDarkModeTransition(config: AppStateModel): void {
    if ((document as any).startViewTransition) {
      this.startViewTransition(config);
    } else {
      this.toggleDarkMode(config);
      this.onTransitionEnd();
    }
  }

  private startViewTransition(config: AppStateModel): void {
    const transition = (document as any).startViewTransition(() => {
      this.toggleDarkMode(config);
    });

    transition.ready
      .then(() => {
        this.onTransitionEnd();
      })
      .catch(() => {});
  }

  toggleDarkMode(appState?: AppStateModel): void {
    const _appState = appState || this.appState();
    if (_appState.darkMode) {
      document.documentElement.classList.add('p-dark');
    } else {
      document.documentElement.classList.remove('p-dark');
    }
  }

  private onTransitionEnd() {
    this.transitionComplete.set(true);
    setTimeout(() => {
      this.transitionComplete.set(false);
    });
  }

  onAppStateUpdate() {
    this._appState = { ...this.appState() };
    this.appStateUpdate.next(this.appState());
    this.toggleDarkMode();
  }
}
