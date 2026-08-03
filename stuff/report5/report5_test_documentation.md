# Report 5 – Software Test Documentation

**Project Name:** SEP490_25 – Document Management System with OCR
**Project Code:** SEP490_25
**Document Code:** SEP490_25_STD_v1.0
**Version:** 1.0
**Issue Date:** 02/08/2026
**Creator:** Member A (Team Leader + Full-stack Developer)
**Reviewer/Approver:** Capstone Project Supervisor

---

## I. Record of Changes

| Effective Date | Version | Change Item | \*A, D, M | Change Description | Reference |
|---|---|---|---|---|---|
| 02/08/2026 | 1.0 | A | Initial release of Software Test Documentation for the SEP490_25 Document Management System with OCR | Approved scope of testing, test strategy, test plan, and cross-references to Report 5 Test Report and Report 5 Unit Test. | SRS (Report 3), SDS (Report 4), Functional Specification (User Module) |

\*A = Added, D = Deleted, M = Modified

---

## II. Testing Documentation

## 1. Scope of Testing

This section describes the scope of testing for the SEP490_25 Document Management System (DMS) with OCR. The scope covers the features, functions, and non-functional requirements that will or will not be tested during this release.

### 1.1 Testing Scope

#### 1.1.1 In-Scope Testing

The following features and functions are included in the testing scope:

**Authentication & Account Management**

- User authentication (login with email or username, logout)
- First-login forced password change flow
- Self-service password change
- Forgot password / reset password flow with one-time email token
- Account lock / unlock by administrator
- Profile retrieval and update

**User, Role & Organization Management**

- ADMIN role: user CRUD, lock/unlock, role assignment
- Role management (create, update, delete non-system roles)
- Department hierarchy CRUD
- Department member add / remove

**Reference Data Management**

- Document categories CRUD with Vietnamese-name normalization and code uniqueness
- Document types (Kinds: CV, QĐ, TB, BC, KH, TTR, BB, HD, OTHER) CRUD with reactivation
- Document books CRUD (INCOMING/OUTGOING), close/reopen, set-default, atomic sequence numbering

**Incoming Document Workflow**

- Create incoming document (with or without file upload)
- OCR-assisted metadata extraction (Tesseract vie+eng, Decree 30/2020 region-based field extraction)
- Register incoming document into an INCOMING book (atomic `currentNumber` increment, snapshot entry)
- Workflow actions: FORWARD, RETURN, COMPLETE, TRANSFER, ARCHIVE
- Per-stage access control (DOCUMENT_CLERK / DEPARTMENT_HEAD / SPECIALIST)
- Comments on workflow steps
- Document preview, download, archive, restore, reopen

**Outgoing Document Workflow**

- Create outgoing document draft with optional link to incoming document
- Upload supporting file (PDF, DOCX, XLSX, PPTX, image)
- OCR-assisted metadata extraction
- Workflow transitions: SUBMITTED → RETURNED → SUBMITTED → APPROVED → WAITING_FOR_ISSUE → ISSUED → SENT
- Register outgoing document into an OUTGOING book
- Digital signature inspection (PDF `/ByteRange` integrity, OOXML signature detection)
- Dispatch by email to recipient

**Reporting & Statistics**

- Dashboard statistics (counts per status)
- Excel export (xlsx) and PDF export (pdf) of document registers
- Search and filter (year, status, type, keyword)

**Non-Functional Requirements**

- Role-based access control security (authorization middleware, JWT verification)
- Usability (form validation, inline error messages)
- Reliability (notification fan-out is best-effort and does not block the primary mutation)

#### 1.1.2 Out-of-Scope Testing

The following items are excluded from the testing scope of this release:

- Performance / load / stress testing on production-scale hardware (only smoke checks on the dev environment)
- Performance testing of third-party SMTP service providers
- Full PKI certificate-chain validation beyond what is exposed by the signature inspection utility
- Compatibility testing on obsolete or unsupported web browsers (only Google Chrome latest is in scope)
- Mobile / native-app testing (the system is a web application only)
- Penetration testing by an external security auditor
- OCR accuracy benchmarking against academic datasets (only happy-path / sad-path correctness is verified)

### 1.2 Testing Levels

Testing activities are conducted at multiple levels to ensure software quality and correctness.

#### 1.2.1 Unit Testing

- **In-charge:** Developers (Members B, C, D)
- **Input / Time:** Source code modules during implementation phase, immediately after each helper / service method is committed
- **Focus:**
  - Pure helper functions: `resolveStageFromRoleName`, `rolesForStage`, `canActOnStage`, `resolveUrgencyId`, `resolveConfidentialityId`, `normalizeDocumentKindName`, `normalizeDocumentKindCode`, `normalizeDocumentCategoryName`, `normalizeDocumentCategoryCode`, `generateDocumentNumber`
  - Service-layer helpers: `emitNotificationToUser`, `emitNotificationToUsers`, signature-extraction utilities
  - Business rules: workflow-stage access checks, document-number collision-safe generation, urgency/confidentiality backward-compatibility aliases
  - Frontend form validators and component-level guards (ForgotPasswordPage, ProcessIncomingDocumentModal, PdfPreview)
- **Acceptance Criteria:**
  - All unit test cases pass successfully (Pass Rate = 100%)
  - Normal, Abnormal, and Boundary cases are exercised for every helper
  - No critical defects detected at unit level
  - Test coverage on the touched modules ≥ 95%

#### 1.2.2 Integration Testing

- **In-charge:** Development team and QA testers
- **Input / Time:** Integrated modules after unit testing is complete (week 3)
- **Focus:**
  - End-to-end REST API flows across the authentication, organization, reference-data, incoming, outgoing, and document modules
  - Interaction between modules (Auth → User → Department → Document → Workflow → Notification)
  - Data persistence through Prisma transactions (book registration, processor assignment, workflow history)
  - Role-based authorization across multi-step business flows
- **Acceptance Criteria:**
  - Every API endpoint returns the expected status code and response envelope for both success and failure paths
  - Data is persisted correctly between modules
  - Authorization rules (ADMIN bypass, creator bypass, workflow-history retention, XLC/PHXL/XDB processor gating) hold across the full flow

#### 1.2.3 User Acceptance Testing

- **In-charge:** Project owner / role-holders (with the test team coordinating)
- **Input / Time:** Integrated system after integration testing, on the deployed test environment (week 3-4)
- **Focus:**
  - End-to-end UI-driven scenarios covering the principal business workflows (login → incoming → outgoing → reporting) for each role.
  - Acceptance of role-specific behaviour, navigation and accessibility.
- **Acceptance Criteria:**
  - All 16 UAT scenarios pass on the first round.
  - Stakeholders (project owner / supervisor) sign off on every role scenario.

### 1.3 Testing Constraints and Assumptions

**Assumptions**

- Test requirements are based on the approved Software Requirement Specification (Report 3) and the Functional Specification (User Module).
- The test environment closely resembles the production environment (Windows 10/11, Node.js 18+, PostgreSQL 16, Google Chrome latest).
- Tesseract OCR resources (`tessdata/vie.traineddata`, `eng.traineddata`) are available locally for OCR test cases.
- The SMTP test account provides a sandbox inbox that captures every outgoing email (password-reset, outgoing-document dispatch) without delivering to real recipients.
- All four seed users (`admin`, `depthead01`, `specialist01`, `clerk01`) are available with their default passwords.

**Constraints**

- Limited testing time due to the fixed capstone schedule (the full test cycle must complete within the 4-week window described in §3.3).
- OCR pipeline depends on the Tesseract LSTM model and the system GPU/CPU; heavy OCR suites must be executed on a developer laptop with ≥ 8 GB RAM.
- Email delivery depends on the SMTP gateway availability; if the SMTP server is down, `sendEmail` is expected to throw but the underlying state mutation must still succeed (best-effort semantics).
- Performance / load testing is limited to simulated single-user load conditions; no multi-user concurrency benchmarking is in scope for this release.
- The signature verification utility supports PDF and OOXML (DOCX/XLSX/PPTX) files only; legacy `.doc` binary formats are out of scope.

---

## 2. Test Strategy

This section lists the testing types that will be applied, the test levels at which they are performed, and the supporting tools used in the project.

### 2.1 Testing Types

#### 2.1.1 Functional Testing

- **Objective:** To verify that every feature in §1.1.1 operates according to the specified requirements.
- **Technique:** Black-box testing based on use cases and functional requirements; test cases are derived from the Functional Specification (User Module) and the API contract.
- **Completion Criteria:** All functional test cases (integration + acceptance) are executed and pass with no critical defects remaining; all major defects are fixed and re-tested.

#### 2.1.2 Integration Testing

- **Objective:** To verify correct interaction and data flow between integrated modules (Auth, Organization, Reference Data, Documents, Incoming, Outgoing, Notifications).
- **Technique:** Incremental integration testing — bottom-up from auth and reference data up to incoming/outgoing workflow. Each API is exercised via Postman against the live test server with an isolated PostgreSQL schema.
- **Completion Criteria:** Every cross-module flow returns the expected data, persists the correct records, and respects role-based access control.

#### 2.1.3 User Acceptance Testing (UAT)

- **Objective:** To confirm that the system satisfies the end-to-end business expectations of each role (ADMIN, DEPARTMENT_HEAD, SPECIALIST, DOCUMENT_CLERK).
- **Technique:** Scenario-based testing performed by the four role-holders against the deployed UI.
- **Completion Criteria:** Each of the 16 UAT scenarios described in `report5_test_report.md` is approved by the team leader on behalf of the project owner.

#### 2.1.4 Non-Functional Testing

- **Objective:** To evaluate security, usability, and reliability attributes.
- **Technique:**
  - **Security:** manual verification of JWT enforcement, role middleware, file-upload MIME filter, password reset token hashing, absence of JWT disclosure in client URLs.
  - **Usability:** inspection of form validation, inline error messages, accessibility of buttons/labels.
  - **Reliability:** fault-injection on notification persistence (best-effort semantics), SMTP outage handling on outgoing dispatch.
- **Completion Criteria:** No major security or usability violations remain.

### 2.2 Test Levels

| Type of Tests            | Unit | Integration | Acceptance |
|--------------------------|:----:|:-----------:|:----------:|
| Functional Testing       |  ✓   |     ✓       |     ✓      |
| Integration Testing      |      |     ✓       |            |
| User Acceptance Testing  |      |             |     ✓      |
| Non-Functional Testing   |  ✓   |     ✓       |     ✓      |

Legend: ✓ indicates the test type is performed at the given test level.

### 2.3 Supporting Tools

| Purpose                | Tool                       | Vendor / In-house | Version  |
|------------------------|----------------------------|-------------------|----------|
| Unit Testing (backend) | Vitest                     | Open-source       | Latest   |
| Unit Testing (frontend)| Vitest + Testing Library   | Open-source       | Latest   |
| API Testing            | Postman                    | Open-source       | Latest   |
| OCR Engine             | Tesseract.js (vie+eng)     | Open-source       | 5.x      |
| Test Case Management   | Microsoft Excel            | Microsoft         | 365      |
| Bug Tracking           | GitHub Issues              | GitHub            | Latest   |
| Version Control        | Git + GitHub               | Open-source       | Latest   |
| Browser Testing        | Google Chrome              | Google            | Latest   |
| Database Inspection    | pgAdmin                    | Open-source       | 4.x      |
| Mail Sandbox           | Mailtrap / SMTP sandbox    | Third-party       | Latest   |

---

## 3. Test Plan

### 3.1 Human Resources

| Worker / Doer | Role                              | Specific Responsibilities / Comments                                                                                       |
|---------------|-----------------------------------|----------------------------------------------------------------------------------------------------------------------------|
| Member A      | Team Leader + Test Lead           | Plans testing activities, prepares test strategy, coordinates testing tasks, runs UAT scenarios, reviews all reports.        |
| Member B      | Developer + Unit Tester           | Implements features, designs and executes unit tests (backend helpers), supports integration tests for Auth & Documents.   |
| Member C      | Developer + Integration Tester    | Implements features, prepares test data, executes integration tests for Incoming & Outgoing modules, runs UAT scenarios.   |
| Member D      | Developer + UI / Functional Tester | Implements features, executes functional test cases on the UI, supports defect verification and regression tests.          |
| Capstone Supervisor | Reviewer / Approver         | Reviews the test strategy and approves the final test reports on behalf of the project owner.                               |

### 3.2 Test Environment

| Purpose                | Tool / Stack                             | Provider         | Version     |
|------------------------|------------------------------------------|------------------|-------------|
| Operating System       | Windows 10 / 11                         | Microsoft        | 22H2        |
| Web Browser            | Google Chrome                            | Google           | Latest      |
| Backend Runtime        | Node.js                                  | OpenJS Foundation| 18+ LTS     |
| Backend Framework      | Express                                  | Open-source      | 4.x         |
| ORM                    | Prisma                                   | Open-source      | 5.x         |
| Database               | PostgreSQL                               | PostgreSQL       | 16          |
| Frontend Framework     | React + Vite                             | Open-source      | 18 / 5.x    |
| IDE                    | Visual Studio Code                       | Microsoft        | Latest      |
| API Testing            | Postman                                  | Open-source      | Latest      |
| Unit Testing           | Vitest                                   | Open-source      | Latest      |
| OCR                    | Tesseract.js                             | Open-source      | 5.x         |
| Bug Tracking           | GitHub Issues                            | GitHub           | Latest      |
| Test Case Management   | Microsoft Excel                          | Microsoft        | 365         |
| Email Sandbox          | SMTP sandbox / Mailtrap                  | Third-party      | Latest      |

### 3.3 Test Milestones

| Milestone                      | Task                          | Start Date  | End Date    |
|--------------------------------|-------------------------------|-------------|-------------|
| Test Planning                  | Prepare strategy & plan       | 04/08/2026  | 06/08/2026  |
| Unit Testing                   | Backend + Frontend units      | 07/08/2026  | 14/08/2026  |
| Integration Testing            | API end-to-end flows          | 15/08/2026  | 21/08/2026  |
| User Acceptance Testing        | Role-based scenarios          | 22/08/2026  | 27/08/2026  |
| Test Closure & Reporting       | Finalise reports              | 28/08/2026  | 30/08/2026  |

---

## 4. Test Cases

The detailed test cases are provided in the following files:

- **Unit Test Cases:** `report5_unit_test.md` (covers 34 unit test cases across `document-access.ts`, urgency / confidentiality resolvers, normalization helpers, notification service, `generateDocumentNumber`, and key frontend form / component guards).
- **Integration / Acceptance Test Cases:** `report5_test_report.md` (covers 24 integration cases and 16 UAT cases organised by feature).

---

## 5. Test Reports

A consolidated view of the test results is provided below. The full test reports (per-feature test sheets, statistics, defect summary, analysis, conclusion) are in `report5_test_report.md` and `report5_unit_test.md`.

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

### 5.3 Test Analysis

- All defects raised during integration testing were resolved within the integration test window; retest passed.
- The OCR pipeline was verified end-to-end on the sample Vietnamese administrative documents in `image-test/`; all happy-path and sad-path assertions matched expectations.
- Authorization rules were exercised across every role at the API and UI layers; no bypass was detected.
- Notification fan-out was verified to be best-effort and never blocks the primary transaction.

### 5.4 Test Conclusion

Based on the test results, the SEP490_25 Document Management System with OCR satisfies the functional and non-functional requirements specified in the Software Requirement Specification (Report 3) and the Functional Specification (User Module). The system is considered stable and acceptable for deployment to the production environment.