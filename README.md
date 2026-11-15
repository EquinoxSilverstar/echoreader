# EchoReader

## Web demo

The **Deploy web demo** workflow builds the app into `dist` and publishes it to GitHub Pages on pushes to `master`. You can also start it manually from the **Actions** tab.

In the repository settings, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**. When the workflow succeeds, open [the EchoReader web demo](https://equinoxsilverstar.github.io/echoreader/).

To build locally, use Node.js 24 and run `npm ci` followed by `npm run build:web`. The static site is exported to `dist` with the GitHub Pages base path `/echoreader`, configured in `app.json`.

The web library uses Open Library; Gutenberg is only available in native builds. Book text downloads depend on the source allowing browser requests.

Cloud voice API keys are not included in the web build. To use a cloud voice, enter its key in the narrator screen for the current browser session; the app does not save it. The browser sends the key directly to the chosen voice provider. For safer public use, prefer device voices or put provider calls behind a server.

Run `npm start`, `npm run android`, or `npm run ios` to start native development with values from the local `Api.env` file. Use `npm run web` for web development; it does not load `Api.env`.
