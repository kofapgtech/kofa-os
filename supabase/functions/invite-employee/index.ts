// Creates a real, invite-only employee: an auth.users row via the service
// role, which the client can never hold. Only an admin or hr_manager's own
// session can call this successfully - and hr_manager is further limited to
// non-privileged roles (see the escalation guard below), mirroring the
// restriction independently enforced at the database level on profiles_update.
//
// Executive is deliberately NOT in ALLOWED_CALLER_ROLES: an executive has
// every other admin-tier permission (see is_admin_or_executive() in the
// database) except this one - inviting a new employee stays admin/HR-only.
//
// The profiles row is NOT inserted here - the existing `on_auth_user_created`
// trigger (handle_new_user()) already builds it from the invited user's
// raw_user_meta_data the instant the auth.users row is created, with
// `on conflict (id) do nothing`. This function's only job is to authorize
// the caller and pass the right metadata through inviteUserByEmail.
//
// The invite email's redirect link uses whichever origin the caller sent as
// redirect_to (the browser's own window.location.origin - correct whether
// that's localhost during dev or the real deploy in production). APP_URL is
// only a fallback for callers that don't pass one.
//
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected
// automatically by the platform - nothing to set for those.
//
// IMPORTANT: whatever origin is used must also be listed in Supabase ->
// Authentication -> URL Configuration -> Redirect URLs, or Supabase silently
// falls back to the project's default Site URL instead.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ALL_ROLES = ['admin', 'executive', 'dept_lead', 'billing_finance', 'hr_manager', 'staff']
const ALLOWED_CALLER_ROLES = ['admin', 'hr_manager']
// What an hr_manager caller may assign - never a privileged tier, and never
// themselves out of it. Admin callers are unrestricted (any ALL_ROLES value).
const HR_ASSIGNABLE_ROLES = ['staff', 'dept_lead']
const VALID_EMPLOYMENT_TYPES = ['employee', 'contractor']

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

    // Scoped to the caller's own JWT - identifies who's asking, nothing more.
    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const {
      data: { user },
      error: userError,
    } = await callerClient.auth.getUser()
    if (userError || !user) return json({ error: 'Not signed in' }, 401)

    // Service role - the only client allowed to create auth users or bypass RLS.
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: callerProfile, error: callerError } = await admin
      .from('profiles')
      .select('id, org_id, role')
      .eq('id', user.id)
      .single()
    if (callerError || !callerProfile) return json({ error: 'No profile for caller' }, 403)
    if (!ALLOWED_CALLER_ROLES.includes(callerProfile.role)) {
      return json({ error: 'Only admins or HR can invite employees' }, 403)
    }

    const body = await req.json().catch(() => ({}))
    const email = String(body.email ?? '').trim().toLowerCase()
    const full_name = String(body.full_name ?? '').trim()
    const role = String(body.role ?? 'staff')
    const department_id = body.department_id ?? null
    const title = body.title ? String(body.title) : null
    const capacity_hours_per_week = Number(body.capacity_hours_per_week ?? 40)
    const employment_type = String(body.employment_type ?? 'employee')
    const redirectTo = body.redirect_to ? String(body.redirect_to) : Deno.env.get('APP_URL')

    if (!email || !full_name) return json({ error: 'full_name and email are required' }, 422)
    if (!ALL_ROLES.includes(role)) return json({ error: `role must be one of ${ALL_ROLES.join(', ')}` }, 422)
    if (!VALID_EMPLOYMENT_TYPES.includes(employment_type)) {
      return json({ error: `employment_type must be one of ${VALID_EMPLOYMENT_TYPES.join(', ')}` }, 422)
    }

    // The same escalation guard RLS enforces on profiles_update for HR edits
    // to *existing* rows, applied here to the *creation* path: this server
    // check is the only thing standing between an HR caller and inviteUserByEmail,
    // since that call runs on the service role and bypasses RLS entirely.
    if (callerProfile.role === 'hr_manager' && !HR_ASSIGNABLE_ROLES.includes(role)) {
      return json({ error: `HR can only invite staff or dept_lead, not ${role}` }, 403)
    }

    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      // Read by the on_auth_user_created -> handle_new_user() trigger, which
      // builds the profiles row from this metadata.
      data: {
        org_id: callerProfile.org_id,
        department_id,
        full_name,
        role,
        title,
        capacity_hours_per_week,
        employment_type,
      },
    })
    if (inviteError) return json({ error: inviteError.message }, 400)

    return json({ id: invited.user.id })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
