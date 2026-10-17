// Vite configuration for the standalone 3D System Topology demo (:3003, no backend).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

interface AuthUser {
  role: string;
  password: string;
}

// Login passwords per role for the ?pwd= prefill on app links, read from the deployed
// accounts (TF_VAR_auth_users, provided by mise). Unset → links open the login screen empty.
function appPasswords(): Record<string, string> {
  const users = JSON.parse(process.env.TF_VAR_auth_users || '[]') as AuthUser[];
  return Object.fromEntries(users.map((u) => [u.role, u.password]));
}

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_PASSWORDS__: JSON.stringify(appPasswords()),
  },
  server: {
    port: 3003,
    strictPort: true,
  },
  preview: {
    port: 3003,
    strictPort: true,
  },
});
