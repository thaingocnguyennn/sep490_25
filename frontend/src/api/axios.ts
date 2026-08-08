import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

// Use environment variable for API base URL, fallback to relative path for Vercel rewrites
const getApiBaseUrl = () => {
  // In production with Vercel, use relative path (Vercel rewrites handle routing to /api)
  // In development, use the configured URL with /api prefix
  if (import.meta.env.VITE_API_BASE_URL) {
    // Direct backend URL (e.g., production with CORS)
    return import.meta.env.VITE_API_BASE_URL;
  }
  // Fallback: Vercel rewrites handle /api/* -> backend
  return '';
};

const getApiPrefix = () => {
  // If using direct backend URL, we need to add /api prefix
  // If using Vercel rewrites, the /api prefix is already in the URL
  return import.meta.env.VITE_API_BASE_URL ? '/api' : '';
};

const api = axios.create({
  baseURL: getApiBaseUrl() + getApiPrefix(),
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ message: string; errors?: unknown }>) => {
    if (error.response?.status === 401) {
      const isLoginRequest = error.config?.url?.includes('/auth/login');
      if (!isLoginRequest) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
