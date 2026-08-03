import { RouteObject, Navigate } from 'react-router-dom';
import AuthLayout from '../layouts/AuthLayout';
import MainLayout from '../layouts/MainLayout';
import LoginPage from '../features/auth/pages/LoginPage';
import ChangePasswordPage from '../features/auth/pages/ChangePasswordPage';
import ForgotPasswordPage from '../features/auth/pages/ForgotPasswordPage';
import ResetPasswordPage from '../features/auth/pages/ResetPasswordPage';
import DashboardPage from '../features/dashboard/pages/DashboardPage';
import ProfilePage from '../features/profile/pages/ProfilePage';
import ProfileEditPage from '../features/profile/pages/ProfileEditPage';
import AdminLayout from '../shared/components/AdminLayout';
import AdminSidebar from '../shared/components/AdminSidebar';
import AdminDashboardPage from '../features/dashboard/pages/AdminDashboardPage';
import UsersPage from '../features/users/pages/UsersPage';
import UserFormPage from '../features/users/pages/UserFormPage';
import UserDetailPage from '../features/users/pages/UserDetailPage';
import RolesPage from '../features/roles/pages/RolesPage';
import RoleFormPage from '../features/roles/pages/RoleFormPage';
import DepartmentsPage from '../features/departments/pages/DepartmentsPage';
import DepartmentFormPage from '../features/departments/pages/DepartmentFormPage';
import DepartmentDetailPage from '../features/departments/pages/DepartmentDetailPage';

// Incoming document pages (from dev branch)
import IncomingDocumentsPage from '../features/documents/pages/IncomingDocumentsPage';
import AddIncomingDocumentPage from '../features/documents/pages/AddIncomingDocumentPage';
import IncomingDocumentDetailPage from '../features/documents/pages/IncomingDocumentDetailPage';
import PendingIncomingDocumentsPage from '../features/documents/pages/PendingIncomingDocumentsPage';
import IncomingStatisticsPage from '../features/documents/pages/IncomingStatisticsPage'; // giữ lại cho backward compat
// Outgoing document pages
import OutgoingDocumentsPage from '../features/documents/pages/OutgoingDocumentsPage';
import CreateOutgoingDocumentPage from '../features/documents/pages/CreateOutgoingDocumentPage';
import OutgoingDocumentDetailPage from '../features/documents/pages/OutgoingDocumentDetailPage';
import OutgoingDocumentEditPage from '../features/documents/pages/OutgoingDocumentEditPage';
import OutgoingStatisticsPage from '../features/documents/pages/OutgoingStatisticsPage'; // giữ lại cho backward compat
import DocumentStatisticsPage from '../features/documents/pages/DocumentStatisticsPage';
import { DocumentBooksPage } from '../features/document-books/pages/DocumentBooksPage';
import { DocumentCategoriesPage } from '../features/document-categories/pages/DocumentCategoriesPage';
import { DocumentTypesPage } from '../features/document-types/pages/DocumentTypesPage';


export const routes: RouteObject[] = [
  {
    path: '/login',
    element: <AuthLayout />,
    children: [{ index: true, element: <LoginPage /> }],
  },
  {
    path: '/forgot-password',
    element: <AuthLayout />,
    children: [{ index: true, element: <ForgotPasswordPage /> }],
  },
  {
    path: '/reset-password',
    element: <AuthLayout />,
    children: [{ index: true, element: <ResetPasswordPage /> }],
  },
  {
    path: '/',
    element: <MainLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'profile', element: <ProfilePage /> },
      { path: 'profile/edit', element: <ProfileEditPage /> },
      { path: 'change-password', element: <ChangePasswordPage /> },

      // Incoming document routes (from dev branch)
      { path: 'incoming-documents', element: <IncomingDocumentsPage /> },
      { path: 'incoming-documents/new', element: <AddIncomingDocumentPage /> },
      { path: 'incoming-documents/pending',    element: <PendingIncomingDocumentsPage /> },
      { path: 'incoming-documents/statistics',  element: <IncomingStatisticsPage /> }, // backward compat
      { path: 'incoming-documents/:id',         element: <IncomingDocumentDetailPage /> },
      // Outgoing document routes
      { path: 'outgoing-documents',             element: <OutgoingDocumentsPage /> },
      { path: 'outgoing-documents/new',         element: <CreateOutgoingDocumentPage /> },
      { path: 'outgoing-documents/statistics',  element: <OutgoingStatisticsPage /> }, // backward compat
      { path: 'outgoing-documents/:id',         element: <OutgoingDocumentDetailPage /> },
      { path: 'outgoing-documents/:id/edit',    element: <OutgoingDocumentEditPage /> },
      // Sổ văn bản
      { path: 'document-books',                 element: <DocumentBooksPage /> },
      // Lĩnh vực văn bản
      { path: 'document-categories',            element: <DocumentCategoriesPage /> },
      { path: 'document-types',                 element: <DocumentTypesPage /> },
      // Trang thống kê gộp
      { path: 'documents/statistics', element: <DocumentStatisticsPage /> },
    ],
  },
  {
    path: '/admin',
    element: <AdminLayout />,
    children: [
      { index: true, element: <AdminDashboardPage /> },
      { path: 'change-password', element: <ChangePasswordPage /> },
      { path: 'users', element: <UsersPage /> },
      { path: 'users/new', element: <UserFormPage /> },
      { path: 'users/:id', element: <UserDetailPage /> },
      { path: 'users/:id/edit', element: <UserFormPage /> },
      { path: 'roles', element: <RolesPage /> },
      { path: 'roles/new', element: <RoleFormPage /> },
      { path: 'roles/:id/edit', element: <RoleFormPage /> },
      { path: 'departments', element: <DepartmentsPage /> },
      { path: 'departments/new', element: <DepartmentFormPage /> },
      { path: 'departments/:id', element: <DepartmentDetailPage /> },
      { path: 'departments/:id/edit', element: <DepartmentFormPage /> },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
];
