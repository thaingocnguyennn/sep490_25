import api from '../axios';
import type { ApiResponse } from '../../types';

export interface Department {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export const departmentsApi = {
  getAll: () =>
    api.get<ApiResponse<Department[]>>('/departments'),
};
