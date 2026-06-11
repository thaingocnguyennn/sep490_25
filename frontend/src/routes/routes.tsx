import { RouteObject, Navigate } from 'react-router-dom';
import AuthLayout from '../layouts/AuthLayout';
import MainLayout from '../layouts/MainLayout';
import LoginPage from '../features/auth/pages/LoginPage';
import ChangePasswordPage from '../features/auth/pages/ChangePasswordPage';
import DashboardPage from '../features/dashboard/pages/DashboardPage';
import ProfilePage from '../features/profile/pages/ProfilePage';
import ProfileEditPage from '../features/profile/pages/ProfileEditPage';
import AdminLayout from '../shared/components/AdminLayout';
import AdminSidebar from '../shared/components/AdminSidebar';
import AdminDashboardPage from '../features/admin/pages/AdminDashboardPage';
import UsersPage from '../features/users/pages/UsersPage';
import UserFormPage from '../features/users/pages/UserFormPage';
import UserDetailPage from '../features/users/pages/UserDetailPage';
import RolesPage from '../features/roles/pages/RolesPage';
import RoleFormPage from '../features/roles/pages/RoleFormPage';

export const routes: RouteObject[] = [
  {
    path: '/login',
    element: <AuthLayout />,
    children: [{ index: true, element: <LoginPage /> }],
  },
  {
    path: '/',
    element: <MainLayout />,
      children: [
      { index: true, element: <DashboardPage /> },
      { path: 'profile', element: <ProfilePage /> },
      { path: 'profile/edit', element: <ProfileEditPage /> },
      { path: 'change-password', element: <ChangePasswordPage /> },
    ],
  },
  {
    path: '/admin',
    element: <AdminLayout />,
      children: [
      { index: true, element: <AdminDashboardPage /> },
      { path: 'users', element: <UsersPage /> },
      { path: 'users/new', element: <UserFormPage /> },
      { path: 'users/:id', element: <UserDetailPage /> },
      { path: 'users/:id/edit', element: <UserFormPage /> },
      { path: 'roles', element: <RolesPage /> },
      { path: 'roles/new', element: <RoleFormPage /> },
      { path: 'roles/:id/edit', element: <RoleFormPage /> },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
];
