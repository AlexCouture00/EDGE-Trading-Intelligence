---
name: Protected Preview testing
description: Safe external Vercel browser testing with independent Clerk and isolated test identities.
---
Keep Vercel Preview Authentication enabled while testing. Never attach an automation bypass header globally: it could be forwarded to Clerk or other third-party origins.

**Why:** The browser runner's header setter was not origin-scoped, and its notebook could not directly access environment secrets. A working alternative was to obtain a host-scoped bypass cookie through a programmatic request to the exact Preview health endpoint.

**How to apply:** If a credential bridge is necessary, use an ephemeral non-extractable RSA-OAEP key in an inert HTTPS browser page. Export only the public key; encrypt the environment credential outside the browser; decrypt only inside private execution memory; fetch the exact Preview origin with headers, never a credential-bearing URL; install only that host's cookie. Never log plaintext, cookies, private keys, or tokens. Revoke the dedicated automation credential after validation.

Native browser WebCrypto requires a secure context; an insecure `about:blank` page can lack `crypto.subtle` even when an HTTPS page supports it. The notebook's crypto shim is not evidence of browser crypto capabilities.

**Why:** Both capability checks initially gave misleading negative results until the test used an inert HTTPS page.

**How to apply:** Check `isSecureContext` in the actual browser context before concluding crypto is unavailable. Do not add public secret endpoints or load third-party code to bridge credentials.

External independent Clerk must be tested against its own instance, not the local Replit-managed helper. For a development instance with test mode enabled, use unique synthetic `+clerk_test@example.com` identities and the documented verification code; never real-user credentials or fabricated session tokens.

**Why:** Local managed auth and the external Preview use different identity stores. Real external registration, sign-in, sign-out and user isolation need the actual external instance.

**How to apply:** Honor CAPTCHA/verification requirements and record untested authorization methods explicitly. If resuming a tester fails with a connector-authority mismatch, respect that boundary and establish a new authorized test session rather than assuming previous cookies or credentials transferred.
