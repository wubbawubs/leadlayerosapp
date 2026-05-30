# Basic Lead Ingestion Webhook V1

Receive leads from website contact forms automatically, without manual data entry.

## Purpose

V1 removes the manual lead logging bottleneck. An operator creates a webhook source once, copies the URL + publicKey into the form plugin, and leads flow directly into the Lead Inbox and Monthly Reports.

## Architecture

### Data model: `lead_ingestion_sources`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `tenant_id` | uuid | FK → tenants |
| `site_connection_id` | uuid | Optional FK → site_connections |
| `name` | text | Human label e.g. "Contact form — homepage" |
| `source_type` | text | `form_webhook \| wordpress_form \| manual \| other` |
| `public_key` | text | **UNIQUE** 48-char hex — the only public identifier |
| `status` | text | `active \| disabled \| revoked` |
| `allowed_origins` | text[] | Empty = allow all; populated = CORS allowlist |
| `default_source` | text | Written to `leads.source` (default: `"form"`) |
| `default_status` | text | Written to `leads.status` (default: `"new"`) |

RLS: members can SELECT; operator/owner can INSERT/UPDATE/DELETE.

### Public endpoint: `POST /api/public/lead-ingest`

No user auth required. Protected by `publicKey` only.

**Request (JSON or form-encoded):**
```json
{
  "publicKey": "abc123...48chars",
  "name": "John Smith",
  "email": "john@example.com",
  "phone": "+1 555 123 4567",
  "message": "I need AC repair ASAP",
  "service": "AC repair",
  "location": "Dallas, TX",
  "pageUrl": "https://example.com/contact",
  "referrer": "https://google.com",
  "utm_source": "google",
  "utm_medium": "cpc",
  "utm_campaign": "hvac-dallas-summer"
}
```

**Validation:**
- `publicKey` required
- At least one of: `name`, `phone`, `email`, `message`
- Origin checked against `allowed_origins` if configured

**Response:**
- `200 { ok: true }` on success
- `400 { ok: false, error: "..." }` on validation error
- `401 { ok: false, error: "Invalid key" }` on bad/revoked key
- `500 { ok: false, error: "Service error" }` on internal error

Never reveals whether a tenant exists. `tenant_id` is never in the URL or response.

### CORS

The endpoint sends `Access-Control-Allow-Origin` matching the caller's `Origin` header (if allowed). Pre-flight OPTIONS is supported.

### Attribution stored in leads

Webhook leads carry full attribution in `leads.attribution`:
```json
{
  "ingestionSourceId": "<uuid>",
  "pageUrl": "https://...",
  "referrer": "https://...",
  "service": "AC repair",
  "location": "Dallas, TX",
  "utm": { "source": "google", "medium": "cpc", "campaign": "..." }
}
```

## Security model

- `publicKey` = `randomBytes(24).toString('hex')` = 48 hex chars = 2^192 keyspace
- Key is the ONLY thing in the public URL/payload
- `tenant_id` is never returned, logged at debug level, or in error messages
- Revoked keys return `401 "Invalid key"` (same as not-found — no info leak)
- CORS origin allowlist available per source

## V1 limitations

- No rate limiting per key (document V1 limitation, implement in V2)
- No deduplication (duplicates allowed; operator reviews in Lead Inbox)
- No call tracking (out of scope)
- No GA4/GSC integration (out of scope)
- No CRM sync (out of scope)

## Integration examples

### Fetch (JavaScript)
```js
fetch("https://your-domain.com/api/public/lead-ingest", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    publicKey: "your_48_char_key",
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    message: formData.get("message")
  })
});
```

### WordPress form plugin (Gravity Forms / WPForms / CF7)
1. Create a webhook source in Lead Inbox → Lead capture sources
2. Copy the endpoint URL
3. In your form plugin's webhook settings:
   - URL: `https://your-domain.com/api/public/lead-ingest`
   - Method: POST
   - Format: JSON
   - Body: map `publicKey`, `name`, `email`, `phone`, `message`

## Impact on existing systems

- Webhook leads write to the same `leads` table as manual logs
- Goal Progress card on dashboard updates automatically
- Snapshot tracking slice sees webhook leads and upgrades to `"partial"` status
- Monthly Reports include webhook leads in `lead_summary`
- No changes needed to existing manual lead logging
