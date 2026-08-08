import { useState, useCallback } from 'react';
import { departmentsApi } from '../../api';
import type {
  CreateDepartmentRequest,
  UpdateDepartmentRequest,
  Department,
  AddMembersResult,
} from '../../api';

interface UseDepartmentActionsResult {
  createDepartment: (data: CreateDepartmentRequest) => Promise<Department>;
  updateDepartment: (id: number, data: UpdateDepartmentRequest) => Promise<Department>;
  deleteDepartment: (id: number) => Promise<void>;
  addMembers: (departmentId: number, userIds: number[]) => Promise<AddMembersResult>;
  removeMember: (departmentId: number, userId: number) => Promise<void>;
  actionLoading: boolean;
  actionError: string;
  clearActionError: () => void;
}

export function useDepartmentActions(onSuccess?: () => void): UseDepartmentActionsResult {
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  const clearActionError = useCallback(() => setActionError(''), []);

  const handleError = (err: unknown, fallback: string): string => {
    const e = err as { response?: { data?: { message?: string } }; message?: string };
    return e.response?.data?.message || e.message || fallback;
  };

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
        setActionError(handleError(err, 'Failed to create department'));
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
        setActionError(handleError(err, 'Failed to update department'));
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
        setActionError(handleError(err, 'Failed to delete department'));
        throw err;
      } finally {
        setActionLoading(false);
      }
    },
    [onSuccess]
  );

  const addMembers = useCallback(
    async (departmentId: number, userIds: number[]) => {
      setActionLoading(true);
      setActionError('');
      try {
        const { data: response } = await departmentsApi.addMembers(departmentId, {
          userIds,
        });
        if (onSuccess) onSuccess();
        if (!response.data) {
          throw new Error('Failed to add members');
        }
        return response.data;
      } catch (err: unknown) {
        setActionError(handleError(err, 'Failed to add members'));
        throw err;
      } finally {
        setActionLoading(false);
      }
    },
    [onSuccess]
  );

  const removeMember = useCallback(
    async (departmentId: number, userId: number) => {
      setActionLoading(true);
      setActionError('');
      try {
        await departmentsApi.removeMember(departmentId, userId);
        if (onSuccess) onSuccess();
      } catch (err: unknown) {
        setActionError(handleError(err, 'Failed to remove member'));
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
    addMembers,
    removeMember,
    actionLoading,
    actionError,
    clearActionError,
  };
}
