# EchoReader

## Web demo

Install dependencies with `npm install`, then run `npm run build:web`. The static site is exported to `dist` with the GitHub Pages base path `/Echo-Reader-DEMO` and a `.nojekyll` file. Publish the contents of `dist` to the repository's GitHub Pages source.

The web library uses Open Library; Gutenberg is only available in native builds. Book text downloads depend on the source allowing browser requests.

Cloud voice API keys are not included in the web build. To use a cloud voice, enter its key in the narrator screen for the current browser session; the app does not save it. The browser sends the key directly to the chosen voice provider. For safer public use, prefer device voices or put provider calls behind a server.

Run `npm run android` or `npm run ios` to start native development with values from the local `Api.env` file.
