// file: src/app/services/signalr.service.ts
import {Injectable} from '@angular/core';
import * as signalR from '@microsoft/signalr';
import {Observable, Subject} from 'rxjs';
import {RelationType} from '../enums/relation-type.enum';

export interface CreateOrUpdateRelationEvent {
  relationType: RelationType;
  name: string;
  created: boolean;
}

export interface DeleteRelationEvent {
  relationType: RelationType;
  name: string;
}

@Injectable({providedIn: 'root'})
export class SignalRService {
  private hub?: signalR.HubConnection;
  private handlersBound = false;
  private startPromise?: Promise<void>;

  // Domain events
  private createOrUpdateRelationSubject = new Subject<CreateOrUpdateRelationEvent>();
  private deleteRelationSubject = new Subject<DeleteRelationEvent>();

  // Connection lifecycle events
  private connectionLostSubject = new Subject<void>();     // initial start failure or a connected hub finally closes
  private reconnectingSubject = new Subject<void>();       // when SignalR enters reconnecting state
  private reconnectedSubject = new Subject<void>();        // when SignalR has reconnected

  /** Emits when the backend confirms a created/updated table/view */
  readonly onCreateOrUpdateRelation$: Observable<CreateOrUpdateRelationEvent> =
    this.createOrUpdateRelationSubject.asObservable();

  /** Emits when the backend confirms a deleted table/view */
  readonly onDeleteRelation$: Observable<DeleteRelationEvent> =
    this.deleteRelationSubject.asObservable();

  /** Emits when the connection is gone and the UI should prompt to reload */
  readonly onConnectionLost$: Observable<void> = this.connectionLostSubject.asObservable();

  /** Emits as soon as SignalR enters reconnecting */
  readonly onReconnecting$: Observable<void> = this.reconnectingSubject.asObservable();

  /** Emits when SignalR successfully reconnected */
  readonly onReconnected$: Observable<void> = this.reconnectedSubject.asObservable();

  /** Build hub (once) and bind all handlers (once) */
  private ensureHub(): void {
    if (!this.hub) {
      this.hub = new signalR.HubConnectionBuilder()
        .withUrl('/hubs/notifications')
        // Shorter retry sequence than default so final close/failed happens sooner.
        // Adjust as desired (e.g., [0, 2000, 5000] ~ gives up after ~7s).
        .withAutomaticReconnect([0, 2000, 5000])
        .build();
    }

    if (!this.handlersBound && this.hub) {
      this.handlersBound = true;

      // Canonical event (create or update)
      this.hub.on('CreateOrUpdateRelation', (payload: any) => {
        const relationType = (payload?.relationType ?? payload?.type ?? '')
          .toString()
          .toLowerCase() as RelationType;
        const name = (payload?.name ?? '').toString();
        const created = !!payload?.created;

        if ((relationType === 'table' || relationType === 'view') && name) {
          this.createOrUpdateRelationSubject.next({relationType, name, created});
        }
      });

      // Delete event
      this.hub.on('DeleteRelation', (payload: any) => {
        const relationType = (payload?.relationType ?? payload?.type ?? '')
          .toString()
          .toLowerCase() as RelationType;
        const name = (payload?.name ?? '').toString();

        if ((relationType === 'table' || relationType === 'view') && name) {
          this.deleteRelationSubject.next({relationType, name});
        }
      });

      // Lifecycle hooks
      this.hub.onreconnecting(() => this.reconnectingSubject.next());
      this.hub.onreconnected(() => this.reconnectedSubject.next());

      // Fires after a previously-connected hub is ultimately closed
      this.hub.onclose(() => this.connectionLostSubject.next());
    }
  }

  /**
   * Start the hub and return a promise that resolves when connected.
   * If negotiate/start fails, the promise rejects and onConnectionLost$ is emitted.
   */
  startAndWait(): Promise<void> {
    if (this.hub?.state === signalR.HubConnectionState.Connected) {
      return Promise.resolve();
    }

    // If a previous start is in-flight, reuse that promise.
    if (this.startPromise) return this.startPromise;

    this.ensureHub();

    this.startPromise = this.hub!
      .start()
      .catch((err) => {
        console.error('SignalR start/negotiate failed', err);
        this.connectionLostSubject.next(); // notify UI immediately
        throw err;
      })
      .finally(() => {
        // Clear latch so a future retry can be attempted if desired
        this.startPromise = undefined;
      });

    return this.startPromise;
  }

  /** True only when the hub is currently connected */
  isConnected(): boolean {
    return this.hub?.state === signalR.HubConnectionState.Connected;
  }

  stop(): Promise<void> {
    this.startPromise = undefined;
    return this.hub?.stop() ?? Promise.resolve();
  }
}
