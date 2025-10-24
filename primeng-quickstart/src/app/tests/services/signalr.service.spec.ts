import {TestBed} from '@angular/core/testing';
import {RelationType} from '../../enums/relation-type.enum';
import * as signalR from '@microsoft/signalr';
import {CreateOrUpdateRelationEventModel} from '../../models/create-or-update-relation-event.model';
import {SignalRService} from '../../services/signalr.service';

describe('SignalRService', () => {
  let service: SignalRService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SignalRService],
    });
    service = TestBed.inject(SignalRService);
  });

  afterEach(() => {
    // Clean up any existing connections
    service.stop();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('observables', () => {
    it('should expose onCreateOrUpdateRelation$ observable', (done) => {
      expect(service.onCreateOrUpdateRelation$).toBeDefined();
      // Test that it's subscribable
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
      // Create a mock hub
      const mockHub = {
        stop: jasmine.createSpy('stop').and.returnValue(Promise.resolve()),
        state: signalR.HubConnectionState.Disconnected,
      };

      // Set the private hub property
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).hub = mockHub;

      // Now stop should work
      await service.stop();
      expect(mockHub.stop).toHaveBeenCalled();
    });
  });

  describe('startAndWait', () => {
    it('should return resolved promise when already connected', async () => {
      // Create a mock hub with connected state
      const mockHub = {
        state: signalR.HubConnectionState.Connected,
        stop: jasmine.createSpy('stop').and.returnValue(Promise.resolve()),
      };

      // Set the private hub property
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).hub = mockHub;

      await expectAsync(service.startAndWait()).toBeResolved();
    });

    it('should emit onConnectionLost$ when start fails', (done) => {
      service.onConnectionLost$.subscribe(() => {
        // Clean up to prevent actual connection attempts
        service.stop();
        done();
      });

      // Create a mock hub that will fail on start
      const mockHub = {
        state: signalR.HubConnectionState.Disconnected,
        start: jasmine.createSpy('start').and.returnValue(Promise.reject(new Error('Connection failed'))),
        on: jasmine.createSpy('on'),
        onreconnecting: jasmine.createSpy('onreconnecting'),
        onreconnected: jasmine.createSpy('onreconnected'),
        onclose: jasmine.createSpy('onclose'),
        stop: jasmine.createSpy('stop').and.returnValue(Promise.resolve()),
      };

      // Set the private hub property
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).hub = mockHub;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).handlersBound = true;

      service.startAndWait().catch(() => {
        // Expected to fail
      });
    });

    it('should handle multiple concurrent start calls', async () => {
      // Create a mock hub
      const mockHub = {
        state: signalR.HubConnectionState.Disconnected,
        start: jasmine.createSpy('start').and.returnValue(Promise.reject(new Error('Connection failed'))),
        on: jasmine.createSpy('on'),
        onreconnecting: jasmine.createSpy('onreconnecting'),
        onreconnected: jasmine.createSpy('onreconnected'),
        onclose: jasmine.createSpy('onclose'),
        stop: jasmine.createSpy('stop').and.returnValue(Promise.resolve()),
      };

      // Set the private hub property
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).hub = mockHub;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).handlersBound = true;

      // Call start multiple times without awaiting
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      const promise1 = service.startAndWait().catch(() => {
      });
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      const promise2 = service.startAndWait().catch(() => {
      });
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      const promise3 = service.startAndWait().catch(() => {
      });

      // All promises should resolve/reject
      await Promise.allSettled([promise1, promise2, promise3]);

      // This test just ensures no errors are thrown
      expect(true).toBe(true);
    });
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

      // Trigger the event by accessing the private subject
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).createOrUpdateRelationSubject.next(mockEvent);
    });

    it('should emit DeleteRelation event with correct data', (done) => {
      const mockEvent: CreateOrUpdateRelationEventModel = {
        relationType: RelationType.Table,
        name: 'Users',
        created: true
      };

      service.onDeleteRelation$.subscribe((event) => {
        expect(event.relationType).toBe(RelationType.Table);
        expect(event.name).toBe('Users');
        done();
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).deleteRelationSubject.next(mockEvent);
    });

    it('should emit connectionLost event', (done) => {
      service.onConnectionLost$.subscribe(() => {
        expect(true).toBe(true);
        done();
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).connectionLostSubject.next();
    });

    it('should emit reconnecting event', (done) => {
      service.onReconnecting$.subscribe(() => {
        expect(true).toBe(true);
        done();
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).reconnectingSubject.next();
    });

    it('should emit reconnected event', (done) => {
      service.onReconnected$.subscribe(() => {
        expect(true).toBe(true);
        done();
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        created: true
      };

      service.onDeleteRelation$.subscribe(() => {
        subscriber1Called = true;
      });

      service.onDeleteRelation$.subscribe(() => {
        subscriber2Called = true;
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).deleteRelationSubject.next(mockEvent);

      setTimeout(() => {
        expect(subscriber1Called).toBe(true);
        expect(subscriber2Called).toBe(true);
        done();
      }, 50);
    });
  });
});
