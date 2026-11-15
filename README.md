# EchoReader

## Web demo

The **Deploy web demo** workflow builds the app into `dist` and publishes it to GitHub Pages on pushes to `master`. You can also start it manually from the **Actions** tab.

In the repository settings, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**. When the workflow succeeds, open [the EchoReader web demo](https://equinoxsilverstar.github.io/echoreader/).

To build locally, use Node.js 24 and run `npm ci` followed by `npm run build:web`. The static site is exported to `dist` with the GitHub Pages base path `/echoreader`, configured in `app.json`.

The web library uses Open Library; Gutenberg is only available in native builds. Book text downloads depend on the source allowing browser requests.

Cloud voice API keys are not included in the web build. To use a cloud voice, enter its key in the narrator screen for the current browser session; the app does not save it. The browser sends the key directly to the chosen voice provider. For safer public use, prefer device voices or put provider calls behind a server.

Run `npm start`, `npm run android`, or `npm run ios` to start native development with values from the local `Api.env` file. Use `npm run web` for web development; it does not load `Api.env`.

## Real accounts

1. Create a project in the [Firebase console](https://console.firebase.google.com/) and register a **Web** app in it. Copy the values from its Web app configuration.
2. In **Authentication → Sign-in method**, enable **Email/Password**. Set the minimum password length to 8 under **Authentication → Settings → Password policy** to match the signup form. In **Settings → Authorized domains**, add `equinoxsilverstar.github.io`. Add `localhost` there if you use it for local testing and it is missing.
3. In GitHub, open **Settings → Secrets and variables → Actions → Variables** and create these four repository variables.

   | Repository variable | Firebase web config field |
   | --- | --- |
   | `EXPO_PUBLIC_FIREBASE_API_KEY` | `apiKey` |
   | `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` | `authDomain` |
   | `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | `projectId` |
   | `EXPO_PUBLIC_FIREBASE_APP_ID` | `appId` |

4. Open **Actions → Deploy web demo → Run workflow** to rebuild the site with those values. Test by creating an account, signing out and back in, and requesting a password reset link.

For local development, put the same four values in `.env.local`. For a local production export, set them in your shell before running `npm run build:web`, which skips loading dotenv files. These are public client configuration values. Keep service-account credentials and voice provider keys out of the client build.

Guest mode works without Firebase configuration. Accounts handle sign-in and password recovery. The library and reading position remain in memory for the current session.
