# Mundus Novus OpenID Connect

Enable on the existing web service with OIDC_ISSUER=https://social.mundusnovus.org
and OIDC_CLIENTS, a JSON array of first-party confidential clients:

    [{"id":"mn-cloud","secret":"<random secret of at least 32 characters>","redirectUris":["https://cloud.mundusnovus.org/apps/user_oidc/code"],"requirePkce":true}]

Generate the real secret in Railway; never put it in source control. Keep DATA_DIR
on the existing persistent volume. The RSA private key is generated there once,
mode 0600. Back up that key with the account database. Keep one web replica.
Changing the key invalidates outstanding ID tokens; there is no key-rotation UI yet.

Discovery: /.well-known/openid-configuration. Endpoints under /oauth/: authorize,
token, userinfo, jwks. RS256; authorization code; exact registered redirect URIs;
S256 PKCE; 90-second single-use codes; 5-minute access and ID tokens. Codes and
access tokens are stored hashed. Logout, suspension and expired account sessions
invalidate outstanding codes and userinfo access. API keys cannot authorize OIDC.
Only openid/profile scopes are accepted. No email claim, refresh tokens, dynamic
registration, implicit flow or third-party consent. Only register apps we operate.
Unsupported prompt values fail; prompt=none returns login_required without login.
The subject is the immutable Social account name, as required by Cloud.

Nextcloud user_oidc: map uid to sub; disable unique UID hashing and provider-based
UID prefixes; map display name to name. Enable PKCE. Do not enable bearer-token
account provisioning. Set default quota separately on the Cloud server.

Run node --test test/*.test.mjs with Node 24. Tests drive a real HTTP authorization
flow, validate the RSA signature and nonce, reject bad redirect URIs, client
secrets and PKCE verifiers, and verify code replay and logout revocation.
