import NextAuth from "next-auth"
import { authConfig } from "@/auth.config"

// Next 16 calls this convention "proxy"; it is what earlier versions called
// middleware, and it still runs before every matched request.
export default NextAuth(authConfig).auth

/**
 * Everything is private unless listed here. Closed by default is the whole
 * point of the single-user gate: a new route is protected because it exists,
 * not because someone remembered to protect it.
 *
 * icon.svg is where Next serves app/icon.svg from — without the exemption,
 * the favicon 307s to /login for anyone signed out and the tab shows a
 * broken icon. Any future route that must be reachable without a session
 * (an API other services call, say) needs its own entry here too, or every
 * caller silently gets a redirect instead of the route.
 *
 * `s/` is the shared-itinerary route, and the one deliberate hole in the
 * gate. It is exempt because the people you are travelling with do not have
 * the operator's password and a trip you cannot send anyone is not much of a
 * trip. What protects it is the 128-bit token in the URL, checked against a
 * single row; the page is read-only and 404s for any trip that is not
 * finished. That is a narrower exemption than it looks — `/s/` without a
 * valid token is a 404, not a listing.
 */
export const config = {
  matcher: ["/((?!api/auth|login|s/|_next/static|_next/image|favicon.ico|icon.svg).*)"],
}
