import { useState, useEffect, useCallback } from 'react';
import { departmentsApi } from '../../api';
import type { Department, DepartmentMember } from '../../api';

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

interface UseDepartmentMembersResult {
  members: DepartmentMember[];
  loading: boolean;
  error: string;
  refetch: () => void;
}

export function useDepartmentMembers(
  departmentId: number | null,
  autoFetch = true
): UseDepartmentMembersResult {
  const [members, setMembers] = useState<DepartmentMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refetch = useCallback(() => {
    if (departmentId === null) {
      setMembers([]);
      return;
    }
    setLoading(true);
    setError('');
    departmentsApi
      .getMembers(departmentId)
      .then(({ data }) => setMembers(data.data ?? []))
      .catch(() => setError('Failed to load department members'))
      .finally(() => setLoading(false));
  }, [departmentId]);

  useEffect(() => {
    if (autoFetch) refetch();
  }, [autoFetch, refetch]);

  return { members, loading, error, refetch };
}
