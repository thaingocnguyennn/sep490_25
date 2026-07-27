import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ForgotPasswordPage from '../ForgotPasswordPage';
import { authApi } from '../../../../api';

vi.mock('../../../../api', () => ({
  authApi: {
    forgotPassword: vi.fn(),
  },
}));

describe('ForgotPasswordPage', () => {
  it('yêu cầu nhập địa chỉ email', () => {
    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Gửi đường dẫn đặt lại' }));

    expect(screen.getByText('Vui lòng nhập địa chỉ email')).toBeInTheDocument();
    expect(authApi.forgotPassword).not.toHaveBeenCalled();
  });

  it('gửi email và hiển thị phản hồi từ máy chủ', async () => {
    vi.mocked(authApi.forgotPassword).mockResolvedValue({
      data: {
        message:
          'Nếu tài khoản với email này tồn tại, đường dẫn đặt lại mật khẩu đã được gửi.',
      },
    } as never);

    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('Địa chỉ email'), {
      target: { value: '  USER@EXAMPLE.COM ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đường dẫn đặt lại' }));

    await waitFor(() => {
      expect(authApi.forgotPassword).toHaveBeenCalledWith({ email: 'USER@EXAMPLE.COM' });
    });
    expect(
      await screen.findByText(
        'Nếu tài khoản với email này tồn tại, đường dẫn đặt lại mật khẩu đã được gửi.',
      ),
    ).toBeInTheDocument();
  });
});
