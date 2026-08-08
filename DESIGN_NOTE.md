# Design Note: Register vs Issue Workflow Separation

## Question for Supervisor

> **Status:** ⏳ Pending confirmation from supervisor/teacher before implementation.

---

## Current Workflow

```
APPROVED → WAITING_FOR_ISSUE → ISSUED
```

When a document reaches `WAITING_FOR_ISSUE` (forwarded by Department Head to Document Clerk),
the clerk can perform **both** actions in a single step when clicking "Issue":
- Enter dispatch number (Số phát hành)
- Enter issuance date (Ngày ban hành)
- Enter urgency level (Độ khẩn)
- Enter confidentiality level (Độ mật)
- Enter recipient info

This combines "Register" (Vào sổ) and "Issue" (Ban hành) into one action.

---

## Proposed Alternative: Two-Step Workflow

```
APPROVED → WAITING_FOR_ISSUE → REGISTERED → ISSUED
```

| Step | Action | Actor | Description |
|------|--------|-------|-------------|
| `WAITING_FOR_ISSUE → REGISTERED` | Register (Vào sổ) | DOCUMENT_CLERK | Assign dispatch number, issuance date, urgency, confidentiality, recipient info |
| `REGISTERED → ISSUED` | Issue (Ban hành) | DOCUMENT_CLERK | Officially publish the document after registration is complete |

### Pros of separating
- More granular audit trail (SystemLog)
- Clerk can register first, review, then formally issue
- Matches real-world administrative practice more closely

### Cons of separating
- Requires adding a new `REGISTERED` status to the database enum
- Requires schema migration
- More complex UI (additional modal/step)
- May be unnecessary if the process is simple enough

---

## Implementation Impact (if separated)

### Backend
- `schema.prisma`: Add `REGISTERED` to `DocumentStatus` enum
- `schema.prisma`: Add `registeredAt DateTime?` and `registeredBy Int?` to `OutgoingDocument`
- `outgoing-documents.service.ts`: Update `VALID_TRANSITIONS`:
  ```
  WAITING_FOR_ISSUE: ['REGISTERED', 'TRASHED']  // was: ['ISSUED', 'TRASHED']
  REGISTERED: ['ISSUED', 'TRASHED']              // new
  ```
- Run `prisma migrate dev`

### Frontend
- `OutgoingDocumentDetailPage.tsx`: Add new button "📋 Vào sổ" for `WAITING_FOR_ISSUE` status
- Add `REGISTERED` to status map and STATUS_LABEL
- History timeline: add "Vào sổ" step

---

## Decision

- [ ] **Keep as-is** (single step: WAITING_FOR_ISSUE → ISSUED)
- [ ] **Separate into two steps** (WAITING_FOR_ISSUE → REGISTERED → ISSUED)

> Please confirm with supervisor before starting implementation.
