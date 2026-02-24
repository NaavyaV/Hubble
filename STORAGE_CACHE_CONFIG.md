# Supabase Storage Cache Headers (Manual Step)

The Supabase MCP does not expose bucket configuration. Apply these settings in the **Supabase Dashboard** to reduce egress.

## Buckets used by the app

- **event-images** – event cover images (CreateEventScreen, upload.ts)
- **photos** – event photos (event_photos records, upload.ts, eventDeletion)

## Steps (Dashboard)

1. Open **Supabase Dashboard** → **Storage** → select each bucket above.
2. For each bucket (or per-object if your UI allows), set **Cache-Control**:
   ```
   Cache-Control: public, max-age=31536000, immutable
   ```
3. Ensure **no query params** are appended to image URLs at runtime in the app (already true: new upload = new path).

This does not break cache invalidation: new uploads use new file paths, so existing URLs remain immutable.

After applying, expect a sharp drop in storage request count and egress within 24h.
