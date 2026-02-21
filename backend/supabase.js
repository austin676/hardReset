/**
 * supabase.js
 * -----------
 * Initialises the Supabase client for the Node.js backend.
 *
 * Uses the SERVICE ROLE key (not the anon/publishable key) so the backend
 * can read and write all rows without being blocked by Row Level Security.
 * Never expose this key to the browser.
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl     = process.env.SUPABASE_URL;
const serviceRoleKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    '[supabase] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing from .env'
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    // Backend clients don't need to persist sessions
    persistSession: false,
    autoRefreshToken: false,
  },
});

module.exports = { supabase };
