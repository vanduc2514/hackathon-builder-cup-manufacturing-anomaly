// Build-time constants injected by vite.config.ts `define`.

/** Login password per account role (e.g. shift_leader, technician); empty when not configured. */
declare const __APP_PASSWORDS__: Record<string, string>;
