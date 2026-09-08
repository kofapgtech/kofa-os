/** Where "I still need help" points.
 *
 *  The ticket system is live, so this is it. Everyone can reach /tickets to
 *  raise one and see their own history; admins get the queue at
 *  /tickets/manage, which the sidebar links them to instead.
 *
 *  Set this back to null and the docs footer falls back to email — nothing
 *  else needs touching. */
export const SUPPORT_ROUTE: string | null = '/tickets'

/** Used only when SUPPORT_ROUTE is null. */
export const SUPPORT_EMAIL = 'tech@kofapg.com'
