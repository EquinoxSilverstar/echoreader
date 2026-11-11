# EchoReader

## Web demo

The app is built as a static website in `dist`; GitHub Pages must publish that build, not the repository's source or README. The included GitHub Actions workflow builds and deploys it whenever changes are pushed to `main`, or when manually started from the Actions tab.

In the repository settings, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**. After pushing to `main`, check the **Actions** tab for the “Deploy web demo” workflow. Once it succeeds, the app is available at `https://YOUR-USERNAME.github.io/Echo-Reader-DEMO/`.

To build locally, run `npm ci` followed by `npm run build:web`. The static site is exported to `dist` with the GitHub Pages base path `/Echo-Reader-DEMO` and a `.nojekyll` file. The base path is configured in `app.json` and must match the repository name, including capitalization.

The web library uses Open Library; Gutenberg is only available in native builds. Book text downloads depend on the source allowing browser requests.

Cloud voice API keys are not included in the web build. To use a cloud voice, enter its key in the narrator screen for the current browser session; the app does not save it. The browser sends the key directly to the chosen voice provider. For safer public use, prefer device voices or put provider calls behind a server.

Run `npm start`, `npm run android`, or `npm run ios` to start native development with values from the local `Api.env` file. Use `npm run web` for web development; it does not load `Api.env`.
