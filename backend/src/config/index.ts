import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT!, 10),
  nodeEnv: process.env.NODE_ENV!,

  database: {
    url: process.env.DATABASE_URL!,
  },

  jwt: {
    secret: process.env.JWT_SECRET!,
    expiresIn: process.env.JWT_EXPIRES_IN!,
  },

  frontendUrl: process.env.FRONTEND_URL!,

  bcrypt: {
    saltRounds: 12,
  },

  // Absolute path to the uploads directory for document files
  uploadDir: path.resolve(__dirname, '../../uploads'),
};
