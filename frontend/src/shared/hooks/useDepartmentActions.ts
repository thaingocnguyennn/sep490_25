import { useState, useCallback } from 'react';
import { departmentsApi } from '../../api';
import type { CreateDepartmentRequest, UpdateDepartmentRequest, Department } from '../../api';

interface UseDepartmentActionsResult {
  createDepartment: (data: CreateDepartmentRequest) => Promise<Department>;
  updateDepartment: (id: number, data: UpdateDepartmentRequest) => Promise<Department>;
  deleteDepartment: (id: number) => Promise<void>;
  actionLoading: boolean;
  actionError: string;
  clearActionError: () => void;
}

export function useDepartmentActions(onSuccess?: () => void): UseDepartmentActionsResult {
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  const clearActionError = useCallback(() => setActionError(''), []);

  const createDepartment = useCallback(
    async (data: CreateDepartmentRequest) => {
      setActionLoading(true);
      setActionError('');
      try {
        const { data: response } = await departmentsApi.create(data);
        if (onSuccess) onSuccess();
        if (!response.data) {
          throw new Error('Failed to create department');
        }
        return response.data;
      } catch (err: unknown) {
        const e = err as { response?: { data?: { message?: string } }; message?: string };
        const msg = e.response?.data?.message || e.message || 'Failed to create department';
        setActionError(msg);
        throw err;
      } finally {
        setActionLoading(false);
      }
    },
    [onSuccess]
  );

  const updateDepartment = useCallback(
    async (id: number, data: UpdateDepartmentRequest) => {
      setActionLoading(true);
      setActionError('');
      try {
        const { data: response } = await departmentsApi.update(id, data);
        if (onSuccess) onSuccess();
        if (!response.data) {
          throw new Error('Failed to update department');
        }
        return response.data;
      } catch (err: unknown) {
        const e = err as { response?: { data?: { message?: string } }; message?: string };
        const msg = e.response?.data?.message || e.message || 'Failed to update department';
        setActionError(msg);
        throw err;
      } finally {
        setActionLoading(false);
      }
    },
    [onSuccess]
  );

  const deleteDepartment = useCallback(
    async (id: number) => {
      setActionLoading(true);
      setActionError('');
      try {
        await departmentsApi.delete(id);
        if (onSuccess) onSuccess();
      } catch (err: unknown) {
        const e = err as { response?: { data?: { message?: string } }; message?: string };
        const msg = e.response?.data?.message || e.message || 'Failed to delete department';
        setActionError(msg);
        throw err;
      } finally {
        setActionLoading(false);
      }
    },
    [onSuccess]
  );

  return {
    createDepartment,
    updateDepartment,
    deleteDepartment,
    actionLoading,
    actionError,
    clearActionError,
  };
}
