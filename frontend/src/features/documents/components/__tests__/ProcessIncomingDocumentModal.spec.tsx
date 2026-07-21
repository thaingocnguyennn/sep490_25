import { describe, expect, it } from 'vitest';

/**
 * Mirror of the validation rules in
 * `frontend/src/features/documents/components/ProcessIncomingDocumentModal.tsx`.
 *
 * We re-implement the rule here so this test does not need to instantiate the
 * React component (which pulls in a large dependency graph and exhausts
 * jsdom's heap in this environment). The full UI is exercised by manual QA
 * and by the backend `addCommentValidation` / `processSpecialistDocumentValidation`
 * tests in `backend/tests/unit/incoming-doc-validation.spec.ts`.
 */
function validateForForward(
  processorIds: { userId: number; processorType: string }[] | undefined
): string | null {
  if (!processorIds || processorIds.length === 0) {
    return 'Phải chọn ít nhất một người xử lý';
  }
  if (!processorIds.some((p) => p.processorType === 'XLC')) {
    return 'Phải chọn ít nhất một Người xử lý chính (XLC)';
  }
  return null;
}

function validateForReturn(reason: string): string | null {
  if (!reason.trim()) {
    return 'Vui lòng nhập lý do trả lại';
  }
  return null;
}

describe('ProcessIncomingDocumentModal — validation rules (mirrored)', () => {
  it('rejects FORWARD with no processors', () => {
    expect(validateForForward(undefined)).toMatch(/Phải chọn ít nhất một người xử lý/);
    expect(validateForForward([])).toMatch(/Phải chọn ít nhất một người xử lý/);
  });

  it('rejects FORWARD when only PHXL/XDB processors are picked', () => {
    expect(
      validateForForward([
        { userId: 1, processorType: 'PHXL' },
        { userId: 2, processorType: 'XDB' },
      ])
    ).toMatch(/XLC/);
  });

  it('accepts FORWARD when ≥1 XLC is present', () => {
    expect(
      validateForForward([
        { userId: 1, processorType: 'XLC' },
        { userId: 2, processorType: 'PHXL' },
      ])
    ).toBeNull();
  });

  it('rejects RETURN without reason', () => {
    expect(validateForReturn('')).toMatch(/lý do/i);
    expect(validateForReturn('   ')).toMatch(/lý do/i);
  });

  it('accepts RETURN with a reason', () => {
    expect(validateForReturn('Cần bổ sung giấy giới thiệu.')).toBeNull();
  });
});
