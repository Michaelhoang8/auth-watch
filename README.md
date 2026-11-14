# Auth Watch

Correlate authentication events and inspect bounded source evidence for suspicious activity.

![Auth Watch preview](docs/app.png)

The incident console summarizes alert triggers in 32 equal-duration time bins and separates high-priority triggers by color. This chart is not authentication-event volume. Alerts expand to reveal their evidence, with the first alert initially open. Reduced-motion and the local motion setting suppress chart transitions.

## Run

Requires Python 3.11+; no third-party runtime dependencies. Clone this repository and run from its root:

```sh
python run.py
```

Open http://127.0.0.1:8000/. Use `python run.py --port 8001` to run alongside another app.
Use the built-in **Load sample** / **Load an example** action for fictional input.

The local adapter creates an empty `data/auth-watch.db`; this analysis app has no persistent tables. The data directory is ignored by Git. `--database /path/to/app.db` selects another database. Uploaded analysis input is processed in memory. No other repository or shared service is required.

## API example

`examples/request.json` contains a fictional request body and its endpoint. Browser analysis requests use `Content-Type: application/json` and `X-Portfolio-Client: browser`; Notes requests use `X-API-Key`. All routes are local to this app.

## Architecture

The browser uses plain JavaScript and CSS, a loopback Python HTTP server validates requests, and domain functions produce the reports or transactional writes. `portfolio/` is the retained internal Python package name; this repository serves only **Auth Watch**. Its database contains only this app's tables. Shared validation, CSV helpers, and visual utilities have local copies, so changes can be released independently.

## Verify

```sh
python -m unittest discover -s tests -v
python check_js.py
node --test
```

Node.js 22+ is used for frontend checks only. GitHub Actions tests Linux on Python 3.11–3.13 and Windows on Python 3.13.

## Scope

Designed as a local portfolio/demo application. The standard-library server is not a production internet deployment. There is no multi-user authentication or tenant isolation.

## Source provenance

Extracted from [Portfolio Lab](https://github.com/Michaelhoang8/portfolio-lab) at commit `ce14f2cf297c6dfbd5895b9138626b7e69530ec0`. The original repository retains the genuine development history. This repository begins with the standalone extraction; history has not been backdated. Runtime databases and credentials were not copied.
