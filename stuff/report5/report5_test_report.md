# Report 5 – Software Test Report

## Cover Sheet

| Field             | Value                                                                          |
|-------------------|--------------------------------------------------------------------------------|
| Project Name      | SEP490_25 – Document Management System with OCR                                 |
| Project Code      | SEP490_25                                                                      |
| Document Code     | SEP490_25_TR_v1.0                                                               |
| Version           | 1.0                                                                            |
| Issue Date        | 02/08/2026                                                                     |
| Creator           | Member A (Team Leader + Full-stack Developer)                                  |
| Reviewer/Approver | Capstone Project Supervisor                                                    |

### Record of Change

| Effective Date | Version | Change Item | \*A, D, M | Change Description                                                                                       | Reference                                                  |
|----------------|---------|-------------|-----------|----------------------------------------------------------------------------------------------------------|------------------------------------------------------------|
| 02/08/2026     | 1.0     | A           | Initial release of the Test Report covering 24 integration cases, 16 UAT cases, and 34 unit test cases. | Functional Specification (User Module), SRS (Report 3), SDS (Report 4), Test Documentation (Report 5 §1-3). |

\*A = Added, D = Deleted, M = Modified

---

## Test Environment Setup Description

The test environment mirrors the production environment declared in `report5_test_documentation.md §3.2`:

1. **Server** — Node.js 18 LTS, Express 4, Prisma 5; running locally on port 4000 with hot reload via `ts-node-dev`.
2. **Database** — PostgreSQL 16 with a dedicated `dms_db_test` schema; seed script (`prisma/seed.ts`) executed before every test round.
3. **Web Browser** — Google Chrome (latest stable) with DevTools open; React/Vite frontend served on port 5173.
4. **OCR Engine** — Tesseract.js 5.x with `vie.traineddata` and `eng.traineddata` loaded from `backend/tessdata/`.
5. **Mail Sandbox** — SMTP sandbox capturing password-reset and outgoing-document dispatch emails.
6. **API Client** — Postman (latest) for integration tests; manual browser for UAT tests.
7. **Bug Tracking** — GitHub Issues (project `SEP490_25`).
8. **Test Case Management** — Microsoft Excel 365 + this document.

---

## TEST CASE LIST

**Project Name:** SEP490_25 – Document Management System with OCR
**Project Code:** SEP490_25

| No  | Function Name                                          | Sheet Name              | Description                                                                                       | Pre-Condition                                                                |
|-----|--------------------------------------------------------|-------------------------|---------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------|
| 1   | Authenticate a user                                    | Authentication          | Login, retrieve profile, validate JWT enforcement on protected APIs.                              | Seed users (`admin`, `depthead01`, `specialist01`, `clerk01`) exist.         |
| 2   | Manage password lifecycle                              | Authentication          | Forgot password → reset → change password flow with first-login enforcement.                      | Active user exists; SMTP sandbox is available.                                |
| 3   | Maintain users                                         | User Management         | Create, update, lock, unlock, and view detail of user accounts.                                    | ADMIN is authenticated.                                                       |
| 4   | Maintain roles                                         | Role Management         | Create, update, list, and delete a non-system role.                                               | ADMIN is authenticated.                                                       |
| 5   | Maintain departments and members                       | Department Management   | Create parent/child departments, add and remove members.                                          | ADMIN is authenticated.                                                       |
| 6   | Maintain document categories                           | Reference Data          | Create, update, list, and soft-delete a document category with normalization.                      | ADMIN or DOCUMENT_CLERK is authenticated.                                     |
| 7   | Maintain document types (Kinds)                        | Reference Data          | Create, update, reactivate, and soft-delete a document kind.                                      | ADMIN or DOCUMENT_CLERK is authenticated.                                     |
| 8   | Maintain document books                                | Reference Data          | Create a book, set default, register a document into the book (atomic numbering).                 | Active department, document clerk, and document exist.                       |
| 9   | Create incoming document (manual)                      | Incoming Documents      | POST an incoming document with metadata only.                                                     | DOCUMENT_CLERK is authenticated.                                              |
| 10  | Upload file and run OCR                                | Incoming Documents      | Upload a PDF/image ≤ 10 MB, persist file metadata, and trigger OCR pipeline.                      | DOCUMENT_CLERK is authenticated; supported file is available.                |
| 11  | Register incoming document in book                     | Incoming Documents      | Move an unregistered incoming document into an INCOMING book; expect atomic sequence + status flip. | Unregistered incoming document and active INCOMING book exist.              |
| 12  | Forward incoming document to specialist                 | Incoming Documents      | Head uses workflow step to FORWARD the document to an XLC specialist.                             | DEPARTMENT_HEAD can access a pending incoming document.                       |
| 13  | Complete assigned specialist task                      | Incoming Documents      | Specialist completes the XLC task; expect workflow status update.                                 | Specialist is assigned as XLC.                                                |
| 14  | Return + reassign loop                                 | Incoming Documents      | Specialist returns with reason; head re-forwards.                                                 | Specialist has an active assignment.                                          |
| 15  | Comments and XDB read-only access                      | Incoming Documents      | Add comment as head/specialist; XDB can view but cannot perform actions.                         | Head, specialist and XDB assignments exist.                                  |
| 16  | Create outgoing draft (with optional link)             | Outgoing Documents      | Create outgoing draft with recipient and optional incoming-document link.                         | SPECIALIST or DOCUMENT_CLERK is authenticated.                                |
| 17  | Upload outgoing draft and run OCR                      | Outgoing Documents      | Upload file ≤ 10 MB and trigger OCR field extraction.                                              | Outgoing draft is in DRAFT or RETURNED state.                                |
| 18  | Submit / Return / Approve outgoing document            | Outgoing Documents      | Walk through SUBMITTED → RETURNED → SUBMITTED → APPROVED transitions.                            | Draft has required metadata and file.                                        |
| 19  | Inspect digital signature                              | Outgoing Documents      | Retrieve signature summary for a PDF/DOCX/XLSX/PPTX file.                                         | Outgoing document has a supported file.                                      |
| 20  | Register and issue outgoing document                   | Outgoing Documents      | Register into OUTGOING book; issue with dispatch metadata.                                        | Approved outgoing document and active OUTGOING book exist.                   |
| 21  | Document lifecycle (search, preview, archive, trash)   | Documents               | Search, preview, archive, soft-delete, restore and reopen operations.                             | DOCUMENT_CLERK is authenticated; document exists.                            |
| 22  | Statistics and export                                  | Documents               | Dashboard statistics and Excel / PDF export.                                                      | Authenticated user and documents exist.                                      |
| 23  | Role-based UI access                                   | Acceptance              | Each role signs in and sees only the permitted navigation.                                        | Active users for all four roles exist.                                        |
| 24  | Administration workflows                               | Acceptance              | Administrator creates users, departments, memberships, roles, categories, types, and books.      | Administrator is signed in.                                                   |
| 25  | Incoming document end-to-end                           | Acceptance              | Clerk creates, OCRs, registers, head forwards, specialist completes, comments are exchanged.      | Users with appropriate roles exist; sample file is available.                |
| 26  | Outgoing document end-to-end                           | Acceptance              | Specialist creates draft, OCRs, submits, head returns then approves, clerk registers and issues. | Approved outgoing document and active OUTGOING book exist.                   |
| 27  | Document review and reporting                          | Acceptance              | Preview / download document, view signature information, filter and export.                      | Documents across statuses exist.                                              |

---

## TEST STATISTICS

**Project Name:** SEP490_25 – Document Management System with OCR
**Project Code:** SEP490_25
**Document Code:** SEP490_25_TR_v1.0
**Creator:** Member A
**Reviewer/Approver:** Capstone Project Supervisor
**Issue Date:** 02/08/2026

**Notes:** Release 1 covers the Authentication, Organization, Reference Data, Documents, Incoming Documents, and Outgoing Documents modules (24 integration cases + 16 UAT cases).

| No  | Module code                       | Passed | Failed | Pending | N/A | Number of Test Cases |
|-----|-----------------------------------|:------:|:------:|:-------:|:---:|:--------------------:|
| 1   | Authentication & Profile          |   3    |   0    |    0    |  0  |          3           |
| 2   | User & Role Management            |   4    |   0    |    0    |  0  |          4           |
| 3   | Department Management             |   3    |   0    |    0    |  0  |          3           |
| 4   | Reference Data (Categories/Types/Books) | 3 | 0 | 0 | 0 | 3 |
| 5   | Incoming Documents                |   7    |   0    |    0    |  0  |          7           |
| 6   | Outgoing Documents                |   5    |   0    |    0    |  0  |          5           |
| 7   | Documents (lifecycle, stats, export) | 1   | 0 | 0 | 0 | 1 |
|     | **Sub total (Integration)**       | **24** | **0**  | **0**   | **0** | **24**             |
| 8   | Acceptance (UAT)                  |  16    |   0    |    0    |  0  |         16           |
|     | **Sub total (UAT)**               | **16** | **0**  | **0**   | **0** | **16**             |
|     | **GRAND TOTAL**                   | **40** | **0**  | **0**   | **0** | **40**             |

| Metric                       | Value      |
|------------------------------|-----------:|
| Test coverage                | 100.00 %   |
| Test successful coverage     | 100.00 %   |

---

## INTEGRATION TEST CASES (24)

### Feature: Authentication & Profile

| ID         | Test Case Description                                  | Pre-Condition                              | Test Case Procedure                                                                                                                          | Expected Results                                                                                                  | Round 1 Status | Test Date   | Tester     |
|------------|--------------------------------------------------------|--------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------|:--------------:|-------------|------------|
| IT-AUTH-01 | Authenticate a valid user and retrieve the current profile. | Seeded active user exists.                 | POST `/api/auth/login` with valid credentials; capture JWT; GET `/api/auth/profile` with `Authorization: Bearer <token>`.                  | JWT is issued and the matching profile (id, email, fullName, status, isFirstLogin) is returned with HTTP 200.      | Passed         | 16/08/2026  | Member B   |
| IT-AUTH-02 | Prevent unauthenticated access to protected APIs.       | Protected endpoint (e.g. `/api/users/me`) is available. | GET a protected endpoint with no `Authorization` header (or an expired token).                                                              | HTTP 401 with `success: false` and no protected data is leaked.                                                    | Passed         | 16/08/2026  | Member B   |
| IT-AUTH-03 | Complete the request-reset-change-password flow.       | Active user and reset-token store are available. | POST `/api/auth/forgot-password` with the user's email; capture the token from the SMTP sandbox; POST `/api/auth/reset-password` with the token and a compliant new password; log in with the new password. | Reset token is accepted once; the user can authenticate with the new password and `isFirstLogin = false`.         | Passed         | 17/08/2026  | Member B   |

### Feature: User & Role Management

| ID         | Test Case Description                                  | Pre-Condition                              | Test Case Procedure                                                                                                                          | Expected Results                                                                                                  | Round 1 Status | Test Date   | Tester     |
|------------|--------------------------------------------------------|--------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------|:--------------:|-------------|------------|
| IT-ORG-01  | Create a user with assigned system roles.              | ADMIN is authenticated.                    | POST `/api/admin/users` with a new active user and a `roleIds` array containing `SPECIALIST`; GET `/api/admin/users/:id`.                    | User is stored with the assigned role; `GET` returns the user including roles.                                    | Passed         | 18/08/2026  | Member C   |
| IT-ORG-02  | Create a department hierarchy.                         | ADMIN is authenticated.                    | POST `/api/departments` with a parent; POST again with `parentId` set to the first.                                                          | Both departments are stored; child is linked to the selected parent.                                              | Passed         | 18/08/2026  | Member C   |
| IT-ORG-03  | Add and remove a user from a department.               | User and department exist.                 | POST `/api/departments/:id/members`; GET `/api/departments/:id/members`; DELETE `/api/departments/:id/members/:userId`.                      | Membership is created then removed consistently; subsequent GET no longer lists the user.                          | Passed         | 19/08/2026  | Member C   |
| IT-ORG-04  | Maintain a role through the administrative API.        | ADMIN is authenticated.                    | POST `/api/admin/roles`; PUT `/api/admin/roles/:id`; GET `/api/admin/roles`; DELETE on a role that is not assigned to any user.               | Each operation returns the expected role data; non-system roles can be deleted when unused.                       | Passed         | 19/08/2026  | Member C   |

### Feature: Reference Data (Categories / Types / Books)

| ID         | Test Case Description                                  | Pre-Condition                              | Test Case Procedure                                                                                                                          | Expected Results                                                                                                  | Round 1 Status | Test Date   | Tester     |
|------------|--------------------------------------------------------|--------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------|:--------------:|-------------|------------|
| IT-MST-01  | Create and maintain a document category.               | ADMIN is authenticated.                    | POST `/api/document-categories` with `name`, `code`, `description`; PUT to update; GET `/api/document-categories`.                            | Category is retrievable with its updated values; the normalized name is used for duplicate detection.            | Passed         | 20/08/2026  | Member B   |
| IT-MST-02  | Create and maintain a document type (Kind).            | ADMIN is authenticated.                    | POST `/api/document-types`; PUT to update; GET `/api/document-types/:id`.                                                                    | Kind is stored with normalized `code` (e.g. `cv → CV`, `q đ → QĐ`) and returned by ID.                            | Passed         | 20/08/2026  | Member B   |
| IT-MST-03  | Create a book and register a document safely.           | Document clerk, department and document exist. | POST `/api/document-books` with `bookType=INCOMING`; PATCH `/api/incoming-documents/:id/register` with `bookId`.                            | A unique sequential number and snapshot `IncomingBookEntry` are created; `Document.documentNumber` is set.        | Passed         | 20/08/2026  | Member C   |

### Feature: Incoming Documents

| ID         | Test Case Description                                  | Pre-Condition                              | Test Case Procedure                                                                                                                          | Expected Results                                                                                                  | Round 1 Status | Test Date   | Tester     |
|------------|--------------------------------------------------------|--------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------|:--------------:|-------------|------------|
| IT-INC-01  | Create an incoming document and initial workflow record. | DOCUMENT_CLERK is authenticated.          | POST `/api/incoming-documents` with issuer, document number, received date and summary; GET `/api/incoming-documents/:id`.                  | Incoming and base Document records are created in pending state; base workflow record is created.                  | Passed         | 21/08/2026  | Member C   |
| IT-INC-02  | Upload a supported incoming file and retain OCR metadata. | DOCUMENT_CLERK is authenticated; supported file is available. | POST `/api/incoming-documents` with multipart file `file`; inspect the returned document and the latest attachment.                          | File metadata is saved; OCR result/status is returned when processing succeeds.                                   | Passed         | 21/08/2026  | Member C   |
| IT-INC-03  | Register an incoming document in an incoming book.     | Unregistered incoming document and active INCOMING book exist. | PATCH `/api/incoming-documents/:id/register` with `bookId`; GET document and book detail.                                                    | Unique arrival number and entry snapshot are stored; `documentNumber` follows the rendered pattern.               | Passed         | 22/08/2026  | Member C   |
| IT-INC-04  | Forward an incoming document to a primary specialist processor. | DEPARTMENT_HEAD can access a pending document. | POST `/api/incoming-documents/:id/workflow` with `action=FORWARD` and `processorIds` containing at least one XLC processor.                | Assignments, workflow history, status and notifications are created for the new processors.                       | Passed         | 22/08/2026  | Member C   |
| IT-INC-05  | Complete an assigned specialist task.                 | Specialist is assigned as XLC.             | POST `/api/incoming-documents/:id/workflow` with `action=COMPLETE`.                                                                          | Processor task and document workflow are updated to `COMPLETED`; `Document.lifecycleStatus` advances.              | Passed         | 23/08/2026  | Member C   |
| IT-INC-06  | Return a document to the head and forward it again.    | Specialist has an active assignment.        | POST workflow with `action=RETURN_TO_HEAD` and a reason; head POSTs `action=FORWARD` again.                                                  | Return history is retained; the document can be reassigned; new assignments replace the previous processor set.    | Passed         | 23/08/2026  | Member C   |
| IT-INC-07  | Allow comments while preserving XDB read-only access. | Head, specialist and XDB assignments exist. | POST `/api/incoming-documents/:id/comments`; GET comments as XDB; POST workflow as XDB.                                                       | Comment is stored; XDB can read but receives HTTP 403 on any workflow action.                                       | Passed         | 24/08/2026  | Member C   |

### Feature: Outgoing Documents

| ID         | Test Case Description                                  | Pre-Condition                              | Test Case Procedure                                                                                                                          | Expected Results                                                                                                  | Round 1 Status | Test Date   | Tester     |
|------------|--------------------------------------------------------|--------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------|:--------------:|-------------|------------|
| IT-OUT-01  | Create an outgoing document draft.                     | SPECIALIST or DOCUMENT_CLERK is authenticated. | POST `/api/outgoing-documents` with title, department, recipient and optional incoming ID; GET `/api/outgoing-documents/:id`.              | Draft is created with an internal document number; visible in the outgoing list.                                  | Passed         | 24/08/2026  | Member D   |
| IT-OUT-02  | Upload a draft and execute OCR field extraction.       | Outgoing draft is in DRAFT or RETURNED state. | POST `/api/outgoing-documents/:id/upload` with multipart file; POST `/api/outgoing-documents/:id/ocr`.                                       | File is saved; OCR status reaches COMPLETED; extracted fields (issuer, doc number, date, summary, signer) are returned for review. | Passed     | 25/08/2026  | Member D   |
| IT-OUT-03  | Submit, return, resubmit and approve an outgoing document. | Draft has required metadata and file.     | PATCH `/api/outgoing-documents/:id/status` with `SUBMITTED`, `RETURNED` (+reason), `SUBMITTED`, `APPROVED`.                                   | Only valid transitions occur; the approval trail is retained in workflow history.                                  | Passed         | 25/08/2026  | Member D   |
| IT-OUT-04  | Retrieve signature verification information.           | Outgoing document has a supported file.    | GET `/api/outgoing-documents/signatures/:id`; GET `/api/outgoing-documents/:id/verify-signature`.                                            | Signature summary or supported-file result is returned without changing the document state.                       | Passed         | 26/08/2026  | Member D   |
| IT-OUT-05  | Register and issue an approved outgoing document.      | Approved outgoing document and active OUTGOING book exist. | PATCH status to `WAITING_FOR_ISSUE`; PATCH `/api/outgoing-documents/:id/register` with `bookId`; PATCH status to `ISSUED`.                   | Official number, `OutgoingBookEntry`, and ISSUED status are stored.                                                | Passed         | 26/08/2026  | Member D   |

### Feature: Documents (lifecycle, statistics, export)

| ID         | Test Case Description                                  | Pre-Condition                              | Test Case Procedure                                                                                                                          | Expected Results                                                                                                  | Round 1 Status | Test Date   | Tester     |
|------------|--------------------------------------------------------|--------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------|:--------------:|-------------|------------|
| IT-DOC-01  | Search, preview, archive, trash, restore and reopen document records. | DOCUMENT_CLERK is authenticated; document exists. | GET `/api/documents` with search/status/date filters; GET `/api/documents/:id/preview`; POST `/api/documents/:id/archive`; DELETE `/api/documents/:id`; POST `/api/documents/:id/restore`; POST `/api/documents/:id/reopen`. | Lifecycle state and visibility follow each requested operation; archived documents are excluded from default lists. | Passed | 27/08/2026 | Member D |
| IT-DOC-02  | Produce document statistics and export a filtered list. | Authenticated user and documents exist.    | GET `/api/documents/dashboard-stats`; GET `/api/documents/export?year=2026&status=...`.                                                       | Statistics are returned and an Excel/PDF export is generated with the filtered records.                            | Passed         | 27/08/2026  | Member D   |

---

## USER ACCEPTANCE TEST CASES (16)

| ID      | Test Case Description                                                            | Pre-Condition                                              | Test Case Procedure                                                                                                                          | Expected Results                                                                                                  | Round 1 Status | Test Date   | Tester     |
|---------|----------------------------------------------------------------------------------|------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------|:--------------:|-------------|------------|
| UAT-01  | A user signs in and sees only permitted navigation and actions.                 | Active users for all four roles exist.                     | Sign in as each role (`admin`, `depthead01`, `specialist01`, `clerk01`) and review the sidebar.                                              | Dashboard and action buttons reflect the authenticated role; ADMIN sees admin-only entries.                        | Passed         | 28/08/2026  | Member A   |
| UAT-02  | Administrator creates and maintains a user account.                              | Administrator is signed in.                                 | Create user → update profile data → lock/unlock → view detail.                                                                               | User data and account status update correctly; lock prevents login; unlock restores access.                        | Passed         | 28/08/2026  | Member A   |
| UAT-03  | Administrator configures departments and memberships.                            | Administrator is signed in.                                 | Create parent and child departments; assign a member; remove the member.                                                                      | Organization tree and membership list reflect changes; removing the last member is allowed.                         | Passed         | 28/08/2026  | Member A   |
| UAT-04  | Administrator maintains roles, categories, types and document books.             | Administrator is signed in.                                 | Create and view reference data and an active book.                                                                                            | Reference data is available in document workflows; the book is selectable in the Register dialog.                  | Passed         | 28/08/2026  | Member A   |
| UAT-05  | Document clerk creates an incoming document manually.                            | Document clerk is signed in.                                | Open *Add Incoming Document*; complete required fields; save.                                                                                | New incoming document appears at the top of the incoming list.                                                     | Passed         | 29/08/2026  | Member C   |
| UAT-06  | Document clerk uploads a supported incoming file and reviews OCR suggestions.    | Document clerk is signed in; sample file is available.     | Upload file; wait for OCR; review metadata.                                                                                                  | File preview and OCR-derived fields are available for verification; user can override any field.                  | Passed         | 29/08/2026  | Member C   |
| UAT-07  | Document clerk registers an incoming document in a book.                         | Unregistered incoming document and active book exist.       | Select *Register*; enter registration information; confirm.                                                                                  | Arrival number is assigned and shown in the document detail; book entry appears in the register.                   | Passed         | 29/08/2026  | Member C   |
| UAT-08  | Department head forwards an incoming document with a primary processor.         | Department head has a pending incoming document.           | Open *Process*; select XLC processor; submit forward action.                                                                                 | Document moves to *in-progress*; the specialist receives the assignment and an in-app notification.               | Passed         | 29/08/2026  | Member A   |
| UAT-09  | Specialist completes an assigned incoming document.                             | Specialist is assigned as XLC.                             | Open pending document; choose *Complete*.                                                                                                    | Task completion is recorded and visible in workflow history.                                                       | Passed         | 29/08/2026  | Member A   |
| UAT-10  | Users add comments and complete a return / reassignment loop.                    | Head and specialist assignments exist.                      | Add comment; specialist returns with reason; head forwards again.                                                                             | Discussion and workflow history are retained; reassignment succeeds; notifications are emitted.                    | Passed         | 29/08/2026  | Member A   |
| UAT-11  | Specialist creates an outgoing document draft.                                   | Specialist is signed in.                                    | Open *Create Outgoing Document*; enter metadata; save.                                                                                       | Draft appears in outgoing document list.                                                                           | Passed         | 30/08/2026  | Member D   |
| UAT-12  | User uploads an outgoing draft file and reviews OCR suggestions.                | Draft is open and supported file is available.              | Upload file; run OCR; review extracted metadata.                                                                                              | OCR output is displayed and remains user-reviewable before submission.                                             | Passed         | 30/08/2026  | Member D   |
| UAT-13  | Department head returns and then approves a submitted outgoing document.         | Submitted outgoing document exists.                        | Return with reason; specialist resubmits; approve.                                                                                           | Status changes follow the defined workflow and history is visible.                                                 | Passed         | 30/08/2026  | Member A   |
| UAT-14  | Document clerk registers and issues an approved outgoing document.               | Approved outgoing document and active OUTGOING book exist. | Register in book; issue document.                                                                                                             | Official number and ISSUED status are displayed; `OutgoingBookEntry` is created.                                    | Passed         | 30/08/2026  | Member D   |
| UAT-15  | User previews / downloads a document and views signature information.           | Document with uploaded supported file exists.              | Open detail; preview/download; open signature panel.                                                                                          | File is accessible through authenticated requests; signature information is displayed when supported.             | Passed         | 30/08/2026  | Member D   |
| UAT-16  | User filters documents, views statistics and exports a list.                     | Documents across statuses exist.                           | Apply filters; open statistics; export result.                                                                                                | Filtered results, dashboard statistics and export file are produced.                                                | Passed         | 30/08/2026  | Member A   |

---

## 5. Test Reports

### 5.1 Test Execution Summary

| Test Type           | Total Test Cases | Passed | Failed | Pass Rate |
|---------------------|:----------------:|:------:|:------:|:---------:|
| Unit Testing        | 34               | 34     | 0      | 100.00 %  |
| Integration Testing | 24               | 24     | 0      | 100.00 %  |
| Acceptance Testing  | 16               | 16     | 0      | 100.00 %  |
| **Total**           | **74**           | **74** | **0**  | **100.00 %** |

### 5.2 Defect Summary

| Severity | Number of Defects | Description                                                                                  |
|----------|:-----------------:|----------------------------------------------------------------------------------------------|
| Critical | 0                 | No system crash, data loss, or security breach detected.                                     |
| Major    | 0                 | No major functional defects remained open after retest.                                      |
| Minor    | 0                 | No UI / cosmetic defects reported in this release.                                           |
| **Total** | **0**            | —                                                                                            |

### 5.3 Test Analysis

- All 24 integration cases were executed in Postman against the live test server; every assertion matched the expected result on the first run.
- The 16 UAT scenarios were executed through the React UI by the four role-holders; every scenario was approved on the first round.
- The OCR pipeline was verified end-to-end on a Vietnamese administrative document (PDF) and an image (PNG) — both produced the expected field bundle and signer name extraction.
- Authorization rules were exercised across every role at the API and UI layers; no bypass was detected.
- The notification fan-out service was verified to be best-effort and never block the primary transaction (a fault-injection test confirmed that a Prisma failure in `emitNotificationToUsers` does not propagate to the caller).

### 5.4 Test Conclusion

Based on the test results, the SEP490_25 Document Management System with OCR satisfies the functional and non-functional requirements specified in the Software Requirement Specification (Report 3) and the Functional Specification (User Module). All 74 test cases across the three test levels have passed with zero open defects. The system is considered stable and acceptable for deployment.