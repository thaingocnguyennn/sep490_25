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
  it('requires an email address', () => {
    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(screen.getByText('Please enter your email address')).toBeInTheDocument();
    expect(authApi.forgotPassword).not.toHaveBeenCalled();
  });

  it('submits the email and displays the server response', async () => {
    vi.mocked(authApi.forgotPassword).mockResolvedValue({
      data: { message: 'If an account with that email exists, a password reset link has been sent.' },
    } as never);

    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: '  USER@EXAMPLE.COM ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

    await waitFor(() => {
      expect(authApi.forgotPassword).toHaveBeenCalledWith({ email: 'USER@EXAMPLE.COM' });
    });
    expect(
      await screen.findByText(
        'If an account with that email exists, a password reset link has been sent.',
      ),
    ).toBeInTheDocument();
  });
});
