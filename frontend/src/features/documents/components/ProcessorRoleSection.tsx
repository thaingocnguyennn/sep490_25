import { useEffect, useMemo, useRef, useState } from 'react';
import {
  departmentsApi,
  type Department,
} from '../../../api';
import {
  useDepartments,
  type ProcessorOption,
} from '../../../shared/hooks';

export type ProcessorRoleSectionMode = 'single' | 'multi';

interface ProcessorRoleSectionProps {
  title: string;
  description: string;
  /** Visual variant that drives the accent colour (header + selected highlight). */
  variant: 'xlc' | 'phxl' | 'xdb';
  /** All candidate users (typically from useProcessors). */
  users: ProcessorOption[];
  /** Users already pinned to a higher-priority section; rendered disabled. */
  blockedUserIds: number[];
  /** Roles allowed for this section — used to filter users. */
  allowedRoles: string[];
  /** Selected user ids in this section. */
  selectedIds: number[];
  /** Selection mode: single (radio-like, max 1) or multi (checkbox, unlimited). */
  mode: ProcessorRoleSectionMode;
  /** Hard cap; defaults to 1 for `single`, Infinity for `multi`. */
  max?: number;
  /** Invoked when selection changes. */
  onChange: (next: number[]) => void;
  /** Show the search box (default true). */
  showSearch?: boolean;
}

interface DepartmentMembership {
  departmentId: number;
  userId: number;
}

interface RoleTreeNode {
  key: string;
  name: string;
  users: ProcessorOption[];
  children: RoleTreeNode[];
  isUnassigned?: boolean;
}

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

function sortTree(nodes: RoleTreeNode[]): RoleTreeNode[] {
  return nodes
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
    .map((node) => ({
      ...node,
      users: [...node.users].sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi')),
      children: sortTree(node.children),
    }));
}

function buildRoleTree(
  departments: Department[],
  filteredUsers: ProcessorOption[],
  memberships: DepartmentMembership[]
): RoleTreeNode[] {
  const usersById = new Map(filteredUsers.map((user) => [user.id, user]));
  const nodesById = new Map<number, RoleTreeNode>();
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

  const roots: RoleTreeNode[] = [];
  departments.forEach((department) => {
    const node = nodesById.get(department.id);
    if (!node) return;

    const parent = department.parentId ? nodesById.get(department.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  });

  const unassignedUsers = filteredUsers.filter((user) => !assignedUserIds.has(user.id));
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

function nodeMatchesSearch(node: RoleTreeNode, normalizedQuery: string): boolean {
  return node.name.toLocaleLowerCase('vi').includes(normalizedQuery);
}

function userMatchesSearch(user: ProcessorOption, normalizedQuery: string): boolean {
  return [user.fullName, user.email, ...user.roles]
    .some((value) => value.toLocaleLowerCase('vi').includes(normalizedQuery));
}

function filterTree(nodes: RoleTreeNode[], normalizedQuery: string): RoleTreeNode[] {
  if (!normalizedQuery) return nodes;

  return nodes.flatMap((node) => {
    if (nodeMatchesSearch(node, normalizedQuery)) return [node];

    const matchingUsers = node.users.filter((user) => userMatchesSearch(user, normalizedQuery));
    const matchingChildren = filterTree(node.children, normalizedQuery);
    if (matchingUsers.length === 0 && matchingChildren.length === 0) return [];

    return [{ ...node, users: matchingUsers, children: matchingChildren }];
  });
}

function collectNodeKeys(nodes: RoleTreeNode[]): string[] {
  return nodes.flatMap((node) => [node.key, ...collectNodeKeys(node.children)]);
}

/**
 * Returns the IDs of every user that lives in this subtree (the node itself
 * plus all descendant departments). Used to drive the "select all users in
 * this department" checkbox.
 */
function collectSubtreeUserIds(node: RoleTreeNode): number[] {
  return [
    ...node.users.map((u) => u.id),
    ...node.children.flatMap(collectSubtreeUserIds),
  ];
}

interface RoleTreeBranchProps {
  node: RoleTreeNode;
  expanded: Set<string>;
  searching: boolean;
  selectedIds: Set<number>;
  blockedUserIds: Set<number>;
  max: number;
  mode: ProcessorRoleSectionMode;
  variant: 'xlc' | 'phxl' | 'xdb';
  onToggleNode: (key: string) => void;
  onToggleUser: (userId: number) => void;
  onToggleDepartment: (subtreeUserIds: number[]) => void;
}

function RoleTreeBranch({
  node,
  expanded,
  searching,
  selectedIds,
  blockedUserIds,
  max,
  mode,
  variant,
  onToggleNode,
  onToggleUser,
  onToggleDepartment,
}: RoleTreeBranchProps) {
  const hasContents = node.users.length > 0 || node.children.length > 0;
  const isExpanded = searching || expanded.has(node.key);

  // Department-level bulk-select state. Only meaningful in multi mode
  // (PHXL/XDB) — XLC is single-select so "select all" doesn't apply.
  const showDepartmentCheckbox = mode === 'multi';
  const subtreeIds = showDepartmentCheckbox ? collectSubtreeUserIds(node) : [];
  const selectableSubtreeIds = subtreeIds.filter((id) => !blockedUserIds.has(id));
  const selectedSubtreeCount = selectableSubtreeIds.reduce(
    (acc, id) => (selectedIds.has(id) ? acc + 1 : acc),
    0
  );
  const allSubtreeSelected =
    selectableSubtreeIds.length > 0 &&
    selectedSubtreeCount === selectableSubtreeIds.length;
  const someSubtreeSelected =
    selectedSubtreeCount > 0 && selectedSubtreeCount < selectableSubtreeIds.length;
  const departmentCheckboxDisabled = selectableSubtreeIds.length === 0;
  const departmentCheckboxId = `${node.key}-dept-${variant}`;

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
        {showDepartmentCheckbox && node.users.length > 0 && (
          <input
            id={departmentCheckboxId}
            type="checkbox"
            className="organization-department-checkbox"
            checked={allSubtreeSelected}
            // `indeterminate` is a DOM property, not an attribute, so it must
            // be set imperatively via ref.
            ref={(el) => {
              if (el) el.indeterminate = someSubtreeSelected;
            }}
            disabled={departmentCheckboxDisabled}
            onChange={() => onToggleDepartment(subtreeIds)}
            aria-label={`Chọn tất cả nhân sự trong ${node.name}`}
            title={
              departmentCheckboxDisabled
                ? 'Không có nhân sự phù hợp để chọn'
                : allSubtreeSelected
                  ? `Bỏ chọn tất cả nhân sự trong ${node.name}`
                  : `Chọn tất cả ${selectableSubtreeIds.length} nhân sự trong ${node.name}`
            }
          />
        )}
        <span className="organization-department-icon" aria-hidden="true" />
        <span className="organization-department-name">{node.name}</span>
        <span className="organization-department-count">{node.users.length} nhân sự</span>
      </div>

      {hasContents && isExpanded && (
        <ul className="organization-tree-group" role="group">
          {node.users.map((user) => {
            const isBlocked = blockedUserIds.has(user.id);
            const isSelected = selectedIds.has(user.id);
            const disabled = isBlocked;
            const checkboxId = `${node.key}-role-${variant}-${user.id}`;

            return (
              <li
                key={`${node.key}-${user.id}`}
                className={`organization-user-row ${isSelected ? 'selected' : ''} ${isBlocked ? 'blocked' : ''} variant-${variant}`}
                role="treeitem"
                aria-selected={isSelected}
                aria-disabled={disabled}
              >
                <div className="organization-user-main">
                  <input
                    id={checkboxId}
                    className="organization-user-checkbox"
                    type="checkbox"
                    checked={isSelected}
                    disabled={disabled}
                    onChange={() => onToggleUser(user.id)}
                  />
                  <div className="organization-user-avatar" aria-hidden="true">
                    {getInitials(user.fullName)}
                  </div>
                  <label
                    className="organization-user-info"
                    htmlFor={checkboxId}
                    title={isBlocked ? 'Người này đã được phân công ở vai trò ưu tiên cao hơn' : undefined}
                  >
                    <span className="organization-user-name">{user.fullName}</span>
                    <span className="organization-user-meta">
                      {user.roles.join(', ') || user.email}
                    </span>
                  </label>
                </div>
              </li>
            );
          })}

          {node.children.map((child) => (
            <RoleTreeBranch
              key={child.key}
              node={child}
              expanded={expanded}
              searching={searching}
              selectedIds={selectedIds}
              blockedUserIds={blockedUserIds}
              max={max}
              mode={mode}
              variant={variant}
              onToggleNode={onToggleNode}
              onToggleUser={onToggleUser}
              onToggleDepartment={onToggleDepartment}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function ProcessorRoleSection({
  title,
  description,
  variant,
  users,
  blockedUserIds,
  allowedRoles,
  selectedIds,
  mode,
  max,
  showSearch = true,
  onChange,
}: ProcessorRoleSectionProps) {
  const { departments, loading: loadingDepartments, error: departmentsError } = useDepartments();
  const [memberships, setMemberships] = useState<DepartmentMembership[]>([]);
  const [loadingMemberships, setLoadingMemberships] = useState(false);
  const [membershipError, setMembershipError] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState('');
  const initializedDepartmentExpansion = useRef(false);

  const effectiveMax = max ?? (mode === 'single' ? 1 : Number.POSITIVE_INFINITY);

  const allowedUsers = useMemo(
    () => users.filter((user) => user.roles.some((role) => allowedRoles.includes(role))),
    [users, allowedRoles]
  );

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
            return (data.data ?? [])
              .filter((member) => allowedUsers.some((u) => u.id === member.userId))
              .map((member) => ({
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
  }, [departments, allowedUsers]);

  const tree = useMemo(
    () => buildRoleTree(departments, allowedUsers, memberships),
    [departments, allowedUsers, memberships]
  );

  useEffect(() => {
    if (!initializedDepartmentExpansion.current && tree.length > 0) {
      setExpanded(new Set(tree.map((node) => node.key)));
      initializedDepartmentExpansion.current = true;
    }
  }, [tree]);

  const normalizedSearch = search.trim().toLocaleLowerCase('vi');
  const visibleTree = useMemo(
    () => filterTree(tree, normalizedSearch),
    [normalizedSearch, tree]
  );

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const blockedSet = useMemo(() => new Set(blockedUserIds), [blockedUserIds]);

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

  const handleToggleUser = (userId: number) => {
    if (blockedSet.has(userId)) return;

    if (mode === 'single') {
      if (selectedSet.has(userId)) {
        onChange([]);
      } else {
        onChange([userId]);
      }
      return;
    }

    if (selectedSet.has(userId)) {
      onChange(selectedIds.filter((id) => id !== userId));
    } else {
      onChange([...selectedIds, userId]);
    }
  };

  // Bulk select/deselect every non-blocked user in a department subtree.
  // In `multi` mode only — XLC callers don't render a department checkbox,
  // so this branch is unreachable for single mode.
  const handleToggleDepartment = (subtreeUserIds: number[]) => {
    if (mode !== 'multi') return;

    const selectableIds = subtreeUserIds.filter((id) => !blockedSet.has(id));
    if (selectableIds.length === 0) return;

    const allSelected = selectableIds.every((id) => selectedSet.has(id));
    if (allSelected) {
      onChange(selectedIds.filter((id) => !selectableIds.includes(id)));
    } else {
      const merged = new Set(selectedIds);
      for (const id of selectableIds) merged.add(id);
      onChange(Array.from(merged));
    }
  };

  const selectedUsers = selectedIds
    .map((id) => allowedUsers.find((u) => u.id === id))
    .filter((u): u is ProcessorOption => Boolean(u));

  return (
    <section className={`processor-role-section variant-${variant}`}>
      <header className="processor-role-section-header">
        <div>
          <span className={`processor-role-badge badge-${variant}`}>{variant.toUpperCase()}</span>
          <span className="processor-role-title">{title}</span>
        </div>
        <span className="processor-role-count">
          Đã chọn <strong>{selectedIds.length}</strong>
          {mode === 'single' ? ' / 1' : ''}
        </span>
      </header>
      <p className="processor-role-description">{description}</p>

      <div className="processor-role-selected">
        {selectedUsers.length === 0 ? (
          <span className="processor-role-empty-hint">Chưa chọn ai.</span>
        ) : (
          selectedUsers.map((user) => (
            <span
              key={user.id}
              className={`processor-role-chip chip-${variant}`}
              title={`${user.fullName} — ${user.roles.join(', ') || user.email}`}
            >
              {user.fullName}
              <button
                type="button"
                aria-label={`Bỏ chọn ${user.fullName}`}
                onClick={() => handleToggleUser(user.id)}
              >
                ×
              </button>
            </span>
          ))
        )}
      </div>

      <div className="organization-assignment-tree processor-role-tree">
        {showSearch && (
          <div className="organization-tree-toolbar">
            <div className="organization-tree-search">
              <span className="organization-tree-search-icon" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={`Tìm trong ${title.toLowerCase()}...`}
                aria-label={`Tìm trong ${title}`}
              />
            </div>
            <div className="organization-tree-toolbar-actions">
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
        )}

        {organizationError && (
          <div className="organization-tree-warning" role="status">
            {organizationError}
          </div>
        )}

        <div className="organization-tree-scroll">
          {loading ? (
            <div className="loading-spinner organization-tree-loading">
              <div className="spinner" />
              <span>Đang tải danh sách...</span>
            </div>
          ) : visibleTree.length > 0 ? (
            <ul className="organization-tree-root" role="tree" aria-label={title}>
              {visibleTree.map((node) => (
                <RoleTreeBranch
                  key={node.key}
                  node={node}
                  expanded={expanded}
                  searching={Boolean(normalizedSearch)}
                  selectedIds={selectedSet}
                  blockedUserIds={blockedSet}
                  max={effectiveMax}
                  mode={mode}
                  variant={variant}
                  onToggleNode={toggleNode}
                  onToggleUser={handleToggleUser}
                  onToggleDepartment={handleToggleDepartment}
                />
              ))}
            </ul>
          ) : (
            <div className="organization-tree-empty">
              {normalizedSearch
                ? 'Không tìm thấy phòng ban hoặc nhân sự phù hợp.'
                : 'Chưa có nhân sự phù hợp với vai trò này.'}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}