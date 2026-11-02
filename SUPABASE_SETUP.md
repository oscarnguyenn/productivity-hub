# Supabase setup

The app's authentication and account-scoped data require a Supabase project.

1. Copy `.env.example` to `.env.local` and set the project URL and publishable key from Supabase. Keep `.env.local` out of source control.
2. Run `supabase/migrations/20261102180000_initial.sql` in the Supabase SQL Editor.
3. In Supabase Auth, configure the site URL and redirect URLs for your local and deployed app. Set email/password sign-up and password recovery to match your needs.
4. Create your account through the app using the username `oscarnguyenn`, your own email, and a new password. Sign-in uses email; username is the account's display/administration identifier. Do not reuse a password that has been shared in chat.
5. After creating the account, promote it once in the SQL Editor:

   ```sql
   update public.profiles
   set role = 'admin'
   where username = 'oscarnguyenn';
   ```

6. To enable admin email invitations, add `SUPABASE_SERVICE_ROLE_KEY` to the server environment only. Never prefix it with `NEXT_PUBLIC_` or expose it in browser code.

The first account is not automatically made an administrator. Roles and account activation are checked by database functions and row-level security; changing client-side state cannot grant access. Admins can invite users, change roles, and deactivate accounts from Settings. User content is stored in `user_data` under RLS policies keyed to the authenticated user. Existing browser-only data migrates once to the first account that signs in on that browser.
