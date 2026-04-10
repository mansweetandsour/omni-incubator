# Supabase Auth Configuration (External Task E2)

Configure via Supabase Dashboard → Authentication → Settings:

## Email OTP Settings
- **Email OTP**: Enabled
- **Magic Links**: Disabled (use OTP mode only)
- **OTP Expiry**: 600 seconds (10 minutes)
- **Secure email change**: Enabled (recommended)

## Google OAuth (External Task E3)
1. Create a Google Cloud OAuth 2.0 Client ID at console.cloud.google.com
2. Add authorized redirect URI: `https://{your-supabase-project}.supabase.co/auth/v1/callback`
3. In Supabase Dashboard → Authentication → Providers → Google:
   - Client ID: (from Google Cloud Console)
   - Client Secret: (from Google Cloud Console)

## Rate Limiting (Supabase built-in)
- Configure in Supabase Dashboard → Authentication → Rate Limits
- Recommended: 5 OTP requests per hour per email (Supabase default is 3/hr)
