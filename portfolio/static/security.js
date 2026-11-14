"use strict";
const $ = (s) => document.querySelector(s);
const esc = (v) =>
  String(v).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let mode = "logs",
  result = null,
  busy = false,
  fileRevision = 0,
  findingView = null;
const config = {
  logs: [
    "Authentication events",
    "Detection report",
    "Analyze events →",
    "JSON Lines: timestamp (with timezone), ip, user, status (failure or success). Events are sorted before analysis.",
  ],
  headers: [
    "Response headers",
    "Header review",
    "Inspect headers →",
    "Paste one HTTP response header block. Review is heuristic; HTTPS and real browser behavior are not tested.",
  ],
  secrets: [
    "Source text",
    "Secret findings",
    "Scan text →",
    "Paste configuration or source text. Reports include rule names and line numbers, never credential values or snippets.",
  ],
};
const logSample = Array.from({ length: 5 }, (_, i) =>
  JSON.stringify({
    timestamp: `2026-01-15T10:0${i}:00Z`,
    ip: "192.0.2.10",
    user: "demo-admin",
    status: "failure",
  }),
)
  .concat(
    [
      JSON.stringify({
        timestamp: "2026-01-15T10:05:00Z",
        ip: "192.0.2.10",
        user: "demo-admin",
        status: "success",
      }),
    ],
    Array.from({ length: 5 }, (_, i) =>
      JSON.stringify({
        timestamp: `2026-01-15T11:0${i}:00Z`,
        ip: "198.51.100.20",
        user: `demo-user-${i}`,
        status: "failure",
      }),
    ),
  )
  .join("\n");
const samples = {
  logs: logSample,
  headers:
    "HTTP/1.1 200 OK\nContent-Type: text/html\nContent-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'\nStrict-Transport-Security: max-age=3600\nX-Content-Type-Options: nosniff\nReferrer-Policy: strict-origin-when-cross-origin\nSet-Cookie: demo_session=FICTIONAL; Secure; SameSite=Lax",
  secrets:
    '# Fictional examples. These are not real credentials.\npassword = "DEMO_ONLY_NOT_A_REAL_PASSWORD"\napi_key = "DEMO_ONLY_NOT_A_REAL_API_KEY"\nAuthorization: Bearer DEMO_ONLY_NOT_A_REAL_BEARER\n',
};
function message(text, error = false) {
  $("#notice").textContent = text;
  $("#notice").className = error ? "error" : "";
}
function invalidate() {
  findingView = null;
  result = null;
  $("#download").disabled = true;
  $("#result").innerHTML = window.analysisEmpty(mode);
}
function switchMode(next) {
  if (busy) return;
  fileRevision++;
  mode = "logs";
  window.designIdentity(mode);
  document
    .querySelectorAll("[data-mode]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.mode === mode)),
    );
  $("#input-title").textContent = config[mode][0];
  $("#result-title").textContent = config[mode][1];
  $("#run").textContent = config[mode][2];
  $("#input-help").textContent = config[mode][3];
  $("#log-options").hidden = mode !== "logs";
  $("#file-label").textContent =
    mode === "logs" ? "Choose a log file" : "Choose a text file";
  $("#file").accept = mode === "logs" ? ".jsonl,.ndjson,.log,.txt" : "";
  $("#source").value = "";
  invalidate();
  message("");
}
const stats = (items) =>
  `<div class="stats">${items.map(([k, v]) => `<div class="stat"><small>${esc(k)}</small><strong>${esc(v)}</strong></div>`).join("")}</div>`;
const table = (headers, rows) =>
  `<div class="table-scroll"><table><thead><tr>${headers.map((v) => `<th>${esc(v)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
const findingPageSize = 50;
function findingRange() {
  const start = findingView.page * findingPageSize,
    end = Math.min(start + findingPageSize, findingView.items.length);
  return `${start + 1}–${end} of ${findingView.items.length} findings`;
}
function findingCards() {
  const start = findingView.page * findingPageSize;
  return findingView.items
    .slice(start, start + findingPageSize)
    .map(findingView.renderer)
    .join("");
}
function findingList(items, renderer) {
  findingView = { items, renderer, page: 0 };
  if (!items.length) return "";
  return `<div id="finding-list">${findingCards()}</div><div id="finding-pages" class="response-pagination" role="group" aria-label="Finding pages" ${items.length <= findingPageSize ? "hidden" : ""}><button type="button" data-finding-page="-1" disabled>Previous findings</button><span id="finding-range" role="status" aria-live="polite">${findingRange()}</span><button type="button" data-finding-page="1">Next findings</button></div>`;
}
$("#result").addEventListener("click", (event) => {
  const button = event.target.closest("[data-finding-page]");
  if (!button || button.disabled || !findingView) return;
  const last = Math.ceil(findingView.items.length / findingPageSize) - 1;
  findingView.page = Math.max(
    0,
    Math.min(last, findingView.page + Number(button.dataset.findingPage)),
  );
  $("#finding-list").innerHTML = findingCards();
  $("#finding-range").textContent = findingRange();
  document.querySelector('[data-finding-page="-1"]').disabled =
    findingView.page === 0;
  document.querySelector('[data-finding-page="1"]').disabled =
    findingView.page === last;
  const heading = $("#finding-list h3");
  heading?.setAttribute("tabindex", "-1");
  heading?.focus({ preventScroll: true });
  $("#finding-list").scrollIntoView({ block: "start" });
});
function alertActivity(alerts) {
  if (!alerts.length)
    return '<div class="alert-activity"><h3>Alert activity</h3><p>No alert timestamps to plot.</p></div>';
  const times = alerts.map((a) => Date.parse(a.timestamp)),
    start = Math.min(...times),
    end = Math.max(...times),
    bins = Array.from({ length: 32 }, () => ({ high: 0, other: 0 }));
  alerts.forEach(
    (a, i) =>
      bins[
        Math.min(
          31,
          Math.floor(((times[i] - start) / Math.max(1, end - start)) * 32),
        )
      ][a.severity === "high" ? "high" : "other"]++,
  );
  const maximum = Math.max(...bins.map((b) => b.high + b.other), 1);
  const bars = bins
    .map((b, i) => {
      const high = (100 * b.high) / maximum,
        other = (100 * b.other) / maximum;
      return `<g><title>${b.high + b.other} alert triggers, ${b.high} high priority</title><rect x="${25 + i * 20}" y="${120 - high}" width="13" height="${high}" class="activity-high"/><rect x="${25 + i * 20}" y="${120 - high - other}" width="13" height="${other}" class="activity-other"/></g>`;
    })
    .join("");
  return `<div class="alert-activity"><h3>Alert triggers over time <small>Peak bin: ${maximum}</small></h3><svg viewBox="0 0 690 165" role="img" aria-label="32 equal-duration bins of alert triggers, orange indicates high priority"><line x1="25" x2="665" y1="120" y2="120"/>${bars}<text x="25" y="148">${esc(new Date(start).toISOString().replace("T", " ").replace(".000Z", " UTC"))}</text><text x="665" y="148" text-anchor="end">${esc(new Date(end).toISOString().replace("T", " ").replace(".000Z", " UTC"))}</text></svg><p>Alert triggers, not authentication-event volume. Orange: high priority · green: other alerts.</p></div>`;
}
function render(r) {
  if (mode === "logs") {
    $("#result").innerHTML =
      stats([
        ["Accepted events", r.accepted],
        ["Failed sign-ins", r.failures],
        ["Alerts", r.alerts.length],
      ]) +
      `<p class="summary">Threshold: ${r.threshold} failures / ${r.window_minutes} minutes. Alerts are investigation leads, not proof of compromise. Duplicate input events are retained; use deduplicated logs.</p>` +
      alertActivity(r.alerts) +
      findingList(
        r.alerts,
        (a, i) =>
          `<details class="finding ${a.severity}" ${i === 0 ? "open" : ""}><summary><h3>${esc(a.rule)}<small>${esc(a.severity)}</small></h3></summary><p>${esc(a.detail)}</p><p class="meta">${esc(a.timestamp)} · ${esc(a.ip)} · ${esc(a.user)}<br>Trigger line ${a.line} · ${a.count} ${esc(a.count_unit)}</p><details><summary>Evidence · ${a.evidence_lines.length} of ${a.evidence_total} failure events</summary><p class="meta">${esc(a.evidence_start)} to ${esc(a.evidence_end)}</p><p>Input lines: ${a.evidence_lines.map(esc).join(", ")}. ${a.evidence_truncated ? "Showing the latest 50 failures in event-time order." : "Listed in event-time order."}</p></details></details>`,
      ) +
      (r.alerts.length
        ? ""
        : "<p>No rules triggered for this input and configuration.</p>") +
      "<h3>Top failure sources</h3>" +
      table(
        ["Source IP", "Failures"],
        r.top_sources.map((s) => [s.ip, s.failures]),
      ) +
      `<h3>Rejected lines (${r.rejected.length})</h3>` +
      table(
        ["Line", "Reason"],
        r.rejected.slice(0, 20).map((e) => [e.line, e.reason]),
      );
  } else if (mode === "headers") {
    $("#result").innerHTML =
      stats([
        ["Checks", r.findings.length],
        ["Review needed", r.review_count],
        ["Observed controls", r.observed_count],
      ]) +
      `<p class="summary">${esc(r.note)}</p>` +
      findingList(
        r.findings,
        (f) =>
          `<article class="finding ${f.status}"><h3>${esc(f.control)}<small>${esc(f.status)}</small></h3><p>${esc(f.detail)}</p><p class="action">${esc(f.action)}</p></article>`,
      ) +
      `<p class="hint">Duplicate headers: ${esc(r.duplicate_headers.join(", ") || "none")}. Malformed lines: ${esc(r.malformed_lines.join(", ") || "none")}.</p>`;
  } else {
    $("#result").innerHTML =
      stats([
        ["Lines scanned", r.lines_scanned],
        ["Potential secrets", r.count],
        ["Raw values returned", 0],
      ]) +
      `<p class="summary">${esc(r.note)}</p>` +
      findingList(
        r.findings,
        (f) =>
          `<article class="finding ${f.severity}"><h3>${esc(f.rule)}<small>${esc(f.severity)}</small></h3><p>Line ${f.line} · credential value withheld</p><p class="action">${esc(f.action)}</p></article>`,
      ) +
      (r.count
        ? ""
        : "<p>No supported patterns matched. This is not a guarantee that the text contains no secrets.</p>");
  }
}
document.querySelectorAll("[data-mode]").forEach((b) =>
  b.addEventListener("click", () => {
    location.hash = b.dataset.mode;
  }),
);
$("#sample").addEventListener("click", () => {
  fileRevision++;
  $("#source").value = samples[mode];
  invalidate();
  message("Fictional sample loaded.");
});
$("#clear").addEventListener("click", () => {
  fileRevision++;
  $("#source").value = "";
  invalidate();
  message("Input and results cleared.");
});
document.querySelectorAll("textarea,input:not([type=file])").forEach((e) =>
  e.addEventListener("input", () => {
    fileRevision++;
    invalidate();
    message("Input changed. Run the analysis to update the report.");
  }),
);
$("#file").addEventListener("change", async () => {
  const file = $("#file").files?.[0];
  $("#file").value = "";
  if (!file) return;
  const revision = ++fileRevision;
  const limit = 500000,
    limitLabel = "500 KB";
  try {
    message(`Reading ${file.name}…`);
    const text = await window.localTextFile.read(file, limit, limitLabel);
    if (revision !== fileRevision || busy) return;
    $("#source").value = text;
    invalidate();
    message(`Loaded ${file.name}. Review the input, then run the analysis.`);
  } catch (error) {
    if (revision === fileRevision) message(error.message, true);
  }
});
$("#run").addEventListener("click", async () => {
  if (busy) return;
  fileRevision++;
  busy = true;
  window.analysisBusy(true);
  result = null;
  const controls = [
    ...document.querySelectorAll("button,input,select,textarea"),
  ];
  const disabled = controls.map((c) => c.disabled);
  controls.forEach((c) => (c.disabled = true));
  message("Analyzing locally…");
  try {
    const body = {
      text: $("#source").value,
      threshold: Number($("#threshold").value),
      window_minutes: Number($("#window").value),
    };
    const data = await window.analysisRequest(`/api/security/${mode}`, {
      ...body,
      ...window.capabilityInputs(),
    });
    result = data;
    if (mode === "secrets") $("#source").value = "";
    render(data);
    window.renderCapabilities(data);
    message(
      mode === "secrets"
        ? "Scan complete. Input cleared; raw credentials are absent from the report."
        : "Analysis complete. Input was not saved.",
    );
  } catch (e) {
    invalidate();
    message(e.message, true);
  } finally {
    busy = false;
    controls.forEach((c, index) => (c.disabled = disabled[index]));
    $("#download").disabled = !result;
    window.analysisBusy(false, !!result);
  }
});
$("#download").addEventListener("click", () => {
  if (!result) return;
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `security-${mode}-report.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
switchMode("logs");
