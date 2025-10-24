import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { NotificationService } from '../../services/notification.service';

describe('NotificationService', () => {
  let service: NotificationService;
  let messageService: jasmine.SpyObj<MessageService>;

  beforeEach(() => {
    const messageServiceSpy = jasmine.createSpyObj('MessageService', ['add', 'clear']);

    TestBed.configureTestingModule({
      providers: [NotificationService, { provide: MessageService, useValue: messageServiceSpy }],
    });

    service = TestBed.inject(NotificationService);
    messageService = TestBed.inject(MessageService) as jasmine.SpyObj<MessageService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('info', () => {
    it('should call MessageService.add with info severity', () => {
      const detail = 'This is an info message';
      service.info(detail);

      expect(messageService.add).toHaveBeenCalledWith({
        severity: 'info',
        summary: 'Info',
        detail: detail,
        life: 3000,
      });
    });
  });

  describe('success', () => {
    it('should call MessageService.add with success severity', () => {
      const detail = 'Operation successful';
      service.success(detail);

      expect(messageService.add).toHaveBeenCalledWith({
        severity: 'success',
        summary: 'Erfolg',
        detail: detail,
        life: 3000,
      });
    });
  });

  describe('warn', () => {
    it('should call MessageService.add with warn severity', () => {
      const detail = 'This is a warning';
      service.warn(detail);

      expect(messageService.add).toHaveBeenCalledWith({
        severity: 'warn',
        summary: 'Hinweis',
        detail: detail,
        life: 3000,
      });
    });
  });

  describe('error', () => {
    it('should call MessageService.add with error severity', () => {
      const detail = 'An error occurred';
      service.error(detail);

      expect(messageService.add).toHaveBeenCalledWith({
        severity: 'error',
        summary: 'Fehler',
        detail: detail,
        life: 3000,
      });
    });
  });

  describe('clear', () => {
    it('should call MessageService.clear', () => {
      service.clear();

      expect(messageService.clear).toHaveBeenCalled();
    });
  });
});
