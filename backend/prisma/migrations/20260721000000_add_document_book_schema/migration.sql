-- Migration: add_document_book_schema
-- Adds DocumentBook, IncomingBookEntry, OutgoingBookEntry models
-- Adds REGISTERED status to DocumentStatus enum
-- Adds documentBookId FK to IncomingDocument and OutgoingDocument

-- 1. Add REGISTERED to DocumentStatus enum
ALTER TYPE "DocumentStatus" ADD VALUE IF NOT EXISTS 'REGISTERED' AFTER 'APPROVED';

-- 2. Add DocumentBookType enum
DO $$ BEGIN
    CREATE TYPE "DocumentBookType" AS ENUM ('INCOMING', 'OUTGOING');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. Add DocumentBookStatus enum
DO $$ BEGIN
    CREATE TYPE "DocumentBookStatus" AS ENUM ('ACTIVE', 'CLOSED', 'INACTIVE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 4. Create DocumentBook table
CREATE TABLE IF NOT EXISTS "DocumentBook" (
    "id"            SERIAL PRIMARY KEY,
    "name"          TEXT NOT NULL,
    "code"          TEXT,
    "description"   TEXT,
    "bookType"      "DocumentBookType" NOT NULL,
    "year"          INTEGER NOT NULL,
    "currentNumber" INTEGER NOT NULL DEFAULT 0,
    "isDefault"     BOOLEAN NOT NULL DEFAULT false,
    "status"        "DocumentBookStatus" NOT NULL DEFAULT 'ACTIVE',
    "departmentId"  INTEGER NOT NULL,
    "createdById"   INTEGER NOT NULL,
    "openedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt"      TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocumentBook_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DocumentBook_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DocumentBook_departmentId_bookType_year_name_key" UNIQUE ("departmentId", "bookType", "year", "name")
);

CREATE INDEX IF NOT EXISTS "DocumentBook_departmentId_bookType_year_status_idx" ON "DocumentBook"("departmentId", "bookType", "year", "status");
CREATE INDEX IF NOT EXISTS "DocumentBook_isDefault_idx" ON "DocumentBook"("isDefault");

-- 5. Add documentBookId FK to IncomingDocument
ALTER TABLE "IncomingDocument" ADD COLUMN IF NOT EXISTS "documentBookId" INTEGER;
ALTER TABLE "IncomingDocument" ADD CONSTRAINT "IncomingDocument_documentBookId_fkey"
    FOREIGN KEY ("documentBookId") REFERENCES "DocumentBook"("id") ON DELETE SET NULL ON UPDATE CASCADE
    NOT VALID;
CREATE INDEX IF NOT EXISTS "IncomingDocument_documentBookId_idx" ON "IncomingDocument"("documentBookId");

-- 6. Add documentBookId FK to OutgoingDocument
ALTER TABLE "OutgoingDocument" ADD COLUMN IF NOT EXISTS "documentBookId" INTEGER;
ALTER TABLE "OutgoingDocument" ADD CONSTRAINT "OutgoingDocument_documentBookId_fkey"
    FOREIGN KEY ("documentBookId") REFERENCES "DocumentBook"("id") ON DELETE SET NULL ON UPDATE CASCADE
    NOT VALID;
CREATE INDEX IF NOT EXISTS "OutgoingDocument_documentBookId_idx" ON "OutgoingDocument"("documentBookId");

-- 7. Create IncomingBookEntry table
CREATE TABLE IF NOT EXISTS "IncomingBookEntry" (
    "id"                         SERIAL PRIMARY KEY,
    "documentBookId"             INTEGER NOT NULL,
    "incomingDocumentId"         INTEGER NOT NULL UNIQUE,
    "arrivalNumber"              INTEGER NOT NULL,
    "arrivalDate"                TIMESTAMP(3) NOT NULL,
    "senderSnapshot"             TEXT NOT NULL,
    "documentNumberSnapshot"     TEXT,
    "documentSymbolSnapshot"     TEXT,
    "documentDateSnapshot"       TIMESTAMP(3),
    "documentTypeSnapshot"       TEXT,
    "summarySnapshot"            TEXT NOT NULL,
    "assignedDepartmentSnapshot" TEXT,
    "assignedUserSnapshot"       TEXT,
    "transferDate"               TIMESTAMP(3),
    "acknowledgedAt"             TIMESTAMP(3),
    "acknowledgedById"           INTEGER,
    "note"                       TEXT,
    "registeredById"             INTEGER NOT NULL,
    "registeredAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"                  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IncomingBookEntry_documentBookId_fkey" FOREIGN KEY ("documentBookId") REFERENCES "DocumentBook"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "IncomingBookEntry_incomingDocumentId_fkey" FOREIGN KEY ("incomingDocumentId") REFERENCES "IncomingDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "IncomingBookEntry_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "IncomingBookEntry_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "IncomingBookEntry_documentBookId_arrivalNumber_key" UNIQUE ("documentBookId", "arrivalNumber")
);

CREATE INDEX IF NOT EXISTS "IncomingBookEntry_arrivalDate_idx" ON "IncomingBookEntry"("arrivalDate");
CREATE INDEX IF NOT EXISTS "IncomingBookEntry_documentBookId_idx" ON "IncomingBookEntry"("documentBookId");
CREATE INDEX IF NOT EXISTS "IncomingBookEntry_registeredById_idx" ON "IncomingBookEntry"("registeredById");

-- 8. Create OutgoingBookEntry table
CREATE TABLE IF NOT EXISTS "OutgoingBookEntry" (
    "id"                         SERIAL PRIMARY KEY,
    "documentBookId"             INTEGER NOT NULL,
    "outgoingDocumentId"         INTEGER NOT NULL UNIQUE,
    "sequenceNumber"             INTEGER NOT NULL,
    "officialNumber"             TEXT NOT NULL,
    "documentSymbol"             TEXT,
    "issuanceDate"               TIMESTAMP(3) NOT NULL,
    "documentTypeSnapshot"       TEXT,
    "summarySnapshot"            TEXT NOT NULL,
    "signerSnapshot"             TEXT,
    "recipientsSnapshot"         TEXT NOT NULL,
    "archiveRecipientSnapshot"   TEXT,
    "copyCount"                  INTEGER NOT NULL DEFAULT 1,
    "transferDate"               TIMESTAMP(3),
    "acknowledgedAt"             TIMESTAMP(3),
    "acknowledgedBy"             TEXT,
    "note"                       TEXT,
    "registeredById"             INTEGER NOT NULL,
    "registeredAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"                  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OutgoingBookEntry_documentBookId_fkey" FOREIGN KEY ("documentBookId") REFERENCES "DocumentBook"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OutgoingBookEntry_outgoingDocumentId_fkey" FOREIGN KEY ("outgoingDocumentId") REFERENCES "OutgoingDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OutgoingBookEntry_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OutgoingBookEntry_documentBookId_sequenceNumber_key" UNIQUE ("documentBookId", "sequenceNumber"),
    CONSTRAINT "OutgoingBookEntry_documentBookId_officialNumber_key" UNIQUE ("documentBookId", "officialNumber")
);

CREATE INDEX IF NOT EXISTS "OutgoingBookEntry_issuanceDate_idx" ON "OutgoingBookEntry"("issuanceDate");
CREATE INDEX IF NOT EXISTS "OutgoingBookEntry_documentBookId_idx" ON "OutgoingBookEntry"("documentBookId");
CREATE INDEX IF NOT EXISTS "OutgoingBookEntry_registeredById_idx" ON "OutgoingBookEntry"("registeredById");
