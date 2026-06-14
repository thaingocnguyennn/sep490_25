export { authApi } from './modules/auth';
export { usersApi } from './modules/users';
export { rolesApi } from './modules/roles';
export { documentsApi, incomingDocumentsApi } from './modules/documents';
export { departmentsApi } from './modules/departments';
export type {
  Document,
  IncomingDocumentDetail,
  IncomingDocumentListItem,
  OcrResult,
  CreateIncomingDocumentRequest,
  DocumentStatus,
  Priority,
  ProcessorType,
  Urgency,
  DocumentProcessor,
  DocumentAttachment,
  DocumentWorkflow,
  WorkflowStatus,
} from './modules/documents';
export type { Department } from './modules/departments';
export { default as api } from './axios';
