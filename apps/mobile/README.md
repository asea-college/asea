# ASEA mobile · Android & iOS

Shared Flutter source is in `lib/main.dart`. It connects to the existing Supabase `asea-workspace` public API with RLS.

## Development prerequisites
Install Flutter stable with Android SDK and/or Xcode. In this folder run:

```sh
flutter create --project-name asea_staff --platforms android,ios .
flutter pub get
flutter run
```

The checked-in `pubspec.yaml` and `lib/main.dart` are the source of truth. Generated Android/iOS project scaffolds require review and commit before production signing. GitHub Actions builds an **unsigned debug Android APK** only.

## Current supported slice
- Email/password login for an already approved `notice_profiles` member
- Same data for web/Windows/mobile via RLS-constrained `notice_rooms` and `notice_messages`
- Conversation list, chronological message history and basic text send
- Mobile UI based on ASEA concept #3

## Incomplete before real users
- Username-only login with optional email, signup and administrator approval UI
- Department membership/room provisioning, message send authorization tests
- Push notifications FCM & APNs, background refresh and deep links
- Attachments, per-recipient read receipts, unread statistics and full design polish
- Signed Android release; iOS Xcode build, bundle identifier, signing and TestFlight
- Subscription costs/Apple Developer account approval and real-device verification

Never claim this initial source is a finished deployed app.
