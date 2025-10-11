interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  next: boolean;
  prev: boolean;
}

export class ApiPaginatedResponse<T> {
  success: boolean;
  message: string;
  data: T[];
  pagination: PaginationMeta;

  constructor({
    data,
    message = "Exito",
    pagination,
  }: {
    data: T[];
    message?: string;
    pagination: PaginationMeta;
  }) {
    this.success = true;
    this.message = message;
    this.data = data;
    this.pagination = pagination;
  }

  static success<T>({
    data,
    pagination,
    message,
  }: {
    data: T[];
    pagination: PaginationMeta;
    message?: string;
  }) {
    return new ApiPaginatedResponse<T>({ data, pagination, message });
  }
}

