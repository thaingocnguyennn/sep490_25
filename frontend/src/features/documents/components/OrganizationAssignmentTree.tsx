import { useEffect, useMemo, useRef, useState } from 'react';
import {
  departmentsApi,
  type Department,
  type ProcessorType,
} from '../../../api';
import {
  useDepartments,
  type ProcessorOption,
} from '../../../shared/hooks';

interface ProcessorAssignment {
  userId: number;
  processorType: ProcessorType;
}

interface OrganizationAssignmentTreeProps {
  users: ProcessorOption[];
  assignments: ProcessorAssignment[];
  roleLabels: Record<ProcessorType, string>;
  onAssignmentChange: (userId: number, type: ProcessorType) => void;
}

interface DepartmentMembership {
  departmentId: number;
  userId: number;
}

interface OrganizationTreeNode {
  key: string;
  name: string;
  users: ProcessorOption[];
  children: OrganizationTreeNode[];
  isUnassigned?: boolean;
}

const PROCESSOR_TYPES: ProcessorType[] = ['XLC', 'PHXL', 'XDB'];
const MEMBERSHIP_REQUEST_BATCH_SIZE = 8;

function getInitials(fullName: string): string {
  return fullName
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function sortTree(nodes: OrganizationTreeNode[]): OrganizationTreeNode[] {
  return nodes
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
    .map((node) => ({
      ...node,
      users: [...node.users].sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi')),
      children: sortTree(node.children),
    }));
}

function buildOrganizationTree(
  departments: Department[],
  users: ProcessorOption[],
  memberships: DepartmentMembership[]
): OrganizationTreeNode[] {
  const usersById = new Map(users.map((user) => [user.id, user]));
  const nodesById = new Map<number, OrganizationTreeNode>();
  const assignedUserIds = new Set<number>();

  departments.forEach((department) => {
    nodesById.set(department.id, {
      key: `department-${department.id}`,
      name: department.name,
      users: [],
      children: [],
    });
  });

  memberships.forEach(({ departmentId, userId }) => {
    const node = nodesById.get(departmentId);
    const user = usersById.get(userId);
    if (node && user) {
      node.users.push(user);
      assignedUserIds.add(userId);
    }
  });

  const roots: OrganizationTreeNode[] = [];
  departments.forEach((department) => {
    const node = nodesById.get(department.id);
    if (!node) return;

    const parent = department.parentId ? nodesById.get(department.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  });

  const unassignedUsers = users.filter((user) => !assignedUserIds.has(user.id));
  if (unassignedUsers.length > 0) {
    roots.push({
      key: 'department-unassigned',
      name: 'Chưa thuộc phòng ban',
      users: unassignedUsers,
      children: [],
      isUnassigned: true,
    });
  }

  return sortTree(roots);
}

function nodeMatchesSearch(node: OrganizationTreeNode, normalizedQuery: string): boolean {
  return node.name.toLocaleLowerCase('vi').includes(normalizedQuery);
}

function userMatchesSearch(user: ProcessorOption, normalizedQuery: string): boolean {
  return [user.fullName, user.email, ...user.roles]
    .some((value) => value.toLocaleLowerCase('vi').includes(normalizedQuery));
}

function filterTree(
  nodes: OrganizationTreeNode[],
  normalizedQuery: string
): OrganizationTreeNode[] {
  if (!normalizedQuery) return nodes;

  return nodes.flatMap((node) => {
    if (nodeMatchesSearch(node, normalizedQuery)) return [node];

    const matchingUsers = node.users.filter((user) => userMatchesSearch(user, normalizedQuery));
    const matchingChildren = filterTree(node.children, normalizedQuery);
    if (matchingUsers.length === 0 && matchingChildren.length === 0) return [];

    return [{ ...node, users: matchingUsers, children: matchingChildren }];
  });
}

function collectNodeKeys(nodes: OrganizationTreeNode[]): string[] {
  return nodes.flatMap((node) => [node.key, ...collectNodeKeys(node.children)]);
}

interface OrganizationTreeBranchProps {
  node: OrganizationTreeNode;
  expanded: Set<string>;
  searching: boolean;
  assignmentsByUserId: Map<number, ProcessorType>;
  roleLabels: Record<ProcessorType, string>;
  onToggleNode: (key: string) => void;
  onAssignmentChange: (userId: number, type: ProcessorType) => void;
}

function OrganizationTreeBranch({
  node,
  expanded,
  searching,
  assignmentsByUserId,
  roleLabels,
  onToggleNode,
  onAssignmentChange,
}: OrganizationTreeBranchProps) {
  const hasContents = node.users.length > 0 || node.children.length > 0;
  const isExpanded = searching || expanded.has(node.key);

  return (
    <li
      className="organization-tree-node"
      role="treeitem"
      aria-expanded={hasContents ? isExpanded : undefined}
    >
      <div className={`organization-department-row ${node.isUnassigned ? 'unassigned' : ''}`}>
        <button
          type="button"
          className={`organization-tree-toggle ${isExpanded ? 'expanded' : ''}`}
          onClick={() => onToggleNode(node.key)}
          disabled={!hasContents || searching}
          aria-label={`${isExpanded ? 'Thu gọn' : 'Mở rộng'} ${node.name}`}
        />
        <span className="organization-department-icon" aria-hidden="true" />
        <span className="organization-department-name">{node.name}</span>
        <span className="organization-department-count">
          {node.users.length} nhân sự
        </span>
      </div>

      {hasContents && isExpanded && (
        <ul className="organization-tree-group" role="group">
          {node.users.map((user) => {
            const currentType = assignmentsByUserId.get(user.id) ?? null;
            const checkboxId = `${node.key}-processor-${user.id}`;

            return (
              <li
                key={`${node.key}-${user.id}`}
                className={`organization-user-row ${currentType ? 'selected' : ''}`}
                role="treeitem"
                aria-selected={Boolean(currentType)}
              >
                <div className="organization-user-main">
                  <input
                    id={checkboxId}
                    className="organization-user-checkbox"
                    type="checkbox"
                    checked={Boolean(currentType)}
                    onChange={() => onAssignmentChange(user.id, currentType ?? 'XLC')}
                  />
                  <div className="organization-user-avatar" aria-hidden="true">
                    {getInitials(user.fullName)}
                  </div>
                  <label className="organization-user-info" htmlFor={checkboxId}>
                    <span className="organization-user-name">{user.fullName}</span>
                    <span className="organization-user-meta">
                      {user.roles.join(', ') || user.email}
                    </span>
                  </label>
                </div>

                <div className="organization-user-role-options" aria-label={`Vai trò xử lý của ${user.fullName}`}>
                  {PROCESSOR_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      className={`processor-type-btn ${currentType === type ? 'active' : ''} type-${type.toLowerCase()}`}
                      onClick={() => onAssignmentChange(user.id, type)}
                      title={roleLabels[type]}
                      aria-pressed={currentType === type}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}

          {node.children.map((child) => (
            <OrganizationTreeBranch
              key={child.key}
              node={child}
              expanded={expanded}
              searching={searching}
              assignmentsByUserId={assignmentsByUserId}
              roleLabels={roleLabels}
              onToggleNode={onToggleNode}
              onAssignmentChange={onAssignmentChange}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function OrganizationAssignmentTree({
  users,
  assignments,
  roleLabels,
  onAssignmentChange,
}: OrganizationAssignmentTreeProps) {
  const { departments, loading: loadingDepartments, error: departmentsError } = useDepartments();
  const [memberships, setMemberships] = useState<DepartmentMembership[]>([]);
  const [loadingMemberships, setLoadingMemberships] = useState(false);
  const [membershipError, setMembershipError] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(['department-unassigned'])
  );
  const [search, setSearch] = useState('');
  const initializedDepartmentExpansion = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function loadMemberships() {
      if (departments.length === 0) {
        setMemberships([]);
        setLoadingMemberships(false);
        return;
      }

      setLoadingMemberships(true);
      setMembershipError('');
      const loadedMemberships: DepartmentMembership[] = [];
      let failedRequests = 0;

      for (let index = 0; index < departments.length; index += MEMBERSHIP_REQUEST_BATCH_SIZE) {
        const batch = departments.slice(index, index + MEMBERSHIP_REQUEST_BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(async (department) => {
            const { data } = await departmentsApi.getMembers(department.id);
            return (data.data ?? []).map((member) => ({
              departmentId: department.id,
              userId: member.userId,
            }));
          })
        );

        if (cancelled) return;
        results.forEach((result) => {
          if (result.status === 'fulfilled') loadedMemberships.push(...result.value);
          else failedRequests += 1;
        });
      }

      if (!cancelled) {
        setMemberships(loadedMemberships);
        setMembershipError(
          failedRequests > 0
            ? 'Một số phòng ban chưa tải được danh sách nhân sự. Vui lòng thử tải lại trang.'
            : ''
        );
        setLoadingMemberships(false);
      }
    }

    void loadMemberships();
    return () => {
      cancelled = true;
    };
  }, [departments]);

  const tree = useMemo(
    () => buildOrganizationTree(departments, users, memberships),
    [departments, memberships, users]
  );

  useEffect(() => {
    if (!initializedDepartmentExpansion.current && departments.length > 0) {
      setExpanded(new Set(tree.map((node) => node.key)));
      initializedDepartmentExpansion.current = true;
    }
  }, [departments.length, tree]);

  const normalizedSearch = search.trim().toLocaleLowerCase('vi');
  const visibleTree = useMemo(
    () => filterTree(tree, normalizedSearch),
    [normalizedSearch, tree]
  );
  const assignmentsByUserId = useMemo(
    () => new Map(assignments.map((assignment) => [assignment.userId, assignment.processorType])),
    [assignments]
  );
  const loading = loadingDepartments || loadingMemberships;
  const organizationError = departmentsError || membershipError;

  const toggleNode = (key: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="organization-assignment-tree">
      <div className="organization-tree-toolbar">
        <div className="organization-tree-search">
          <span className="organization-tree-search-icon" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tìm phòng ban, nhân sự hoặc vai trò..."
            aria-label="Tìm trong cây tổ chức"
          />
        </div>
        <div className="organization-tree-toolbar-actions">
          <span className="organization-selection-count">
            Đã chọn <strong>{assignments.length}</strong>
          </span>
          <button
            type="button"
            className="organization-tree-action"
            onClick={() => setExpanded(new Set(collectNodeKeys(tree)))}
          >
            Mở tất cả
          </button>
          <button
            type="button"
            className="organization-tree-action"
            onClick={() => setExpanded(new Set())}
          >
            Thu gọn
          </button>
        </div>
      </div>

      {organizationError && (
        <div className="organization-tree-warning" role="status">
          {organizationError}
        </div>
      )}

      <div className="organization-tree-scroll">
        {loading ? (
          <div className="loading-spinner organization-tree-loading">
            <div className="spinner" />
            <span>Đang tải cây tổ chức...</span>
          </div>
        ) : visibleTree.length > 0 ? (
          <ul className="organization-tree-root" role="tree" aria-label="Cây phòng ban và nhân sự">
            {visibleTree.map((node) => (
              <OrganizationTreeBranch
                key={node.key}
                node={node}
                expanded={expanded}
                searching={Boolean(normalizedSearch)}
                assignmentsByUserId={assignmentsByUserId}
                roleLabels={roleLabels}
                onToggleNode={toggleNode}
                onAssignmentChange={onAssignmentChange}
              />
            ))}
          </ul>
        ) : (
          <div className="organization-tree-empty">
            {normalizedSearch
              ? 'Không tìm thấy phòng ban hoặc nhân sự phù hợp.'
              : 'Chưa có nhân sự để phân công.'}
          </div>
        )}
      </div>
    </div>
  );
}
