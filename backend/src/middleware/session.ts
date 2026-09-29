import cookieSession from "cookie-session";

// Local demo-auth session (doc §87 "preferred POC approach"): no Keycloak, the user
// just picks one of the seeded demo identities. The signed cookie carries user_id only;
// team/role are always re-read from the DB so policy checks never trust client state.
export const sessionMiddleware = cookieSession({
  name: "novamart_session",
  secret: process.env.SESSION_SECRET ?? "change-me-in-dev",
  maxAge: 24 * 60 * 60 * 1000,
  sameSite: "lax",
});
