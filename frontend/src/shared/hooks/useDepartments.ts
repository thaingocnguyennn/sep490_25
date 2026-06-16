import { useState, useEffect, useCallback } from 'react';
import { departmentsApi } from '../../api';
import type { Department } from '../../api';

interface UseDepartmentsOptions {
  autoFetch?: boolean;
}

interface UseDepartmentsResult {
  departments: Department[];
  loading: boolean;
  error: string;
  refetch: () => void;
  fetchById: (id: number) => Promise<Department>;
}

export function useDepartments(options: UseDepartmentsOptions = {}): UseDepartmentsResult {
  const { autoFetch = true } = options;
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetch = useCallback(() => {
    setLoading(true);
    setError('');
    departmentsApi
      .getAll()
      .then(({ data }) => setDepartments(data.data ?? []))
      .catch(() => setError('Failed to load departments'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (autoFetch) fetch();
  }, [autoFetch, fetch]);

  const fetchById = useCallback(async (id: number) => {
    const { data } = await departmentsApi.getById(id);
    if (!data.data) {
      throw new Error('Department not found');
    }
    return data.data;
  }, []);

  return { departments, loading, error, refetch: fetch, fetchById };
}
