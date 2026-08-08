import { useState, useCallback } from 'react';
import { usersApi } from '../../api';
import type { User, UserStatus } from '../../types';

interface UseUsersOptions {
  pageSize?: number;
}

interface FetchParams {
  search?: string;
  status?: UserStatus | '';
  role?: string;
  page?: number;
}

interface UseUsersResult {
  users: User[];
  total: number;
  page: number;
  limit: number;
  loading: boolean;
  error: string;
  fetch: (params?: FetchParams) => Promise<void>;
  setPage: (page: number) => Promise<void>;
}

export function useUsers(options: UseUsersOptions = {}): UseUsersResult {
  const { pageSize = 10 } = options;
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPageState] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetch = useCallback(
    async (params: FetchParams = {}) => {
      const nextPage = params.page ?? 1;
      setPageState(nextPage);
      setLoading(true);
      setError('');

      try {
        const { data } = await usersApi.getAll({
          page: nextPage,
          limit: pageSize,
          search: params.search,
          status: params.status || undefined,
          role: params.role || undefined,
        });
        setUsers(data.data!.items);
        setTotal(data.data!.total);
      } catch (err) {
        setError('Không thể tải danh sách người dùng');
      } finally {
        setLoading(false);
      }
    },
    [pageSize]
  );

  const setPage = useCallback(
    (newPage: number) => fetch({ page: newPage }),
    [fetch]
  );

  return {
    users,
    total,
    page,
    limit: pageSize,
    loading,
    error,
    fetch,
    setPage,
  };
}