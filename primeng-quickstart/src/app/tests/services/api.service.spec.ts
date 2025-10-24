import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { ApiService } from '../../services/api.service';
import { EngineType } from '../../enums/engine-type.enum';
import { RelationType } from '../../enums/relation-type.enum';
import { PagedResultApiModel } from '../../models/api/paged-result.api-model';
import { RelationApiModel } from '../../models/api/relation.api-model';
import { RowModel } from '../../models/row.model';

describe('ApiService', () => {
  let service: ApiService;
  let httpMock: HttpTestingController;
  const apiPrefix = '/api/web-viewer';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ApiService, provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(ApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getEngine', () => {
    it('should return engine settings', () => {
      const mockResponse = { engine: EngineType.Sqlite };

      service.getEngine().subscribe((response) => {
        expect(response).toEqual(mockResponse);
      });

      const req = httpMock.expectOne(`${apiPrefix}/settings/engine`);
      expect(req.request.method).toBe('GET');
      req.flush(mockResponse);
    });
  });

  describe('setEngine', () => {
    it('should send PUT request with engine type', () => {
      const engine = EngineType.Excel;
      const mockResponse = { engine: EngineType.Excel };

      service.setEngine(engine).subscribe((response) => {
        expect(response).toEqual(mockResponse);
      });

      const req = httpMock.expectOne(`${apiPrefix}/settings/engine`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ engine });
      req.flush(mockResponse);
    });
  });

  describe('loadTables', () => {
    it('should load tables with default parameters', () => {
      const mockResponse: PagedResultApiModel<RelationApiModel> = {
        page: 1,
        pageSize: 50,
        total: 1,
        totalPages: 1,
        items: [],
      };

      service.loadTables().subscribe((response) => {
        expect(response).toEqual(mockResponse);
      });

      const req = httpMock.expectOne(
        (request) => request.url === `${apiPrefix}/tables` && request.params.has('page'),
      );
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('page')).toBe('1');
      expect(req.request.params.get('pageSize')).toBe('50');
      expect(req.request.params.get('sortBy')).toBe('Name');
      expect(req.request.params.get('sortDir')).toBe('asc');
      req.flush(mockResponse);
    });

    it('should load tables with custom parameters', () => {
      const mockResponse: PagedResultApiModel<RelationApiModel> = {
        page: 2,
        pageSize: 20,
        total: 100,
        totalPages: 5,
        items: [],
      };

      service.loadTables(1, 20, 'CreatedAt', 'desc').subscribe((response) => {
        expect(response).toEqual(mockResponse);
      });

      const req = httpMock.expectOne(
        (request) => request.url === `${apiPrefix}/tables` && request.params.get('page') === '2',
      );
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('page')).toBe('2');
      expect(req.request.params.get('pageSize')).toBe('20');
      expect(req.request.params.get('sortBy')).toBe('CreatedAt');
      expect(req.request.params.get('sortDir')).toBe('desc');
      req.flush(mockResponse);
    });

    it('should load tables without sort parameters when sortBy is null', () => {
      const mockResponse: PagedResultApiModel<RelationApiModel> = {
        page: 1,
        pageSize: 50,
        total: 0,
        totalPages: 0,
        items: [],
      };

      service.loadTables(0, 50, null).subscribe((response) => {
        expect(response).toEqual(mockResponse);
      });

      const req = httpMock.expectOne(
        (request) => request.url === `${apiPrefix}/tables` && !request.params.has('sortBy'),
      );
      expect(req.request.method).toBe('GET');
      expect(req.request.params.has('sortBy')).toBe(false);
      expect(req.request.params.has('sortDir')).toBe(false);
      req.flush(mockResponse);
    });
  });

  describe('loadViews', () => {
    it('should load views with default parameters', () => {
      const mockResponse: PagedResultApiModel<RelationApiModel> = {
        page: 1,
        pageSize: 50,
        total: 1,
        totalPages: 1,
        items: [],
      };

      service.loadViews().subscribe((response) => {
        expect(response).toEqual(mockResponse);
      });

      const req = httpMock.expectOne((request) => request.url === `${apiPrefix}/views` && request.params.has('page'));
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('page')).toBe('1');
      expect(req.request.params.get('pageSize')).toBe('50');
      expect(req.request.params.get('sortBy')).toBe('Name');
      expect(req.request.params.get('sortDir')).toBe('asc');
      req.flush(mockResponse);
    });

    it('should load views with custom parameters', () => {
      const mockResponse: PagedResultApiModel<RelationApiModel> = {
        page: 3,
        pageSize: 25,
        total: 75,
        totalPages: 3,
        items: [],
      };

      service.loadViews(2, 25, 'UpdatedAt', 'desc').subscribe((response) => {
        expect(response).toEqual(mockResponse);
      });

      const req = httpMock.expectOne(
        (request) => request.url === `${apiPrefix}/views` && request.params.get('page') === '3',
      );
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('page')).toBe('3');
      expect(req.request.params.get('pageSize')).toBe('25');
      expect(req.request.params.get('sortBy')).toBe('UpdatedAt');
      expect(req.request.params.get('sortDir')).toBe('desc');
      req.flush(mockResponse);
    });
  });

  describe('loadTableData', () => {
    it('should load table data for a table', () => {
      const mockResponse: PagedResultApiModel<RowModel> = {
        page: 1,
        pageSize: 10,
        total: 5,
        totalPages: 1,
        items: [],
      };

      service.loadTableData(RelationType.Table, 'Users', 0, 10).subscribe((response) => {
        expect(response).toEqual(mockResponse);
      });

      const req = httpMock.expectOne(
        (request) => request.url === `${apiPrefix}/tables/Users` && request.params.has('page'),
      );
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('page')).toBe('1');
      expect(req.request.params.get('pageSize')).toBe('10');
      req.flush(mockResponse);
    });

    it('should load table data for a view', () => {
      const mockResponse: PagedResultApiModel<RowModel> = {
        page: 1,
        pageSize: 10,
        total: 3,
        totalPages: 1,
        items: [],
      };

      service.loadTableData(RelationType.View, 'UserView', 0, 10).subscribe((response) => {
        expect(response).toEqual(mockResponse);
      });

      const req = httpMock.expectOne(
        (request) => request.url === `${apiPrefix}/views/UserView` && request.params.has('page'),
      );
      expect(req.request.method).toBe('GET');
      req.flush(mockResponse);
    });

    it('should encode special characters in relation id', () => {
      const mockResponse: PagedResultApiModel<RowModel> = {
        page: 1,
        pageSize: 10,
        total: 0,
        totalPages: 0,
        items: [],
      };

      service.loadTableData(RelationType.Table, 'Table With Spaces', 0, 10).subscribe((response) => {
        expect(response).toEqual(mockResponse);
      });

      const req = httpMock.expectOne(
        (request) => request.url === `${apiPrefix}/tables/Table%20With%20Spaces` && request.params.has('page'),
      );
      expect(req.request.method).toBe('GET');
      req.flush(mockResponse);
    });

    it('should include sort parameters when provided', () => {
      const mockResponse: PagedResultApiModel<RowModel> = {
        page: 1,
        pageSize: 10,
        total: 0,
        totalPages: 0,
        items: [],
      };

      service.loadTableData(RelationType.Table, 'Users', 0, 10, 'Name', 'desc').subscribe((response) => {
        expect(response).toEqual(mockResponse);
      });

      const req = httpMock.expectOne((request) => request.url === `${apiPrefix}/tables/Users`);
      expect(req.request.params.get('sortBy')).toBe('Name');
      expect(req.request.params.get('sortDir')).toBe('desc');
      req.flush(mockResponse);
    });
  });

  describe('deleteRelation', () => {
    it('should delete a table', () => {
      service.deleteRelation(RelationType.Table, 'Users').subscribe();

      const req = httpMock.expectOne(`${apiPrefix}/tables/Users`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });

    it('should delete a view', () => {
      service.deleteRelation(RelationType.View, 'UserView').subscribe();

      const req = httpMock.expectOne(`${apiPrefix}/views/UserView`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });

    it('should encode special characters in relation id', () => {
      service.deleteRelation(RelationType.Table, 'Table With Spaces').subscribe();

      const req = httpMock.expectOne(`${apiPrefix}/tables/Table%20With%20Spaces`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });
  });

  describe('downloadEngineFile', () => {
    it('should download file for Sqlite engine', () => {
      const mockBlob = new Blob(['test'], { type: 'application/octet-stream' });

      service.downloadEngineFile(EngineType.Sqlite).subscribe((response) => {
        expect(response.body).toEqual(mockBlob);
      });

      const req = httpMock.expectOne(
        (request) => request.url === `${apiPrefix}/download` && request.params.get('engine') === 'Sqlite',
      );
      expect(req.request.method).toBe('GET');
      expect(req.request.responseType).toBe('blob');
      req.flush(mockBlob);
    });

    it('should download file for Excel engine', () => {
      const mockBlob = new Blob(['test'], { type: 'application/octet-stream' });

      service.downloadEngineFile(EngineType.Excel).subscribe((response) => {
        expect(response.body).toEqual(mockBlob);
      });

      const req = httpMock.expectOne(
        (request) => request.url === `${apiPrefix}/download` && request.params.get('engine') === 'Excel',
      );
      expect(req.request.method).toBe('GET');
      expect(req.request.responseType).toBe('blob');
      req.flush(mockBlob);
    });
  });
});
