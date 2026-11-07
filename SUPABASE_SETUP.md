# Supabase setup

The app's authentication and account-scoped data require a Supabase project.

1. Copy `.env.example` to `.env.local` and set the project URL and publishable key from Supabase. Keep `.env.local` out of source control.
2. Run the migrations in `supabase/migrations/` in filename order in the Supabase SQL Editor. The first sets up authentication and user data; the VCE resources migrations add private uploads, admin-managed shared-resource metadata, and the 20 GB shared-library limit.
3. In Supabase Auth, configure the site URL and redirect URLs for your local and deployed app. Set email/password sign-up and password recovery to match your needs.
4. Create your account through the app using the username `oscarnguyenn`, your own email, and a new password. Sign-in uses email; username is the account's display/administration identifier. Do not reuse a password that has been shared in chat.
5. After creating the account, promote it once in the SQL Editor:

   ```sql
   update public.profiles
   set role = 'admin'
   where username = 'oscarnguyenn';
   ```

6. To enable admin email invitations, add `SUPABASE_SERVICE_ROLE_KEY` to the server environment only. Never prefix it with `NEXT_PUBLIC_` or expose it in browser code.

The first account is not automatically made an administrator. Roles and account activation are checked by database functions and row-level security; changing client-side state cannot grant access. Admins can invite users, change roles, and deactivate accounts from Settings. User content is stored in `user_data` under RLS policies keyed to the authenticated user. Personal VCE uploads stay in a private Supabase Storage bucket; files are limited to 50 MB each.

## Cloudflare R2 for shared VCE files

Shared VCE file contents are stored privately in Cloudflare R2; Supabase continues to hold authentication, access-controlled metadata, and all personal uploads. The app limits the shared library to 20,000,000,000 bytes and checks each upload against that limit. Cloudflare R2 Standard storage costs $0.015 USD per GB-month after the account-wide free 10 GB-month allowance; at the current full-index scan estimate of about 12 GB, expect about $0.03 USD/month for storage if no other R2 data uses the free allowance. Actual billing depends on stored sizes and other account usage. Use a dedicated private bucket and check Cloudflare's current pricing and account usage before importing.

1. In Cloudflare, create a private R2 bucket. Do not enable public access.
2. Create an R2 API token with object read/write access to that bucket. Keep the access key and secret private.
3. Configure the bucket's CORS policy to allow `PUT` from the exact Hub origins you use (for example `http://localhost:3100` and your deployed HTTPS origin). Allow the `Content-Type` request header and expose the `ETag` response header for multipart uploads. Replace the example production origin; do not use `*` for allowed origins:

   ```json
   [
     {
       "AllowedOrigins": ["http://localhost:3100", "https://your-hub.example.com"],
       "AllowedMethods": ["PUT"],
       "AllowedHeaders": ["Content-Type"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
4. Add these server-only environment variables to `.env.local` and the deployed server environment: `CLOUDFLARE_R2_ACCOUNT_ID`, `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`, and `CLOUDFLARE_R2_BUCKET`. Never prefix them with `NEXT_PUBLIC_`, commit them, or send them in chat.
5. Apply the newest migration in `supabase/migrations/` to add the shared-storage quota check.

All signed-in active users can browse the source VCE index and preview PDFs and images without copying them. An admin can choose whole subject groups for copying into the shared R2 library; files above 50 MB use multipart uploads, up to the 20 GB app limit. If a file fails or a subject would exceed the remaining app limit, that entire subject is rolled back. Unavailable source folders and files beyond the app limit are reported rather than silently copied partially. Shared-resource reads use short-lived signed URLs, and only admins can upload or delete shared files. Existing browser-only data migrates once to the first account that signs in on that browser.
