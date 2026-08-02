import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config';
import routes from './routes';
import { errorHandler } from './shared/middlewares/error.middleware';

const app = express();

// Helmet: tắt crossOriginResourcePolicy để frontend (port 3000) có thể load
// file tĩnh (uploads) từ backend (port 5000) khi phát triển local.
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);
app.use(
  cors({
    origin: config.frontendUrl,
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Serve file tĩnh từ thư mục uploads (ảnh, PDF văn bản đã upload).
// Đặt TRƯỚC /api để tránh bị route API bắt nhầm.
// Dùng config.uploadDir để nhất quán với upload middleware.
// Truy cập: GET /uploads/<filename>
app.use('/uploads', express.static(config.uploadDir));

app.get('/health', (_req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.use('/api', routes);

app.use(errorHandler);

app.listen(config.port, config.host, () => {
  const displayHost = config.host === '0.0.0.0' ? 'localhost' : config.host;
  console.log(`🚀 Server running at http://${displayHost}:${config.port}`);
  console.log(`📦 Environment: ${config.nodeEnv}`);
  console.log(`📁 Uploads dir: ${config.uploadDir}`);
});

export default app;
// trigger ts-node-dev restart

