import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import PdfPreview from '../PdfPreview';
import api from '@/api/axios';

vi.mock('@/api/axios', () => ({
  default: {
    get: vi.fn().mockResolvedValue({
      data: new Blob(['%PDF-1.4 stub'], { type: 'application/pdf' }),
    }),
  },
}));

describe('PdfPreview', () => {
  it('does NOT append the JWT to the preview/download URLs', async () => {
    // localStorage is mocked to empty in vitest.setup.ts — even if a stale
    // token existed, the new implementation must not consult it.
    localStorage.setItem('token', 'JWT-LEAK-SENTINEL');

    render(
      <PdfPreview
        documentId={42}
        fileName="test.pdf"
        fileSize={1024}
        mimeType="application/pdf"
        pageCount={3}
      />
    );

    await waitFor(() => {
      expect(api.get).toHaveBeenCalled();
    });

    const calls = (api.get as unknown as { mock: { calls: unknown[][] } }).mock
      .calls;
    for (const args of calls) {
      const arg = args[0];
      expect(typeof arg).toBe('string');
      expect(String(arg)).not.toContain('token=');
      expect(String(arg)).not.toContain('JWT-LEAK-SENTINEL');
    }
  });

  it('renders the empty state when no file is attached', () => {
    render(
      <PdfPreview
        documentId={42}
        fileName={null}
        fileSize={null}
        mimeType={null}
        pageCount={null}
      />
    );

    expect(screen.getByText(/Không có tệp đính kèm/)).toBeInTheDocument();
  });
});
