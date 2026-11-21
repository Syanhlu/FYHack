# Profile Lens: local setup on another computer

This guide sets up the real Chrome extension and live AI backend from the `main` branch. Repeat it on each computer. Run commands from the repository root unless a step says otherwise.

## What runs where

| Component                 | Location                               | Purpose                                                                                         |
| ------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Profile Lens extension    | Your desktop Chrome profile            | Reads the current profile after a toolbar click, lets you review the text, and displays results |
| Local API                 | `http://127.0.0.1:8787`                | Authenticates the extension, calls OpenAI, and validates responses                              |
| Fictional sample profiles | `http://localhost:4173`                | Provides repeatable input for testing and demos                                                 |
| OpenAI API                | Internet connection from the local API | Generates the analysis, drafts, board selections and romantic soundtrack selection              |

No database, Docker, cloud deployment, Pinterest account or music API key is needed. Moodboard illustrations and the song catalogue are bundled. The profile examples are fictional; their results are generated live. AI requests require provider access and incur API usage.

The extension always connects to the backend on the **same computer**. Running the API on one teammate's laptop does not serve other laptops. Keep the default ports for the simplest setup; the extension's API URL and content-security policy are fixed to port 8787.

## 1. Install prerequisites

Install Git, desktop Google Chrome, and **Node.js 24 LTS** with npm. The repository's `.nvmrc` selects Node 24. A clean checkout passed installation, build, typecheck, lint, 33 unit/component tests and 3 browser integration tests under Node 24.22.3 on macOS. Windows and Linux instructions are provided, but native execution on those operating systems was not verified here. See [VALIDATION.md](VALIDATION.md).

Use the native terminal for your operating system: Terminal on macOS, PowerShell or Command Prompt on Windows, or your usual Linux shell. On Windows, keep Chrome and the backend in the same native Windows environment for the first setup rather than mixing Windows Chrome with WSL networking.

- [Node.js downloads](https://nodejs.org/en/download) and [supported release lines](https://nodejs.org/en/about/previous-releases).
- [Git downloads](https://git-scm.com/downloads).
- [Google Chrome](https://www.google.com/chrome/).

Open a new terminal after installation and check:

```sh
git --version
node --version
npm --version
```

Install the exact package manager used by this workspace:

```sh
npm install --global pnpm@10.28.0
pnpm --version
```

The pnpm version should be `10.28.0`. If global installation is inconvenient, skip it and replace **every** `pnpm` command below with `npx --yes pnpm@10.28.0`. For example:

```sh
npx --yes pnpm@10.28.0 install --frozen-lockfile
npx --yes pnpm@10.28.0 build
npx --yes pnpm@10.28.0 demo
```

This also avoids a global-install permission problem. The workspace pins its package manager in `package.json`; keep that version instead of installing an unspecified latest release. See the [official pnpm installation instructions](https://pnpm.io/10/installation) for other installation options.

## 2. Clone and build

```sh
git clone --branch main https://github.com/Syanhlu/FYHack.git
cd FYHack
pnpm install --frozen-lockfile
pnpm build
```

If GitHub asks you to authenticate, use an account with access to the repository. Build from a normal local directory you intend to keep: moving an unpacked extension later can change its ID.

`pnpm build` creates the production extension and runs TypeScript checks. The directory you will load into Chrome is:

```text
FYHack/apps/extension/.output/chrome-mv3
```

It must contain `manifest.json`, `panel.html`, `background.js` and the built assets. The dot-prefixed `.output` directory may be hidden in file pickers. Copy the full directory path or show hidden files if needed. On macOS, use Command+Shift+G in the folder picker to enter the full path.

Dependencies, generated builds, private `.env` files and test output are intentionally excluded from Git. A fresh clone needs the install and build steps; copying only the source extension directory into Chrome will not work.

## 3. Load Profile Lens into Chrome

1. Open `chrome://extensions` in the Chrome profile you will use for the demo.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select `apps/extension/.output/chrome-mv3` inside your clone. Select the directory containing `manifest.json`, not the repository root or a ZIP file.
4. Confirm that **Profile Lens** is enabled.
5. Open Chrome's extensions menu (the puzzle icon) and pin **Profile Lens** to the toolbar.
6. Copy the **ID** shown on the Profile Lens extension card. It is 32 lowercase letters. You will use this computer's ID in the next step.

Do not copy the original developer's extension ID from validation notes. IDs can differ with the Chrome profile, checkout path or build mode. The backend accepts one exact extension origin at a time.

These steps use Chrome's standard [unpacked-extension installation flow](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked). If your organization manages Chrome and disables Developer mode or unpacked extensions, use an authorized development browser/device.

## 4. Create the local configuration

Make a root `.env` file from `.env.example`. Run this only on first setup; keep an existing `.env` when updating the project.

macOS or Linux:

```sh
cp .env.example .env
chmod 600 .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Windows Command Prompt:

```bat
copy .env.example .env
```

Generate a local connection token with this command, which works in all three shells:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Open `.env` in your editor and fill it in:

```dotenv
PROVIDER=live
API_HOST=127.0.0.1
API_PORT=8787
ALLOWED_EXTENSION_ORIGIN=chrome-extension://YOUR_32_LETTER_EXTENSION_ID
BACKEND_ACCESS_TOKEN=PASTE_YOUR_GENERATED_LOCAL_TOKEN
OPENAI_API_KEY=PASTE_YOUR_OPENAI_API_KEY
OPENAI_MODEL=gpt-5.4
OPENAI_REASONING_EFFORT=low
ANALYSIS_TIMEOUT_MS=60000
MAX_OUTPUT_TOKENS=8000
```

Replace each uppercase placeholder; do not include angle brackets or add a trailing slash to the extension origin. The recommended configuration uses `gpt-5.4` with low reasoning for responsive, detail-led text analysis. You can configure another model supported by your account, but it must support the Responses API and Structured Outputs and pass the live smoke check below. Leave `OPENAI_REASONING_EFFORT` blank for a model without configurable reasoning.

| Setting                    | How to choose it                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| `ALLOWED_EXTENSION_ORIGIN` | `chrome-extension://` followed by the ID from this computer's installed extension         |
| `BACKEND_ACCESS_TOKEN`     | The random token generated above; at least 24 characters                                  |
| `OPENAI_API_KEY`           | Your authorized OpenAI API credential; use a separate local configuration for each device |
| `OPENAI_MODEL`             | Start with the tested model above if your API account can access it                       |
| Remaining values           | Keep the shown defaults for the initial setup                                             |

There are **two different credentials**: the OpenAI key stays in the local backend's `.env`; only the local connection token goes into Chrome. The actual `.env` is gitignored. Do not commit it or include it when sharing a project ZIP.

If `BACKEND_ACCESS_TOKEN` is left blank, the API generates and prints a new token every time it starts. A configured random token is more convenient for repeat demos: it stays the same across API restarts, and the server does not print it.

## 5. Start the local services

From the repository root:

```sh
pnpm demo
```

Leave this terminal running. It starts the API and sample-profile server together. Look for:

```text
Profile Lens live API ready at http://127.0.0.1:8787
```

The sample server should also report `http://localhost:4173`. If you configured a fixed backend token, the API tells you to use the value from `.env` rather than displaying it.

Open these URLs in Chrome:

- `http://127.0.0.1:8787/health` should show `{"ok":true}`. This checks that the API process is reachable; it does not verify your OpenAI credential or billing.
- `http://localhost:4173` should display Alex Morgan's fictional profile.

Use **Ctrl+C** in the server terminal to stop both services. Restart `pnpm demo` after editing `.env`; the development watcher does not reliably restart for environment-file changes.

## 6. Connect the extension

1. With the sample profile active, click the **Profile Lens toolbar icon** to open Profile Lens as a movable overlay on the page and grant temporary access to that tab. Click the icon again, or the ✕, to close it.
2. Open **Connection settings** using the settings icon in the panel header.
3. Copy only the `BACKEND_ACCESS_TOKEN` value from `.env` into **Backend token**. Do not paste the `BACKEND_ACCESS_TOKEN=` prefix or the OpenAI key.
4. Click **Check & save**.
5. Confirm **Connected. Live analysis is ready.**, then close settings.

This checks API reachability, the exact extension origin, the local token, and version compatibility. It does not make a paid AI request. The token is stored in extension **session** storage: after restarting Chrome, reloading the extension or resetting settings, enter it again. An unchanged fixed token usually survives an API restart without needing to reconnect the still-open Chrome session.

## 7. Verify both modes

For Outreach:

1. Click **Read this profile** on Alex's sample page.
2. Expect five retained snippets. Expand **Their profile text** and review them; you can edit or remove text.
3. Optionally enter your own interests or the topic you want to learn about.
4. Click **Generate ideas**. This is when reviewed text is sent to the local API and OpenAI.
5. Check for the **Live analysis** label, a six-tile professional moodboard, cited conversation starters, and editable outreach drafts.

For Romantic Pursue:

1. Select **Romantic Pursue**. Switching modes keeps the reviewed input but discards the previous mode's result.
2. Use an adult fictional profile for rehearsal. Confirm the adult eligibility checkbox only when its conditions apply, and set the tone, budget and indoor/outdoor preference.
3. Generate and inspect date possibilities, invitation drafts, a scrapbook board and a soundtrack pick. The scrapbook is built from the person's analysed Instagram photos and needs at least three, two of them showing one person clearly; otherwise the result says there is not enough photo material. The soundtrack is original music generated in the browser for the chosen tone and the moodboard's mood; it starts with the result, the record spins while it plays, and it has a pause button. No recordings are played or linked.

The sample page's **Meet Jamie** button changes the person. The extension should clear the old result, after which you read the new profile. For a third-party site, click the toolbar icon on that site's profile before reading. Extraction is best-effort; **Or paste profile text** is the fallback when the page structure is unsupported.

Optional paid provider verification, from a second terminal in the repository root:

```sh
pnpm eval:live
```

It calls the configured provider once per mode with synthetic input and validates schemas and references. Expect `outreach: ready` and `romantic: ready`. It uses root `.env` directly and can run without the API server; it does not replace the browser-flow check or human review of suggestion quality.

## 8. Daily use and updating

For an ordinary restart, run `pnpm demo`, open the sample or another profile, and reconnect the local token if Chrome's extension session was cleared. The unpacked extension remains installed while its build directory remains in place.

To update from GitHub, stop your running services and then run:

```sh
git pull --ff-only origin main
pnpm install --frozen-lockfile
pnpm build
```

Go to `chrome://extensions` and click **Reload** on Profile Lens. Refresh the profile tab, check that the extension ID still matches `.env`, restart `pnpm demo`, and reconnect the token. Keep `.env`; do not copy the template over your configured file.

If you have local code changes, commit or otherwise preserve them before pulling. Do not discard them just to complete an update.

## 9. Development and automated tests

For a repeatable presentation, use the production build with `pnpm demo`. For active coding, `pnpm dev` also starts WXT's extension development tooling; its extension ID and hot-reload permissions can differ, so configure the ID of the build actually loaded in Chrome.

The following checks do not use paid AI:

```sh
pnpm typecheck
pnpm lint
pnpm test
```

For browser integration tests, stop the demo first so port 8787 is available:

```sh
pnpm exec playwright install chromium
pnpm test:e2e
pnpm build
```

On Linux, Playwright may need system libraries; its supported installer is `pnpm exec playwright install --with-deps chromium` ([official installation documentation](https://playwright.dev/docs/browsers#install-system-dependencies)). Browser tests launch an isolated Chromium profile and a test-only provider; they do not drive your personal Chrome profile or call OpenAI.

`test:e2e` uses a build with an extra localhost host permission. The final `pnpm build` restores the production manifest. Reload the production extension in Chrome after testing, restart the live demo, and reconnect its token if required.

To produce a shareable extension ZIP:

```sh
pnpm package:demo
```

The ZIP is written under `apps/extension/.output/`. A recipient must unzip it before using **Load unpacked**, and still needs the source/backend, their own local `.env`, and a running local API. The ZIP contains the extension only, not a backend or credentials.

## Troubleshooting

| Symptom                                                      | What to check                                                                                                                                                                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm: command not found` or global install denied           | Use `npx --yes pnpm@10.28.0` in place of `pnpm`, or reopen the terminal after installing pnpm.                                                                                                                           |
| PowerShell refuses to run `npm.ps1`, `npx.ps1` or `pnpm.ps1` | Use Command Prompt, or the corresponding `npm.cmd`, `npx.cmd` or `pnpm.cmd` launcher. No execution-policy change is needed for these alternatives.                                                                       |
| Node version / syntax error during install or build          | Select Node 24, reopen the shell, check `node --version`, then rerun the frozen-lockfile install and build.                                                                                                              |
| Git clone says repository not found                          | Check the URL and authenticate to GitHub with an account that has access.                                                                                                                                                |
| Missing manifest / cannot find `.output`                     | Finish `pnpm build`; select the exact `chrome-mv3` directory, and show hidden files or paste its full path.                                                                                                              |
| API exits with “Setup needed”                                | `.env` must be at the repository root with a key, model and exact `chrome-extension://` origin. Check that it was not saved as `.env.txt`.                                                                               |
| `EADDRINUSE` or “port already in use”                        | Stop the previous Profile Lens service terminal. Both the extension and tests expect 8787, and sample pages expect 4173. Avoid changing only `.env`'s port.                                                              |
| “Backend unavailable”                                        | Keep `pnpm demo` running on the same computer. Test the health URL. Check for a proxy/VPN configuration that intercepts local traffic.                                                                                   |
| “The local token was not accepted”                           | Copy the fixed token from this device's `.env`, or the newest generated token if that setting is blank. Restart the API after changing it.                                                                               |
| “Connection rejected”                                        | Compare the extension ID shown in settings with `ALLOWED_EXTENSION_ORIGIN`; include the scheme and omit a trailing slash, then restart the API.                                                                          |
| Settings connect, but Generate reports provider unavailable  | Connection testing only reaches the local API. Check the OpenAI key, model access, API billing/credits and outbound internet access; use the paid live smoke check to isolate provider issues.                           |
| “The result could not be verified”                           | Validation rejected that model response. Retry deliberately, or review/reduce the input. There is no automatic saved-response fallback.                                                                                  |
| Timeout                                                      | Retry with less text. The API accepts `ANALYSIS_TIMEOUT_MS` from 1000 to 60000; restart it after changing this value. The live-evaluation scripts use the same configured deadline and reasoning settings as the server. |
| Cannot read a page                                           | Click Profile Lens's toolbar icon on the current tab to grant access, then read again. Chrome internal pages and some site structures cannot be extracted; paste the relevant visible text instead.                      |
| Token or results disappear after a reload                    | This is expected: the connection token is session-only and analysis state lives in panel memory. Reconnect and read again.                                                                                               |
| Changes are not visible in Chrome                            | Rebuild, reload the extension from `chrome://extensions`, and refresh the target profile tab.                                                                                                                            |
| Browser tests cannot launch Chromium                         | Run the Playwright browser installer; Linux may also require its system dependencies. Check that no live API is occupying 8787.                                                                                          |

For architecture and extension points, see [ARCHITECTURE.md](ARCHITECTURE.md) and [ADDING_A_MODE.md](ADDING_A_MODE.md). For the presentation sequence and outstanding manual checks, see [DEMO_SCRIPT.md](DEMO_SCRIPT.md) and [VALIDATION.md](VALIDATION.md).
