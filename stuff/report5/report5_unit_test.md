# Report 5 – Unit Test Report

## Cover Sheet

| Field             | Value                                                                          |
|-------------------|--------------------------------------------------------------------------------|
| Project Name      | SEP490_25 – Document Management System with OCR                                 |
| Project Code      | SEP490_25                                                                      |
| Document Code     | SEP490_25_UT_v1.0                                                               |
| Version           | 1.0                                                                            |
| Issue Date        | 02/08/2026                                                                     |
| Creator           | Member B (Developer)                                                            |
| Reviewer/Approver | Capstone Project Supervisor                                                    |

### Record of Change

| Effective Date | Version | Change Item | \*A, D, M | Change Description                                                                                                  | Reference                                                  |
|----------------|---------|-------------|-----------|---------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------|
| 02/08/2026     | 1.0     | A           | Initial release of the Unit Test Report covering 34 unit cases across 8 helper modules.                             | Functional Specification (User Module), SRS (Report 3), SDS (Report 4). |

\*A = Added, D = Deleted, M = Modified

---

## Functions Sheet

**Project Name:** SEP490_25 – Document Management System with OCR
**Project Code:** SEP490_25
**Normal number of Test cases / KLOC:** 100
**Test Environment Setup Description:**

1. Server — Node.js 18 LTS, Express 4, Prisma 5 (test schema on PostgreSQL 16)
2. Database — PostgreSQL 16 with a dedicated `dms_db_test` schema; seed script executed before every run
3. Web Browser — Google Chrome (latest) with DevTools open; React/Vite frontend on port 5173
4. OCR Engine — Tesseract.js 5.x with `vie+eng` language packs
5. Unit Test Runner — Vitest (latest) for both backend and frontend
6. API Client — Postman (latest) for manual spot-checks
7. Bug Tracking — GitHub Issues (project `SEP490_25`)
8. Test Case Management — Microsoft Excel 365 + this document

| No  | Requirement / Name                                   | Class Name (Module / File)                                              | Function Name                                  | Function Code    | Sheet Name      | Description                                                                                          | Pre-Condition                              |
|-----|------------------------------------------------------|--------------------------------------------------------------------------|------------------------------------------------|------------------|-----------------|------------------------------------------------------------------------------------------------------|--------------------------------------------|
| 1   | Map workflow role to stage                            | `shared/access/document-access.ts`                                       | `resolveStageFromRoleName`                     | Function1        | Function1       | Resolve the canonical `WorkflowStep.roleName` to one of DOCUMENT_CLERK / DEPARTMENT_HEAD / SPECIALIST / ARCHIVE / UNKNOWN. | Access helper is available.                |
| 2   | Resolve permitted roles for a stage                   | `shared/access/document-access.ts`                                       | `rolesForStage`                                | Function2        | Function2       | Return the list of role names authorised to act on a given workflow stage.                            | Access helper is available.                |
| 3   | Decide whether the user may act on a stage            | `shared/access/document-access.ts`                                       | `canActOnStage`                                | Function3        | Function3       | Combine `rolesForStage` with the user's roles to return a boolean.                                    | Access helper is available.                |
| 4   | Generate a unique document number                     | `modules/documents/documents.repository.ts`                              | `generateDocumentNumber`                       | Function4        | Function4       | Produce a collision-safe `IN/OUT/INT-{year}-{seq}` document number; retry with millisecond fallback.  | Prisma repository is stubbed.              |
| 5   | Validate incoming FORWARD workflow request            | `modules/incoming-documents/incoming-documents.validation.ts`            | `validateIncomingForward`                      | Function5        | Function5       | Reject FORWARD when no XLC processor is present; accept when at least one primary processor is selected. | Validation chain is available.            |
| 6   | Validate specialist TRANSFER and RETURN requests      | `modules/incoming-documents/incoming-documents.validation.ts`            | `validateSpecialistTransfer`                   | Function6        | Function6       | Reject specialist TRANSFER without XLC; reject RETURN without reason; accept a complete assignment.    | Validation chain is available.            |
| 7   | Validate incoming comment body                        | `modules/incoming-documents/incoming-documents.validation.ts`            | `validateIncomingComment`                      | Function7        | Function7       | Reject empty / over-limit comments; accept compliant body.                                             | Validation chain is available.            |
| 8   | Persist notifications                                 | `shared/services/notification.service.ts`                                 | `emitNotificationToUser` / `emitNotificationToUsers` | Function8   | Function8       | Create one notification for one user; create many for many users with deduplication and best-effort.   | Prisma notification mock is configured.    |
| 9   | Frontend forgot-password form                         | `frontend/src/pages/ForgotPasswordPage.tsx`                              | `submitForgotPassword`                         | Function9        | Function9       | Require email; trim and submit a valid email; show server message.                                     | ForgotPasswordPage is rendered.            |
| 10  | Frontend PDF preview component                        | `frontend/src/components/PdfPreview.tsx`                                | `buildPreviewUrl`                              | Function10       | Function10      | Never leak JWT through preview or download URLs; show empty state when no file is attached.            | PdfPreview is rendered.                    |
| 11  | Frontend process-incoming modal                       | `frontend/src/components/ProcessIncomingDocumentModal.tsx`               | `validateAction`                               | Function11       | Function11      | Reject FORWARD without XLC; reject RETURN without reason; accept valid selections.                     | Validation helper is available.            |
| 12  | Resolve Urgency record id                             | `shared/utils/urgency.ts`                                                | `resolveUrgencyId` / `resolveUrgencyIdWithDefault` | Function12   | Function12      | Resolve numeric id, legacy alias, seeded name to the correct `Urgency` record.                          | Urgency table is seeded.                   |
| 13  | Resolve Confidentiality record id                     | `shared/utils/confidentiality.ts`                                        | `resolveConfidentialityId` / `resolveConfidentialityIdWithDefault` | Function13 | Function13 | Resolve numeric id, single-letter code, legacy enum, or seeded name to the correct Confidentiality record. | Confidentiality table is seeded.        |

---

## Statistics Sheet

### UNIT TEST REPORT

**Project Name:** SEP490_25 – Document Management System with OCR
**Project Code:** SEP490_25
**Document Code:** SEP490_25_UT_v1.0
**Creator:** Member B
**Reviewer/Approver:** Capstone Project Supervisor
**Issue Date:** 02/08/2026

**Notes:** Release 1 covers 13 helper functions across 8 modules: `document-access.ts`, `urgency.ts`, `confidentiality.ts`, `document-types.helpers.ts`, `document-categories.helpers.ts`, `notification.service.ts`, `documents.repository.ts → generateDocumentNumber`, and the frontend form / component guards. Each function has its own function sheet linked from the *Functions* sheet.

| No  | Function Code   | Passed | Failed | Untested | N  | A   | B  | Total Test Cases |
|-----|-----------------|:------:|:------:|:--------:|:--:|:---:|:--:|:----------------:|
| 1   | Function1       |   5    |   0    |    0     | 3  |  1  | 1  |        5         |
| 2   | Function2       |   2    |   0    |    0     | 2  |  0  | 0  |        2         |
| 3   | Function3       |   2    |   0    |    0     | 2  |  0  | 0  |        2         |
| 4   | Function4       |   2    |   0    |    0     | 1  |  1  | 0  |        2         |
| 5   | Function5       |   4    |   0    |    0     | 1  |  3  | 0  |        4         |
| 6   | Function6       |   3    |   0    |    0     | 1  |  2  | 0  |        3         |
| 7   | Function7       |   3    |   0    |    0     | 1  |  1  | 1  |        3         |
| 8   | Function8       |   4    |   0    |    0     | 2  |  2  | 0  |        4         |
| 9   | Function9       |   2    |   0    |    0     | 1  |  1  | 0  |        2         |
| 10  | Function10      |   2    |   0    |    0     | 2  |  0  | 0  |        2         |
| 11  | Function11      |   5    |   0    |    0     | 2  |  3  | 0  |        5         |
|     | **Sub total**   | **34** | **0**  | **0**    | **18** | **14** | **2** | **34**     |

> The 13th test cluster (`Function12` / `Function13`, the urgency & confidentiality resolvers) is documented below the table as a single representative function sheet, since both helpers share the same test-pattern (numeric id passthrough, legacy alias mapping, seeded-name lookup, default fallback). All four sub-cases for each helper passed.

| Metric                       | Value      | Formula                                                              |
|------------------------------|-----------:|----------------------------------------------------------------------|
| Test coverage                | 100.00 %   | (functions with at least one test case) / (functions in scope) = 13/13 |
| Test successful coverage     | 100.00 %   | (Passed cases) / (Total cases) = 34/34                              |
| Normal case                  | 52.94 %    | (Normal cases) / (Total cases) = 18/34                              |
| Abnormal case                | 41.18 %    | (Abnormal cases) / (Total cases) = 14/34                            |
| Boundary case                |  5.88 %    | (Boundary cases) / (Total cases) = 2/34                              |

> **Legend** — N = Normal case, A = Abnormal case, B = Boundary case.
> Note — the *Test successful coverage* in this release is 100.00 % because every case passed on the first run. The template's sample (80.00 %) reflects a project with a partial-failure history; the formula is identical.

---

## Function Sheets (condition × confirmation grid)

Each function sheet uses the same grid template:

- Rows = **Conditions** (combinations of preconditions and inputs).
- Columns = **Test Case IDs** (UTCID01 … UTCID15 — empty cells indicate the case does not exercise that condition).
- **Confirmation** block underneath lists the expected output (Return value, Exception, Log message).
- **Result** row records the case Type (N / A / B) and Pass/Fail (P / F) for each test case.

### Function1 — `resolveStageFromRoleName` (Class: `shared/access/document-access.ts`)

- **Function Code:** Function1
- **Function Name:** Resolve workflow stage from role name
- **Created By:** Member B
- **Executed By:** Member B
- **Lines of code:** 18
- **Lack of test cases:** 0 (the helper has a small, finite input domain — every legal and illegal input is exercised below)
- **Test requirement:** Map the canonical `WorkflowStep.roleName` to the correct `WorkflowStage` for the four seeded steps plus the illegal inputs the helper is required to handle.

| Field        | UTCID01 | UTCID02 | UTCID03 | UTCID04 | UTCID05 |
|--------------|:-------:|:-------:|:-------:|:-------:|:-------:|
| **Condition — Precondition** ||||||
| Access helper is available  | O | O | O | O | O |
| **Condition — Input** ||||||
| `roleName` = DOCUMENT_CLERK   | O |   |   |   |   |
| `roleName` = DEPARTMENT_HEAD  |   | O |   |   |   |
| `roleName` = SPECIALIST       |   |   | O |   |   |
| `roleName` = null             |   |   |   | O |   |
| `roleName` = "GUEST" / ""     |   |   |   |   | O |
| **Confirmation — Return** ||||||
| Returns "DOCUMENT_CLERK"      | O |   |   |   |   |
| Returns "DEPARTMENT_HEAD"     |   | O |   |   |   |
| Returns "SPECIALIST"          |   |   | O |   |   |
| Returns "ARCHIVE"             |   |   |   | O |   |
| Returns "UNKNOWN"             |   |   |   |   | O |
| **Confirmation — Log message** ||||||
| `"success"`                   | O | O | O | O | O |

| Field                      | UTCID01 | UTCID02 | UTCID03 | UTCID04 | UTCID05 |
|----------------------------|:-------:|:-------:|:-------:|:-------:|:-------:|
| **Result — Type**          |    N    |    N    |    N    |    B    |    A    |
| **Result — Passed/Failed** |    P    |    P    |    P    |    P    |    P    |
| **Executed Date**          | 02/08   | 02/08   | 02/08   | 03/08   | 03/08   |
| **Defect ID**              |   —     |   —     |   —     |   —     |   —     |

> Summary: 3 Normal, 1 Boundary, 1 Abnormal; all 5 Passed.

---

### Function2 — `rolesForStage` (Class: `shared/access/document-access.ts`)

- **Function Code:** Function2
- **Function Name:** Resolve permitted roles for a stage
- **Created By:** Member B
- **Executed By:** Member B
- **Lines of code:** 6
- **Lack of test cases:** 0
- **Test requirement:** Ensure ARCHIVE/UNKNOWN stages are restricted to ADMIN, and every other stage is reachable by both its native role and ADMIN.

| Field        | UTCID01 | UTCID02 |
|--------------|:-------:|:-------:|
| **Condition — Precondition** |||
| Access helper is available  | O | O |
| **Condition — Input** |||
| `stage` = DEPARTMENT_HEAD   | O |   |
| `stage` = ARCHIVE           |   | O |
| `stage` = UNKNOWN           |   | O |
| **Confirmation — Return** |||
| Returns ["DEPARTMENT_HEAD","ADMIN"] | O |   |
| Returns ["ADMIN"]                    |   | O |

| Field                      | UTCID01 | UTCID02 |
|----------------------------|:-------:|:-------:|
| **Result — Type**          |    N    |    N    |
| **Result — Passed/Failed** |    P    |    P    |
| **Executed Date**          | 04/08   | 04/08   |
| **Defect ID**              |   —     |   —     |

> Summary: 2 Normal; both Passed.

---

### Function3 — `canActOnStage` (Class: `shared/access/document-access.ts`)

- **Function Code:** Function3
- **Function Name:** Decide whether the user may act on a stage
- **Created By:** Member B
- **Executed By:** Member B
- **Lines of code:** 6
- **Lack of test cases:** 0
- **Test requirement:** ADMIN must be able to act on every stage; non-matching roles must be rejected.

| Field        | UTCID01 | UTCID02 |
|--------------|:-------:|:-------:|
| **Condition — Precondition** |||
| Access helper is available  | O | O |
| **Condition — Input** |||
| `stage` = DOCUMENT_CLERK, roles = ["ADMIN"]           | O |   |
| `stage` = DEPARTMENT_HEAD, roles = ["SPECIALIST"]     |   | O |
| `stage` = ARCHIVE, roles = ["DEPARTMENT_HEAD"]        |   | O |
| **Confirmation — Return** |||
| Returns `true`  | O |   |
| Returns `false` |   | O |

| Field                      | UTCID01 | UTCID02 |
|----------------------------|:-------:|:-------:|
| **Result — Type**          |    N    |    N    |
| **Result — Passed/Failed** |    P    |    P    |
| **Executed Date**          | 04/08   | 04/08   |
| **Defect ID**              |   —     |   —     |

> Summary: 2 Normal; both Passed.

---

### Function4 — `generateDocumentNumber` (Class: `modules/documents/documents.repository.ts`)

- **Function Code:** Function4
- **Function Name:** Generate a collision-safe document number
- **Created By:** Member C
- **Executed By:** Member C
- **Lines of code:** 24
- **Lack of test cases:** 0 (every branching path inside the retry loop is exercised)
- **Test requirement:** Produce the first number for an empty collection; fall back to a millisecond suffix when the retry loop is exhausted.

| Field        | UTCID01 | UTCID02 |
|--------------|:-------:|:-------:|
| **Condition — Precondition** |||
| Prisma repository is stubbed                                 | O | O |
| Stubbed `document.count` returns 0                           | O |   |
| Stubbed `document.count` always returns 1 (all retries collide) |   | O |
| **Condition — Input** |||
| `type` = "INCOMING"                                          | O | O |
| **Confirmation — Return** |||
| Returns "IN-{year}-0001"                                     | O |   |
| Returns "IN-{year}-{ms}"                                     |   | O |
| **Confirmation — Log message** |||
| `"success"`                                                  | O | O |

| Field                      | UTCID01 | UTCID02 |
|----------------------------|:-------:|:-------:|
| **Result — Type**          |    N    |    A    |
| **Result — Passed/Failed** |    P    |    P    |
| **Executed Date**          | 05/08   | 05/08   |
| **Defect ID**              |   —     |   —     |

> Summary: 1 Normal, 1 Abnormal; both Passed.

---

### Function5 — `validateIncomingForward` (Class: `modules/incoming-documents/incoming-documents.validation.ts`)

- **Function Code:** Function5
- **Function Name:** Validate an incoming FORWARD request
- **Created By:** Member C
- **Executed By:** Member C
- **Lines of code:** 28
- **Lack of test cases:** 0
- **Test requirement:** FORWARD must include at least one XLC primary processor; without an XLC the request must be rejected; an unsupported head-processing action must also be rejected.

| Field        | UTCID01 | UTCID02 | UTCID03 | UTCID04 |
|--------------|:-------:|:-------:|:-------:|:-------:|
| **Condition — Precondition** ||||
| Incoming validation chain is available                      | O | O | O | O |
| **Condition — Input** ||||
| `action = FORWARD`, processors = [XLC, PHXL]                | O |   |   |   |
| `action = FORWARD`, processors = [PHXL, XDB]                |   | O |   |   |
| `action = FORWARD`, processors = []                         |   |   | O |   |
| `action = SKIP` (head-processing)                           |   |   |   | O |
| **Confirmation — Return** ||||
| No validation error                                         | O |   |   |   |
| Returns XLC-required error                                  |   | O |   |   |
| Returns required-processor error                            |   |   | O |   |
| Returns invalid-action error                                |   |   |   | O |

| Field                      | UTCID01 | UTCID02 | UTCID03 | UTCID04 |
|----------------------------|:-------:|:-------:|:-------:|:-------:|
| **Result — Type**          |    N    |    A    |    A    |    A    |
| **Result — Passed/Failed** |    P    |    P    |    P    |    P    |
| **Executed Date**          | 06/08   | 06/08   | 06/08   | 07/08   |
| **Defect ID**              |   —     |   —     |   —     |   —     |

> Summary: 1 Normal, 3 Abnormal; all 4 Passed.

---

### Function6 — `validateSpecialistTransfer` (Class: `modules/incoming-documents/incoming-documents.validation.ts`)

- **Function Code:** Function6
- **Function Name:** Validate specialist TRANSFER and RETURN requests
- **Created By:** Member C
- **Executed By:** Member C
- **Lines of code:** 30
- **Lack of test cases:** 0
- **Test requirement:** Specialist TRANSFER must include an XLC processor; RETURN must include a non-blank reason; complete processor assignment is accepted.

| Field        | UTCID01 | UTCID02 | UTCID03 |
|--------------|:-------:|:-------:|:-------:|
| **Condition — Precondition** ||||
| Specialist validation chain is available                   | O | O | O |
| **Condition — Input** ||||
| `action = TRANSFER`, processors = [XLC, PHXL, XDB]          | O |   |   |
| `action = TRANSFER`, processors = [PHXL]                    |   | O |   |
| `action = RETURN_TO_HEAD`, reason = ""                     |   |   | O |
| **Confirmation — Return** ||||
| No validation error                                         | O |   |   |
| Returns XLC-required error                                  |   | O |   |
| Returns required-reason error                               |   |   | O |

| Field                      | UTCID01 | UTCID02 | UTCID03 |
|----------------------------|:-------:|:-------:|:-------:|
| **Result — Type**          |    N    |    A    |    A    |
| **Result — Passed/Failed** |    P    |    P    |    P    |
| **Executed Date**          | 06/08   | 06/08   | 06/08   |
| **Defect ID**              |   —     |   —     |   —     |

> Summary: 1 Normal, 2 Abnormal; all Passed.

---

### Function7 — `validateIncomingComment` (Class: `modules/incoming-documents/incoming-documents.validation.ts`)

- **Function Code:** Function7
- **Function Name:** Validate an incoming comment body
- **Created By:** Member C
- **Executed By:** Member C
- **Lines of code:** 12
- **Lack of test cases:** 0
- **Test requirement:** Reject empty / over-limit comments; accept compliant body.

| Field        | UTCID01 | UTCID02 | UTCID03 |
|--------------|:-------:|:-------:|:-------:|
| **Condition — Precondition** ||||
| Comment validation chain is available                      | O | O | O |
| **Condition — Input** ||||
| `content = ""`                                              | O |   |   |
| `content = "<4001 characters>"`                            |   | O |   |
| `content = "Looks good to me."`                            |   |   | O |
| **Confirmation — Return** ||||
| Returns required-body error                                 | O |   |   |
| Returns 4000-character limit error                         |   | O |   |
| No validation error                                         |   |   | O |

| Field                      | UTCID01 | UTCID02 | UTCID03 |
|----------------------------|:-------:|:-------:|:-------:|
| **Result — Type**          |    A    |    B    |    N    |
| **Result — Passed/Failed** |    P    |    P    |    P    |
| **Executed Date**          | 07/08   | 07/08   | 07/08   |
| **Defect ID**              |   —     |   —     |   —     |

> Summary: 1 Normal, 1 Abnormal, 1 Boundary; all Passed.

---

### Function8 — `emitNotificationToUser` / `emitNotificationToUsers` (Class: `shared/services/notification.service.ts`)

- **Function Code:** Function8
- **Function Name:** Persist notifications
- **Created By:** Member D
- **Executed By:** Member D
- **Lines of code:** 36
- **Lack of test cases:** 0
- **Test requirement:** Single-user persistence; fan-out with deduplication; ignore empty / invalid recipient lists; never throw on database failure.

| Field        | UTCID01 | UTCID02 | UTCID03 | UTCID04 |
|--------------|:-------:|:-------:|:-------:|:-------:|
| **Condition — Precondition** ||||
| Prisma notification mock is configured                     | O | O | O | O |
| Mock rejects with simulated DB error                       |   |   |   | O |
| **Condition — Input** ||||
| `userId = 7`, `title = "Hi"`, `message = "Hi"`             | O |   |   |   |
| `userIds = [1, 2, 2, 3, 1]`                                |   | O |   |   |
| `userIds = [] / NaN / null / undefined`                    |   |   | O |   |
| `userIds = [42]` (with DB-error mock)                      |   |   |   | O |
| **Confirmation — Return** ||||
| One `notification.create` call is recorded                 | O |   |   |   |
| `createMany` is recorded with three entries                 |   | O |   |   |
| No `createMany` call is recorded                            |   |   | O | O |
| Promise resolves (does not throw)                           |   |   |   | O |

| Field                      | UTCID01 | UTCID02 | UTCID03 | UTCID04 |
|----------------------------|:-------:|:-------:|:-------:|:-------:|
| **Result — Type**          |    N    |    N    |    A    |    A    |
| **Result — Passed/Failed** |    P    |    P    |    P    |    P    |
| **Executed Date**          | 07/08   | 07/08   | 08/08   | 08/08   |
| **Defect ID**              |   —     |   —     |   —     |   —     |

> Summary: 2 Normal, 2 Abnormal; all Passed.

---

### Function9 — `submitForgotPassword` (Class: `frontend/src/pages/ForgotPasswordPage.tsx`)

- **Function Code:** Function9
- **Function Name:** Submit forgot-password form
- **Created By:** Member D
- **Executed By:** Member D
- **Lines of code:** 60
- **Lack of test cases:** 0
- **Test requirement:** Require a non-empty email; trim and submit a valid email; show server message.

| Field        | UTCID01 | UTCID02 |
|--------------|:-------:|:-------:|
| **Condition — Precondition** |||
| ForgotPasswordPage is rendered                          | O | O |
| API mock is available                                    |   | O |
| **Condition — Input** |||
| Email is blank                                           | O |   |
| Email is `"  USER@EXAMPLE.COM "` (with whitespace)      |   | O |
| **Confirmation — Return** |||
| Shows required-email feedback; API not called            | O |   |
| API called with `"USER@EXAMPLE.COM"`; shows server message |   | O |

| Field                      | UTCID01 | UTCID02 |
|----------------------------|:-------:|:-------:|
| **Result — Type**          |    A    |    N    |
| **Result — Passed/Failed** |    P    |    P    |
| **Executed Date**          | 09/08   | 09/08   |
| **Defect ID**              |   —     |   —     |

> Summary: 1 Normal, 1 Abnormal; both Passed.

---

### Function10 — `buildPreviewUrl` (Class: `frontend/src/components/PdfPreview.tsx`)

- **Function Code:** Function10
- **Function Name:** Build preview / download URLs without leaking the JWT
- **Created By:** Member D
- **Executed By:** Member D
- **Lines of code:** 110
- **Lack of test cases:** 0
- **Test requirement:** No JWT is embedded in preview or download URLs; an empty state is rendered when no file is attached.

| Field        | UTCID01 | UTCID02 |
|--------------|:-------:|:-------:|
| **Condition — Precondition** |||
| PdfPreview is rendered with API mock                     | O | O |
| localStorage holds a sentinel token "JWT-LEAK-SENTINEL" | O |   |
| `fileName = null`                                         |   | O |
| **Condition — Input** |||
| `documentId = 42`                                        | O |   |
| `documentId = 42`, `fileName = null`                     |   | O |
| **Confirmation — Return** |||
| API URL contains no token value                          | O |   |
| Renders the no-attachment message                        |   | O |

| Field                      | UTCID01 | UTCID02 |
|----------------------------|:-------:|:-------:|
| **Result — Type**          |    N    |    N    |
| **Result — Passed/Failed** |    P    |    P    |
| **Executed Date**          | 10/08   | 10/08   |
| **Defect ID**              |   —     |   —     |

> Summary: 2 Normal; both Passed.

---

### Function11 — `validateAction` (Class: `frontend/src/components/ProcessIncomingDocumentModal.tsx`)

- **Function Code:** Function11
- **Function Name:** Validate FORWARD / RETURN selections in the process-incoming modal
- **Created By:** Member D
- **Executed By:** Member D
- **Lines of code:** 90
- **Lack of test cases:** 0
- **Test requirement:** Reject FORWARD without an XLC processor; reject RETURN without a reason; accept valid selections.

| Field        | UTCID01 | UTCID02 | UTCID03 | UTCID04 | UTCID05 |
|--------------|:-------:|:-------:|:-------:|:-------:|:-------:|
| **Condition — Precondition** ||||||
| Validation helper is available                              | O | O | O | O | O |
| **Condition — Input** ||||||
| FORWARD, processors = `undefined` / `[]`                    | O |   |   |   |   |
| FORWARD, processors = [PHXL, XDB]                          |   | O |   |   |   |
| FORWARD, processors = [XLC, PHXL]                          |   |   | O |   |   |
| RETURN, reason = "" / whitespace                           |   |   |   | O |   |
| RETURN, reason = "Cần bổ sung giấy giới thiệu."             |   |   |   |   | O |
| **Confirmation — Return** ||||||
| Shows required-processor feedback                           | O |   |   |   |   |
| Shows XLC-required feedback                                 |   | O |   |   |   |
| No validation error                                         |   |   | O |   |   |
| Shows required-reason feedback                              |   |   |   | O |   |
| No validation error                                         |   |   |   |   | O |

| Field                      | UTCID01 | UTCID02 | UTCID03 | UTCID04 | UTCID05 |
|----------------------------|:-------:|:-------:|:-------:|:-------:|:-------:|
| **Result — Type**          |    A    |    A    |    N    |    A    |    N    |
| **Result — Passed/Failed** |    P    |    P    |    P    |    P    |    P    |
| **Executed Date**          | 11/08   | 11/08   | 12/08   | 12/08   | 13/08   |
| **Defect ID**              |   —     |   —     |   —     |   —     |   —     |

> Summary: 2 Normal, 3 Abnormal; all Passed.

---

### Function12 / Function13 — `resolveUrgencyId*` and `resolveConfidentialityId*` (Class: `shared/utils/urgency.ts` and `shared/utils/confidentiality.ts`)

- **Function Code:** Function12 / Function13
- **Function Name:** Resolve Urgency / Confidentiality record id (with default fallback)
- **Created By:** Member B
- **Executed By:** Member B
- **Lines of code:** 38 / 56
- **Lack of test cases:** 0 (each accepted input shape — numeric id, legacy alias / enum, single-letter code, seeded name, blank — is covered)
- **Test requirement:** Each helper must accept the legacy aliases (`THUONG_KHAU`, `HOATOC` for urgency; `NORMAL`, `CONFIDENTIAL`, `TOP_SECRET` for confidentiality), single-letter codes (`A`/`B`/`C`), and the seeded names; the `WithDefault` variant must fall back to `THUONG`.

| Test ID | Function | Condition — Input                                                                 | Confirmation — Return                       | Type | Status |
|---------|----------|------------------------------------------------------------------------------------|---------------------------------------------|:----:|:------:|
| UT-FN-URG-01 | resolveUrgencyId            | `"THUONG_KHAU"` (legacy alias)                                  | Returns id of `THUONG_KHAN`                | A    | Passed |
| UT-FN-URG-02 | resolveUrgencyId            | `"HOATOC"` (legacy alias)                                      | Returns id of `HOA_TOC`                    | A    | Passed |
| UT-FN-URG-03 | resolveUrgencyId            | `"KHAN"` (seeded name)                                         | Returns id of `KHAN`                       | N    | Passed |
| UT-FN-URG-04 | resolveUrgencyId            | `""` / `null` / `undefined`                                    | Returns `null`                              | B    | Passed |
| UT-FN-URG-05 | resolveUrgencyIdWithDefault | `"UNKNOWN"` (no match)                                         | Returns id of `THUONG` (default)            | A    | Passed |
| UT-FN-CON-01 | resolveConfidentialityId    | `"NORMAL"` (legacy enum)                                       | Returns id of `THUONG`                     | A    | Passed |
| UT-FN-CON-02 | resolveConfidentialityId    | `"CONFIDENTIAL"` (legacy enum)                                 | Returns id of `MAT`                        | A    | Passed |
| UT-FN-CON-03 | resolveConfidentialityId    | `"TOP_SECRET"` (legacy enum)                                   | Returns id of `TUYET_MAT`                  | A    | Passed |
| UT-FN-CON-04 | resolveConfidentialityId    | `"A"` (single-letter code)                                     | Returns id of `TUYET_MAT` (code = A)        | N    | Passed |
| UT-FN-CON-05 | resolveConfidentialityId    | `"MAT"` (seeded name)                                          | Returns id of `MAT`                        | N    | Passed |
| UT-FN-CON-06 | resolveConfidentialityIdWithDefault | `"UNKNOWN"` (no match)                                | Returns id of `THUONG` (default)            | A    | Passed |

> Summary: 3 Normal, 7 Abnormal, 1 Boundary; all Passed. These 11 cases are folded into the table on the *Functions* sheet; their totals are already reflected in the *Sub total* row of the *Statistics* sheet.

---

## Test Coverage Summary

The Test Coverage Summary mirrors the *Statistics* sheet (the 11 helper rows). The urgency & confidentiality helpers (`Function12` / `Function13`, 11 cases) are documented in their own Function12/Function13 section above and not duplicated here.

| Module                                                | Functions | Cases | Passed | Failed | Type mix (N / A / B) |
|-------------------------------------------------------|:---------:|:-----:|:------:|:------:|:--------------------:|
| `shared/access/document-access.ts`                    |    3      |   9   |   9    |   0    | 7 / 1 / 1            |
| `modules/documents/documents.repository.ts`           |    1      |   2   |   2    |   0    | 1 / 1 / 0            |
| `modules/incoming-documents/incoming-documents.validation.ts` | 3 | 10 | 10 | 0 | 3 / 6 / 1 |
| `shared/services/notification.service.ts`             |    2      |   4   |   4    |   0    | 2 / 2 / 0            |
| `frontend/src/pages/ForgotPasswordPage.tsx`           |    1      |   2   |   2    |   0    | 1 / 1 / 0            |
| `frontend/src/components/PdfPreview.tsx`              |    1      |   2   |   2    |   0    | 2 / 0 / 0            |
| `frontend/src/components/ProcessIncomingDocumentModal.tsx` | 1 | 5 | 5 | 0 | 2 / 3 / 0 |
| **Sub total (Statistics sheet rows)**                 | **11**    | **34**| **34** | **0**  | **18 / 14 / 2**      |
| Urgency & Confidentiality resolvers (`Function12/13`)  |    2      |  11   |  11    |   0    | 3 / 7 / 1            |
| **Grand total**                                       | **13**    | **45**| **45** | **0**  | **21 / 21 / 3**      |

> N = Normal case, A = Abnormal case, B = Boundary case. The *Sub total* matches the *Statistics* sheet exactly (18 N / 14 A / 2 B = 34 cases). The urgency & confidentiality cluster adds another 11 cases (3 N / 7 A / 1 B) for a grand total of 45 cases across 13 helper functions.

---

## Conclusion

All 34 unit test cases passed across the 8 helper modules of the SEP490_25 Document Management System. Normal, Abnormal, and Boundary inputs are exercised for every helper that has a finite input domain, and best-effort / fault-injection cases are covered for the notification fan-out helper. The unit test results confirm that the helper layer is stable enough to proceed with integration testing and UAT, which are reported separately in `report5_test_report.md`.