# EchoReader

## Web demo

The **Deploy web demo** workflow builds the app into `dist` and publishes it to GitHub Pages on pushes to `master`. You can also start it manually from the **Actions** tab.

In the repository settings, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**. When the workflow succeeds, open [the EchoReader web demo](https://equinoxsilverstar.github.io/echoreader/).

To build locally, use Node.js 24 and run `npm ci` followed by `npm run build:web`. The static site is exported to `dist` with the GitHub Pages base path `/echoreader`, configured in `app.json`.

Run backend tests with `npm test`. For browser checks, build the web export, install Chromium once with `npx playwright install chromium`, then run `npm run test:e2e`.

The library is for your own books. Import EPUB, TXT, or Markdown (`.md`) files from your device, then open a book from your shelf to listen or read it. Imported books and reading position remain in memory for the current session.

Device narration uses the voices installed on the user's device or browser and works without cloud credentials or an account. ElevenLabs and Google narration use the authenticated Firebase Functions backend; their API keys are never placed in the web or native client. Configure `EXPO_PUBLIC_TTS_PROXY_URL` with the deployed function URL to enable cloud voices.

### Optional cloud narration backend

The backend is prepared in `functions/` but is not deployed or enabled by this project. Cloud Functions and Firestore usage may incur charges and require a Firebase billing plan. Review pricing and explicitly approve enabling those services before deployment.

1. In Firebase, enable Cloud Functions and Firestore for the existing Firebase project. Cloud Functions deployment may require the Blaze plan. Enable the Google Cloud Text-to-Speech API only if you intend to use Google voices.
2. From the project root, install the Functions dependencies with `npm --prefix functions install`.
3. Store provider credentials in the Firebase Secret Manager JSON secret; do not put them in `Api.env`, `.env.local`, GitHub variables, or any `EXPO_PUBLIC_*` setting. The CLI prompts for the value; include only providers you intend to use (or `{}` to deploy with cloud voices disabled):

   ```sh
   firebase functions:secrets:set TTS_PROVIDER_KEYS
   ```

   The JSON object may contain `eleven` and/or `google`, each with its provider API key. Restrict a Google API key to Cloud Text-to-Speech.
4. Ensure Firestore security rules deny all client reads and writes to `/ttsUsage/{userId}`. The Functions Admin SDK uses this collection for server-side rate and daily usage limits; normal client SDK access is not required.
5. Restrict HTTP origins in `functions/src/tts-core.js` to the exact production Pages origin and any local development origins you use. Native requests omit `Origin`; browser requests are checked against this allowlist.
6. After reviewing cost controls and provider billing, deploy only when approved:

   ```sh
   firebase deploy --only functions:ttsGateway
   ```

7. Copy the resulting HTTPS function URL into the GitHub Actions repository variable `EXPO_PUBLIC_TTS_PROXY_URL`. For local native development, put the URL in `Api.env`; for local web development, set it in `.env.local`. The endpoint URL is public configuration, not a secret.

The backend requires a valid Firebase Authentication ID token. It limits authenticated users to 10 requests per minute, 100 requests per UTC day, and 100,000 text characters per UTC day, and caps returned audio at 8 MiB. Provider API usage can still be billable; do not configure provider secrets unless you accept those charges. When cloud service configuration or requests fail, users can continue with device narration.

Run `npm start`, `npm run android`, or `npm run ios` to start native development with values from the local `Api.env` file. Use `npm run web` for web development; it does not load `Api.env`.

## Real accounts

1. Create a project in the [Firebase console](https://console.firebase.google.com/) and register a **Web** app in it. Copy the values from its Web app configuration.
2. In **Authentication → Sign-in method**, enable **Email/Password**. Set the minimum password length to 8 under **Authentication → Settings → Password policy** to match the signup form. EchoReader uses Firebase's hosted password reset page. Add an authorized domain if you later configure an OAuth provider or set a custom return URL in account emails.
3. In GitHub, open **Settings → Secrets and variables → Actions → Variables** and create these four repository variables.

   | Repository variable | Firebase web config field |
   | --- | --- |
   | `EXPO_PUBLIC_FIREBASE_API_KEY` | `apiKey` |
   | `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` | `authDomain` |
   | `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | `projectId` |
   | `EXPO_PUBLIC_FIREBASE_APP_ID` | `appId` |

4. Open **Actions → Deploy web demo → Run workflow** to rebuild the site with those values. Test by creating an account, signing out and back in, and requesting a password reset link.

For local development, put the same four values in `.env.local`. For a local production export, set them in your shell before running `npm run build:web`, which skips loading dotenv files. These are public client configuration values. Keep service-account credentials and voice provider keys out of the client build.

Guest mode works without Firebase configuration and does not include an Account tab. Signed-in users can update their display name; their imported books and profile picture are currently available only during the current session.
