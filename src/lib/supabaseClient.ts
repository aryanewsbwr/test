import { createClient } from '@supabase/supabase-js';

// Browser only. Calls go to /api/db, which checks the login and holds the real key.
// API routes use supabaseAdmin instead.
const origin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;

export const supabase = createClient(`${origin}/api/db`, 'login-cookie', {
  auth: {
    persistSession: false
  },
  global: {
    fetch: (url, options = {}) => {
      return fetch(url, {
        ...options,
        cache: 'no-store'
      });
    }
  }
});
