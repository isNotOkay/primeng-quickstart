export interface PagedResultApiModel<T> {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: T[];
}
