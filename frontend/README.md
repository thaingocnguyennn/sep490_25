# DMS Frontend — Document Management System with OCR

## Prerequisites

- Node.js >= 18
- npm or yarn

## Setup

### 1. Install Dependencies

```bash
cd frontend
npm install
```

### 2. Start Development Server

```bash
npm run dev
```

Frontend runs at `http://localhost:3000`

The Vite dev server proxies `/api` requests to `http://localhost:5000`.

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |

## Project Structure

```
frontend/
├── src/
│   ├── api/
│   │   ├── axios.ts          # Axios instance + interceptors
│   │   ├── index.ts          # API exports
│   │   └── modules/
│   │       ├── auth.ts
│   │       └── users.ts
│   ├── contexts/
│   │   └── AuthContext.tsx   # Auth state management
│   ├── features/
│   │   ├── auth/
│   │   │   └── pages/
│   │   │       └── LoginPage.tsx
│   │   ├── dashboard/
│   │   │   └── pages/
│   │   │       └── DashboardPage.tsx
│   │   └── users/
│   │       └── pages/
│   │           ├── UsersPage.tsx
│   │           ├── UserDetailPage.tsx
│   │           └── UserFormPage.tsx
│   ├── layouts/
│   │   ├── AuthLayout.tsx
│   │   └── MainLayout.tsx
│   ├── routes/
│   │   └── routes.tsx
│   ├── types/
│   │   └── index.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
└── package.json
```
