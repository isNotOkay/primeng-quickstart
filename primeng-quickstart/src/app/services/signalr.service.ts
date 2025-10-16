import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { Observable, Subject } from 'rxjs';
import { RelationType } from '../enums/relation-type.enum';

export interface CreateOrUpdateRelationEvent {
  relationType: RelationType;
  name: string;
  created: boolean; // NEW
}

export interface DeleteRelationEvent {
  relationType: RelationType;
  name: string;
}

@Injectable({ providedIn: 'root' })
export class SignalRService {
  private hub?: signalR.HubConnection;

  private createOrUpdateRelationSubject = new Subject<CreateOrUpdateRelationEvent>();
  private deleteRelationSubject = new Subject<DeleteRelationEvent>();

  /** Emits when the backend confirms a created/updated table/view */
  readonly onCreateOrUpdateRelation$: Observable<CreateOrUpdateRelationEvent> =
    this.createOrUpdateRelationSubject.asObservable();

  /** Emits when the backend confirms a deleted table/view */
  readonly onDeleteRelation$: Observable<DeleteRelationEvent> =
    this.deleteRelationSubject.asObservable();

  start(): void {
    if (this.hub?.state === signalR.HubConnectionState.Connected) return;

    this.hub = new signalR.HubConnectionBuilder()
      .withUrl('/hubs/notifications')
      .withAutomaticReconnect()
      .build();

    // Canonical event (create or update)
    this.hub.on('CreateOrUpdateRelation', (payload: any) => {
      const relationType = (payload?.relationType ?? payload?.type ?? '')
        .toString()
        .toLowerCase() as RelationType;
      const name = (payload?.name ?? '').toString();
      const created = !!payload?.created; // NEW

      if ((relationType === 'table' || relationType === 'view') && name) {
        this.createOrUpdateRelationSubject.next({ relationType, name, created });
      }
    });

    // Delete event
    this.hub.on('DeleteRelation', (payload: any) => {
      const relationType = (payload?.relationType ?? payload?.type ?? '')
        .toString()
        .toLowerCase() as RelationType;
      const name = (payload?.name ?? '').toString();

      if ((relationType === 'table' || relationType === 'view') && name) {
        this.deleteRelationSubject.next({ relationType, name });
      }
    });

    this.hub.start().catch(err => console.error('SignalR start error', err));
  }

  /** Optional helpers */
  isConnected(): boolean {
    return this.hub?.state === signalR.HubConnectionState.Connected;
  }

  stop(): Promise<void> {
    return this.hub?.stop() ?? Promise.resolve();
  }
}
