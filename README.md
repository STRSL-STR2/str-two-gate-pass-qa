# STR2 Gate Pass Management System (GPMS)

A web-based Gate Pass Management System built with **React 19**, **TypeScript**, **Vite**, **Tailwind CSS**, and **Supabase (PostgreSQL)**.

---

## 🚀 Key Features

- **Dynamic Gate Pass Numbering**: Automatically formats gate passes as `STR2GP-YY-MMM-NNNN` (e.g. `STR2GP-26-JAN-0001`), with yearly sequence resets.
- **Role-Based Access Control (RBAC)**:
  - `super_admin`: Full system control, user role management, gate pass status reversals (unpost/undispatch).
  - `admin`: Operational administration, master data, drivers, delivery locations, time slots, standard user creation.
  - `user`: Standard operational access (data upload, gate pass creation, and processing).
  - `viewer`: Read-only access to Gate Pass Records.
- **Bulk Operations**:
  - Bulk Dispatch & Bulk Post
  - Bulk Multi-Page Printing (with automated page breaks)
  - Bulk Deletion
- **Real-Time Audit & Activity Trail**: Comprehensive event logging for gate pass creation, dispatches, postings, reversals, and user access.
- **Direct PDF & Email Integration**:
  - Instant client-side A4 PDF generation.
  - Outlook Classic / default email client integration with customizable subject and body templates.
- **Master Data & Invoice Validation**: Fast duplicate invoice checks across records and local storage staging.

---

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Lucide React
- **UI Components**: Radix UI / Shadcn UI primitives, Recharts, Sonner toasts
- **Export & Documents**: jsPDF, html2canvas, react-to-print, SheetJS (xlsx), PapaParse
- **Backend & Database**: Supabase (PostgreSQL, Row Level Security, Stored Procedures / RPCs)
- **Local Cache**: LocalForage (IndexedDB storage for large invoice datasets)

---

## 📦 Getting Started

### 1. Prerequisites

- [Node.js](https://nodejs.org/) (version 18 or higher recommended)
- [npm](https://www.npmjs.com/)
- A [Supabase](https://supabase.com/) project

### 2. Clone and Install Dependencies

```bash
# Clone the repository
git clone <your-repository-url>
cd QA

# Install dependencies
npm install
```

### 3. Environment Variables

Create a `.env` file in the root folder using `.env.example`:

```bash
cp .env.example .env
```

Set your Supabase credentials in `.env`:

```env
VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_ANON_KEY="your-anon-public-key"
```

---

## 🗄️ Database Setup & Migrations

To set up the database schema in Supabase:

1. Open your **Supabase Dashboard** -> **SQL Editor**.
2. **For New Setup**: Run `database_master_schema.sql` to initialize all tables, functions, triggers, and RLS policies.
3. **For Existing Database (Upgrade)**: Run `combined_latest_migrations.sql` to apply the latest delta updates (Audit logs, new numbering format, super admin role hierarchy).

---

## 📜 Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts the local Vite development server on port 3000 |
| `npm run build` | Compiles and builds the production bundle into `/dist` |
| `npm run preview` | Previews the production build locally |
| `npm run lint` | Runs TypeScript compiler checks without emitting code |

---

## 📁 Project Structure

```text
QA/
├── components/          # Reusable UI components & dialogs
│   ├── layout/          # AppLayout, sidebar, navbar
│   ├── shared/          # Shared search, filters, table headers
│   └── ui/              # Button, Input, Dialog, Select, etc.
├── hooks/               # Custom hooks (useAuth, useTheme)
├── lib/                 # Supabase client, audit logging, gatepass actions
├── pages/               # Application routes & views
│   ├── CreateGatePass.tsx
│   ├── Dashboard.tsx
│   ├── DataUpload.tsx
│   ├── GatePassRecords.tsx
│   ├── InvoiceRecords.tsx
│   ├── Login.tsx
│   ├── MasterData.tsx
│   ├── Profile.tsx
│   └── Settings.tsx
├── src/                 # App entry points (App.tsx, main.tsx)
├── types/               # TypeScript interfaces & domain types
├── combined_latest_migrations.sql  # Delta migrations for Supabase
└── database_master_schema.sql      # Master database schema
```
