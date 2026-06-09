import { useState, useCallback } from 'react';
import { usersApi } from '../../api';
import type { User, PaginationParams, UserStatus } from '../../types';

interface UseUsersOptions {
  pageSize?: number;
}

interface UseUsersResult {
  users: User[];
  total: number;
  page: number;
  limit: number;
  loading: boolean;
  error: string;
  fetch: (params?: { search?: string; status?: UserStatus | ''; role?: string }) => void;
  setPage: (page: number) => void;
}

export function useUsers(options: UseUsersOptions = {}): UseUsersResult {
  const { pageSize = 10 } = options;
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPageState] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<UserStatus | ''>('');
  const [roleFilter, setRoleFilter] = useState('');

  const fetch = useCallback(
    (params?: { search?: string; status?: UserStatus | ''; role?: string }) => {
      const s = params?.search ?? search;
      const st = params?.status ?? statusFilter;
      const r = params?.role ?? roleFilter;
      setSearch(s);
      setStatusFilter(st);
      setRoleFilter(r);
      setPageState(1);
      setLoading(true);
      setError('');

      usersApi
        .getAll({ page: 1, limit: pageSize, search: s, status: st || undefined, role: r || undefined })
        .then(({ data }) => {
          setUsers(data.data!.items);
          setTotal(data.data!.total);
        })
        .catch(() => {
          setError('Failed to load users');
        })
        .finally(() => setLoading(false));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pageSize]
  );

  const loadPage = useCallback(
    (newPage: number) => {
      setPageState(newPage);
      setLoading(true);
      setError('');

      usersApi
        .getAll({ page: newPage, limit: pageSize, search, status: statusFilter || undefined, role: roleFilter || undefined })
        .then(({ data }) => {
          setUsers(data.data!.items);
          setTotal(data.data!.total);
        })
        .catch(() => {
          setError('Failed to load users');
        })
        .finally(() => setLoading(false));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pageSize, search, statusFilter, roleFilter]
  );

  return {
    users,
    total,
    page,
    limit: pageSize,
    loading,
    error,
    fetch,
    setPage: loadPage,
  };
}
