// Creates a real, invite-only employee: an auth.users row via the service
// role, which the client can never hold. An admin, executive or hr_manager's
// own session can call it -- the same set as is_admin_exec_or_hr() in the
// database, which gates profiles_update.
//
// All three may assign any role, including admin. That is a deliberate
// decision (2026-09-10): these three roles administer people, and splitting
// "may edit a person" from "may create one" only produced confusion. A staff
// or dept_lead account still cannot touch any administrative field, which is
// the boundary that actually matters.
//
// The profiles row is NOT normally inserted here - the `on_auth_user_created`
// trigger (ensure_profile_for_auth_user()) already builds it from the invited
// user's raw_user_meta_data the instant the auth.users row is created, with
// `on conflict (id) do nothing`. This function's main job is to authorize the
// caller and pass the right metadata through inviteUserByEmail.
//
// The one exception is the CLAIM path. If the person already has an auth
// account - most often because they signed in with Google on the org's own
// email domain before anyone invited them - inviteUserByEmail can never
// succeed for them: GoTrue answers 422 email_exists, permanently. Before the
// sign-in safety net existed such an account could also have no profile at
// all, which left them invisible on the roster and impossible to add through
// any UI. So on email_exists we hand off to admin_claim_existing_auth_user(),
// which builds the roster row the admin just described against the account
// that already exists - or reports `already_on_roster` when there is nothing
// to fix.
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

const ALL_ROLES = ['admin', 'executive', 'dept_lead', 'hr_manager', 'staff']
const ALLOWED_CALLER_ROLES = ['admin', 'executive', 'hr_manager']
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

    // Which workspace is this invite for? Ask the database rather than guessing.
    //
    // current_org_id() is the same function every RLS policy uses: the caller's
    // active_workspace if they have one, otherwise their oldest active
    // membership. Calling it through callerClient evaluates it as the caller,
    // so there is one definition of "the workspace I am in" rather than a
    // second one reimplemented here that could drift from it.
    //
    // This matters because a person can hold memberships in several
    // workspaces. Picking the wrong one would stamp the wrong org_id onto the
    // invitee's metadata, and the on_auth_user_created trigger builds their
    // profile from exactly that.
    const { data: callerOrgId, error: orgError } = await callerClient.rpc('current_org_id')
    if (orgError || !callerOrgId) {
      return json({ error: 'No active workspace for caller' }, 403)
    }

    // profiles is keyed by (user_id, org_id) — it has no `id` column at all.
    // Selecting `id` here made every invite fail with "No profile for caller".
    const { data: callerProfile, error: callerError } = await admin
      .from('profiles')
      .select('user_id, org_id, role')
      .eq('user_id', user.id)
      .eq('org_id', callerOrgId)
      .eq('is_active', true)
      .maybeSingle()
    if (callerError || !callerProfile) return json({ error: 'No profile for caller' }, 403)
    if (!ALLOWED_CALLER_ROLES.includes(callerProfile.role)) {
      return json({ error: 'Only admins, executives or HR can invite employees' }, 403)
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


    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      // Read by the on_auth_user_created -> ensure_profile_for_auth_user()
      // trigger, which builds the profiles row from this metadata.
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

    if (inviteError) {
      const alreadyExists =
        (inviteError as { code?: string }).code === 'email_exists' ||
        /already been registered/i.test(inviteError.message)

      if (!alreadyExists) return json({ error: inviteError.message }, 400)

      // They already have an auth account. Adopt it rather than dead-ending:
      // the RPC creates the profile the admin just described, and tells us
      // apart the case where they were already on the roster all along.
      const { data: claimedId, error: claimError } = await admin.rpc('admin_claim_existing_auth_user', {
        p_email: email,
        p_org_id: callerProfile.org_id,
        p_full_name: full_name,
        p_role: role,
        p_department_id: department_id,
        p_title: title,
        p_capacity: capacity_hours_per_week,
        p_employment_type: employment_type,
      })

      if (claimError) {
        if (/already_on_roster/.test(claimError.message)) {
          return json(
            { error: `${email} is already on the roster - search the Employees list to edit them.` },
            409,
          )
        }
        return json({ error: claimError.message }, 400)
      }

      return json({ id: claimedId, claimed: true })
    }

    return json({ id: invited.user.id })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
