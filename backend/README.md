# DMS Backend — Document Management System with OCR

## Prerequisites

- Node.js >= 18
- PostgreSQL >= 14
- npm or yarn

## Setup

### 1. Clone & Install

```bash
cd backend
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your PostgreSQL credentials:

```
DATABASE_URL=postgresql://postgres:password@localhost:5432/dms_db
JWT_SECRET=your-super-secret-key
PORT=5000
FRONTEND_URL=http://localhost:3000
```

### 3. Create Database

```sql
CREATE DATABASE dms_db;
```

### 4. Run Migrations & Seed

```bash
npm run db:setup
```

This runs:
- `prisma generate` — generate Prisma client
- `prisma migrate dev` — create tables
- `ts-node prisma/seed.ts` — seed default roles and admin user

### 5. Start Development Server

```bash
npm run dev
```

Server runs at `http://localhost:5000`

### 6. Default Credentials (after seed)

| Username | Password | Role |
|---|---|---|
| admin | Admin@123 | ADMIN |
| user01 | User@123 | USER |

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Compile TypeScript |
| `npm run start` | Run production build |
| `npm run prisma:generate` | Generate Prisma client |
| `npm run prisma:migrate` | Run database migrations |
| `npm run prisma:seed` | Seed the database |
| `npm run db:setup` | Full setup (generate + migrate + seed) |

## API Base URL

```
http://localhost:5000/api
```

## API Endpoints

### Auth

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/profile` | Get current user profile |
| PATCH | `/api/auth/change-password` | Change password |

### Users (Admin only)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/users` | List all users |
| GET | `/api/users/:id` | Get user by ID |
| POST | `/api/users` | Create user |
| PUT | `/api/users/:id` | Update user |
| DELETE | `/api/users/:id` | Delete user |

## Project Structure

```
backend/
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── src/
│   ├── config/
│   │   ├── index.ts
│   │   └── database.ts
│   ├── modules/
│   │   ├── auth/
│   │   └── users/
│   ├── routes/
│   ├── shared/
│   │   ├── exceptions/
│   │   ├── middlewares/
│   │   └── utils/
│   └── app.ts
├── package.json
└── tsconfig.json
```
