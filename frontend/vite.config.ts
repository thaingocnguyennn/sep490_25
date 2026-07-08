import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: env.API_URL || 'http://127.0.0.1:5000',
          changeOrigin: true,
        },
        '/uploads': {
          target: env.API_URL || 'http://127.0.0.1:5000',
          changeOrigin: true,
        },
      },
    },
  };
});
