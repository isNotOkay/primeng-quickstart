// file: src/app/tests/services/signalr.service.spec.ts
import { TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import * as signalR from '@microsoft/signalr';
import { RelationType } from '../../enums/relation-type.enum';
import { CreateOrUpdateRelationEventModel } from '../../models/create-or-update-relation-event.model';
import { SignalRService } from '../../services/signalr.service';

describe('SignalRService', () => {
  let service: SignalRService;
  let consoleErrorSpy: jasmine.Spy;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SignalRService],
    });
    service = TestBed.inject(SignalRService);

    // Silence expected error logs from start failures in tests
    consoleErrorSpy = spyOn(console, 'error').and.stub();
  });

  afterEach(async () => {
    await service.stop();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('observables', () => {
    it('should expose onCreateOrUpdateRelation$ observable', (done) => {
      expect(service.onCreateOrUpdateRelation$).toBeDefined();
      const subscription = service.onCreateOrUpdateRelation$.subscribe();
      expect(subscription).toBeDefined();
      subscription.unsubscribe();
      done();
    });

    it('should expose onDeleteRelation$ observable', (done) => {
      expect(service.onDeleteRelation$).toBeDefined();
      const subscription = service.onDeleteRelation$.subscribe();
      expect(subscription).toBeDefined();
      subscription.unsubscribe();
      done();
    });

    it('should expose onConnectionLost$ observable', (done) => {
      expect(service.onConnectionLost$).toBeDefined();
      const subscription = service.onConnectionLost$.subscribe();
      expect(subscription).toBeDefined();
      subscription.unsubscribe();
      done();
    });

    it('should expose onReconnecting$ observable', (done) => {
      expect(service.onReconnecting$).toBeDefined();
      const subscription = service.onReconnecting$.subscribe();
      expect(subscription).toBeDefined();
      subscription.unsubscribe();
      done();
    });

    it('should expose onReconnected$ observable', (done) => {
      expect(service.onReconnected$).toBeDefined();
      const subscription = service.onReconnected$.subscribe();
      expect(subscription).toBeDefined();
      subscription.unsubscribe();
      done();
    });
  });

  describe('isConnected', () => {
    it('should return false when not connected', () => {
      expect(service.isConnected()).toBe(false);
    });

    it('should return false when hub is not initialized', () => {
      expect(service.isConnected()).toBe(false);
    });
  });

  describe('stop', () => {
    it('should return resolved promise when hub is not initialized', async () => {
      await expectAsync(service.stop()).toBeResolved();
    });

    it('should call hub.stop when hub exists', async () => {
      const mockHub = {
        stop: jasmine.createSpy('stop').and.returnValue(Promise.resolve()),
        state: signalR.HubConnectionState.Disconnected,
      };

      (service as any).hub = mockHub;

      await service.stop();
      expect(mockHub.stop).toHaveBeenCalled();
    });
  });

  describe('startAndWait', () => {
    it('should return resolved promise when already connected', async () => {
      const mockHub = {
        state: signalR.HubConnectionState.Connected,
        stop: jasmine.createSpy('stop').and.returnValue(Promise.resolve()),
      };

      (service as any).hub = mockHub;

      await expectAsync(service.startAndWait()).toBeResolved();
    });

    it('should emit onConnectionLost$ when start fails', fakeAsync(() => {
      const mockHub = {
        state: signalR.HubConnectionState.Disconnected,
        start: jasmine.createSpy('start').and.returnValue(Promise.reject(new Error('Connection failed'))),
        on: jasmine.createSpy('on'),
        onreconnecting: jasmine.createSpy('onreconnecting'),
        onreconnected: jasmine.createSpy('onreconnected'),
        onclose: jasmine.createSpy('onclose'),
        stop: jasmine.createSpy('stop').and.returnValue(Promise.resolve()),
      };

      (service as any).hub = mockHub;
      (service as any).handlersBound = true;

      const lostSpy = jasmine.createSpy('lost');
      service.onConnectionLost$.subscribe(lostSpy);

      service.startAndWait().catch(() => {});
      flushMicrotasks();

      expect(mockHub.start).toHaveBeenCalled();
      expect(lostSpy).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith('SignalR start/negotiate failed', jasmine.any(Error));
    }));

    it('should handle multiple concurrent start calls', fakeAsync(() => {
      const mockHub = {
        state: signalR.HubConnectionState.Disconnected,
        start: jasmine.createSpy('start').and.returnValue(Promise.reject(new Error('Connection failed'))),
        on: jasmine.createSpy('on'),
        onreconnecting: jasmine.createSpy('onreconnecting'),
        onreconnected: jasmine.createSpy('onreconnected'),
        onclose: jasmine.createSpy('onclose'),
        stop: jasmine.createSpy('stop').and.returnValue(Promise.resolve()),
      };

      (service as any).hub = mockHub;
      (service as any).handlersBound = true;

      const p1 = service.startAndWait().catch(() => {});
      const p2 = service.startAndWait().catch(() => {});
      const p3 = service.startAndWait().catch(() => {});
      void p1; void p2; void p3;

      flushMicrotasks();

      // At least one start attempt should be made; service coalesces via startPromise
      expect(mockHub.start).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();
    }));
  });

  describe('event handling', () => {
    it('should emit CreateOrUpdateRelation event with correct data for table', (done) => {
      const mockEvent: CreateOrUpdateRelationEventModel = {
        relationType: RelationType.Table,
        name: 'Users',
        created: true,
      };

      service.onCreateOrUpdateRelation$.subscribe((event) => {
        expect(event.relationType).toBe(RelationType.Table);
        expect(event.name).toBe('Users');
        expect(event.created).toBe(true);
        done();
      });

      (service as any).createOrUpdateRelationSubject.next(mockEvent);
    });

    it('should emit CreateOrUpdateRelation event with correct data for view', (done) => {
      const mockEvent: CreateOrUpdateRelationEventModel = {
        relationType: RelationType.View,
        name: 'UserView',
        created: false,
      };

      service.onCreateOrUpdateRelation$.subscribe((event) => {
        expect(event.relationType).toBe(RelationType.View);
        expect(event.name).toBe('UserView');
        expect(event.created).toBe(false);
        done();
      });

      (service as any).createOrUpdateRelationSubject.next(mockEvent);
    });

    it('should emit DeleteRelation event with correct data', (done) => {
      const mockEvent = {
        relationType: RelationType.Table,
        name: 'Users',
        created: true,
      };

      service.onDeleteRelation$.subscribe((event) => {
        expect(event.relationType).toBe(RelationType.Table);
        expect(event.name).toBe('Users');
        done();
      });

      (service as any).deleteRelationSubject.next(mockEvent);
    });

    it('should emit connectionLost event', (done) => {
      service.onConnectionLost$.subscribe(() => {
        expect(true).toBe(true);
        done();
      });

      (service as any).connectionLostSubject.next();
    });

    it('should emit reconnecting event', (done) => {
      service.onReconnecting$.subscribe(() => {
        expect(true).toBe(true);
        done();
      });

      (service as any).reconnectingSubject.next();
    });

    it('should emit reconnected event', (done) => {
      service.onReconnected$.subscribe(() => {
        expect(true).toBe(true);
        done();
      });

      (service as any).reconnectedSubject.next();
    });
  });

  describe('multiple subscribers', () => {
    it('should handle multiple subscribers to onCreateOrUpdateRelation$', (done) => {
      let subscriber1Called = false;
      let subscriber2Called = false;

      const mockEvent: CreateOrUpdateRelationEventModel = {
        relationType: RelationType.Table,
        name: 'Test',
        created: true,
      };

      service.onCreateOrUpdateRelation$.subscribe(() => {
        subscriber1Called = true;
      });

      service.onCreateOrUpdateRelation$.subscribe(() => {
        subscriber2Called = true;
      });

      (service as any).createOrUpdateRelationSubject.next(mockEvent);

      setTimeout(() => {
        expect(subscriber1Called).toBe(true);
        expect(subscriber2Called).toBe(true);
        done();
      }, 50);
    });

    it('should handle multiple subscribers to onDeleteRelation$', (done) => {
      let subscriber1Called = false;
      let subscriber2Called = false;

      const mockEvent: CreateOrUpdateRelationEventModel = {
        relationType: RelationType.View,
        name: 'Test',
        created: true,
      };

      service.onDeleteRelation$.subscribe(() => {
        subscriber1Called = true;
      });

      service.onDeleteRelation$.subscribe(() => {
        subscriber2Called = true;
      });

      (service as any).deleteRelationSubject.next(mockEvent);

      setTimeout(() => {
        expect(subscriber1Called).toBe(true);
        expect(subscriber2Called).toBe(true);
        done();
      }, 50);
    });
  });
});
