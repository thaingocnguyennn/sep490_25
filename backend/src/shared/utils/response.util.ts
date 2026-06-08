export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  errors?: unknown;
}

export function successResponse<T>(
  data: T,
  message = 'Success'
): ApiResponse<T> {
  return {
    success: true,
    message,
    data,
  };
}

export function errorResponse(
  message: string,
  errors?: unknown
): ApiResponse {
  return {
    success: false,
    message,
    errors,
  };
}

export function paginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
  message = 'Success'
): ApiResponse<{ items: T[]; total: number; page: number; limit: number; totalPages: number }> {
  return {
    success: true,
    message,
    data: {
      items: data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}
