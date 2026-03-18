import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { basename, delimiter, resolve } from "node:path";
import { inflateSync } from "node:zlib";
import {
  DEFAULT_TENCENT_SDK_APP_ID,
  type PopopoClient,
} from "./client.ts";
import { PopopoApiError } from "./errors.ts";

export type LiveAudioPublishOptions = {
  spaceKey?: string;
  browser?: "auto" | "chromium" | "firefox";
  browserPath?: string;
  headless?: boolean;
  audioFilePath?: string;
  loop?: boolean;
  toneHz?: number;
  gain?: number;
  durationMs?: number;
  publishTimeoutMs?: number;
};

type PublisherSourceConfig =
  | {
      kind: "file";
      audioBase64: string;
      gain: number;
      loop: boolean;
    }
  | {
      kind: "tone";
      toneHz: number;
      gain: number;
    };

type PlaywrightModule = typeof import("playwright-core");
type BrowserName = "chromium" | "firefox";

type BrowserExecutable = {
  name: BrowserName;
  path: string;
};
export async function publishLiveAudio(
  client: PopopoClient,
  options: LiveAudioPublishOptions,
): Promise<Record<string, unknown>> {
  const session = client.getSession();
  const spaceKey = options.spaceKey ?? session.currentSpaceKey;

  if (!spaceKey) {
    throw new Error(
      "No target space is available. Pass --space-key or join a space first.",
    );
  }

  const trtcVendorRoot = resolve(import.meta.dir, "../node_modules/trtc-sdk-v5");
  const trtcScriptPath = resolve(trtcVendorRoot, "trtc.js");

  if (!existsSync(trtcScriptPath)) {
    throw new Error(
      "Optional dependency `trtc-sdk-v5` is not installed. Run `bun install` in `client_lib`.",
    );
  }

  await ensureSpaceConnected(client, spaceKey);
  const rawConnectionInfo = await client.spaces.connectionInfo<Record<string, unknown>>(
    spaceKey,
    {},
  );
  const userSig = optionalString(rawConnectionInfo.userSig);
  const privateMapKey = optionalString(rawConnectionInfo.privateMapKey);
  const decodedUserSig = decodeTencentCompactToken(userSig);
  const sdkAppId =
    toFiniteNumber(decodedUserSig?.["TLS.sdkappid"]) ?? DEFAULT_TENCENT_SDK_APP_ID;
  const userId = optionalString(decodedUserSig?.["TLS.identifier"]) ?? session.userId;

  if (!userSig || !privateMapKey || !userId) {
    throw new Error("Space connection info does not contain usable TRTC credentials.");
  }

  const browserExecutable = resolveBrowserExecutable(options);
  const headless = options.headless ?? true;
  const source = await resolvePublisherSource(options);
  const publishTimeoutMs = options.publishTimeoutMs ?? 15000;
  const durationMs = options.durationMs;
  return runPublisherInNode({
    browser: browserExecutable.name,
    browserPath: browserExecutable.path,
    headless,
    source,
    publishTimeoutMs,
    durationMs: durationMs ?? null,
    sdkAppId,
    userId,
    userSig,
    privateMapKey,
    spaceKey,
    trtcVendorRoot,
  });
}

async function ensureSpaceConnected(
  client: PopopoClient,
  spaceKey: string,
): Promise<void> {
  try {
    await client.spaces.connect(spaceKey, { muted: false });
  } catch (error) {
    if (
      error instanceof PopopoApiError &&
      error.status === 409 &&
      typeof error.body === "object" &&
      error.body &&
      "message" in error.body &&
      String(error.body.message).includes("既にオンライン")
    ) {
      return;
    }

    if (
      error instanceof PopopoApiError &&
      error.status === 403 &&
      typeof error.body === "object" &&
      error.body &&
      "message" in error.body &&
      String(error.body.message).includes("スペースのユーザーではありません")
    ) {
      throw new Error(
        "You are not a member of this space. Join it first with `uset invites accept --code <invite-url-or-key>`.",
      );
    }

    throw error;
  }
}

async function resolvePublisherSource(
  options: LiveAudioPublishOptions,
): Promise<PublisherSourceConfig> {
  const gain = options.gain ?? 0.15;

  if (options.audioFilePath) {
    const filePath = resolve(options.audioFilePath);
    const audioBase64 = await readFile(filePath, "base64");

    return {
      kind: "file",
      audioBase64,
      gain,
      loop: options.loop ?? false,
    };
  }

  return {
    kind: "tone",
    toneHz: options.toneHz ?? 440,
    gain,
  };
}

function resolveBrowserExecutable(
  options: LiveAudioPublishOptions,
): BrowserExecutable {
  const preferredBrowser = options.browser ?? "auto";

  if (options.browserPath) {
    const inferredName = inferBrowserNameFromPath(options.browserPath);

    return {
      name: preferredBrowser === "auto" ? inferredName : preferredBrowser,
      path: options.browserPath,
    };
  }

  for (const candidate of getBrowserCandidates(preferredBrowser)) {
    if (existsSync(candidate.path)) {
      return candidate;
    }
  }

  const expectedBrowsers =
    preferredBrowser === "auto" ? "Chromium/Chrome/Edge/Firefox" : preferredBrowser;
  throw new Error(
    `No supported ${expectedBrowsers} executable was found. Pass --browser-path.`,
  );
}

function inferBrowserNameFromPath(browserPath: string): BrowserName {
  const filename = basename(browserPath).toLowerCase();

  if (filename.includes("firefox")) {
    return "firefox";
  }

  return "chromium";
}

function getBrowserCandidates(preferredBrowser: "auto" | BrowserName): BrowserExecutable[] {
  const orderedNames =
    preferredBrowser === "auto"
      ? (["chromium", "firefox"] as const)
      : ([preferredBrowser] as const);
  const knownPathsByBrowser = getKnownBrowserPaths();
  const pathExecutableNamesByBrowser = getPathExecutableNames();
  const candidates: BrowserExecutable[] = [];
  const seenPaths = new Set<string>();

  for (const browserName of orderedNames) {
    for (const candidatePath of knownPathsByBrowser[browserName]) {
      pushBrowserCandidate(candidates, seenPaths, browserName, candidatePath);
    }

    for (const candidatePath of resolveExecutablesFromPath(
      pathExecutableNamesByBrowser[browserName],
    )) {
      pushBrowserCandidate(candidates, seenPaths, browserName, candidatePath);
    }
  }

  return candidates;
}

function getKnownBrowserPaths(): Record<BrowserName, string[]> {
  switch (process.platform) {
    case "win32":
      return {
        chromium: [
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
          "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
          "C:\\Program Files\\Chromium\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Chromium\\Application\\chrome.exe",
        ],
        firefox: [
          "C:\\Program Files\\Mozilla Firefox\\firefox.exe",
          "C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe",
        ],
      };
    case "darwin":
      return {
        chromium: [
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
          "/Applications/Chromium.app/Contents/MacOS/Chromium",
        ],
        firefox: [
          "/Applications/Firefox.app/Contents/MacOS/firefox",
        ],
      };
    default:
      return {
        chromium: [
          "/usr/bin/google-chrome",
          "/usr/bin/google-chrome-stable",
          "/usr/bin/chromium",
          "/usr/bin/chromium-browser",
          "/usr/bin/microsoft-edge",
          "/usr/bin/microsoft-edge-stable",
          "/snap/bin/chromium",
        ],
        firefox: [
          "/usr/bin/firefox",
          "/snap/bin/firefox",
        ],
      };
  }
}

function getPathExecutableNames(): Record<BrowserName, string[]> {
  switch (process.platform) {
    case "win32":
      return {
        chromium: ["chrome.exe", "msedge.exe", "chromium.exe"],
        firefox: ["firefox.exe"],
      };
    default:
      return {
        chromium: [
          "google-chrome",
          "google-chrome-stable",
          "chromium",
          "chromium-browser",
          "microsoft-edge",
          "microsoft-edge-stable",
        ],
        firefox: ["firefox"],
      };
  }
}

function resolveExecutablesFromPath(executableNames: string[]): string[] {
  const results: string[] = [];
  const pathValue = process.env.PATH ?? "";

  for (const directory of pathValue.split(delimiter)) {
    if (!directory) {
      continue;
    }

    for (const executableName of executableNames) {
      const candidatePath = resolve(directory, executableName);
      if (existsSync(candidatePath)) {
        results.push(candidatePath);
      }
    }
  }

  return results;
}

function pushBrowserCandidate(
  candidates: BrowserExecutable[],
  seenPaths: Set<string>,
  name: BrowserName,
  candidatePath: string,
): void {
  const normalized = candidatePath.toLowerCase();

  if (seenPaths.has(normalized)) {
    return;
  }

  seenPaths.add(normalized);
  candidates.push({
    name,
    path: candidatePath,
  });
}

function buildLaunchArgs(browserName: BrowserName): string[] {
  if (browserName === "firefox") {
    return [];
  }

  return [
    "--autoplay-policy=no-user-gesture-required",
    "--use-fake-ui-for-media-stream",
    "--allow-file-access-from-files",
  ];
}

async function runPublisherInNode(
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const runnerPath = fileURLToPath(new URL("./live-audio-publisher-runner.mjs", import.meta.url));

  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("node", [runnerPath], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      rejectPromise(
        new Error(`Failed to launch the Node publish helper: ${error.message}`),
      );
    });
    child.on("close", (code) => {
      const trimmedStdout = stdout.trim();
      const trimmedStderr = stderr.trim();

      if (code !== 0) {
        rejectPromise(
          new Error(
            trimmedStderr ||
              trimmedStdout ||
              `The Node publish helper exited with code ${code}.`,
          ),
        );
        return;
      }

      if (!trimmedStdout) {
        rejectPromise(new Error("The Node publish helper returned no output."));
        return;
      }

      try {
        resolvePromise(JSON.parse(trimmedStdout) as Record<string, unknown>);
      } catch (error) {
        rejectPromise(
          new Error(
            `Failed to parse the Node publish helper output: ${
              error instanceof Error ? error.message : String(error)
            }\n${trimmedStdout}`,
          ),
        );
      }
    });

    child.stdin.end(JSON.stringify(input));
  });
}

function createSignalPromise(signal: NodeJS.Signals): {
  promise: Promise<string>;
  dispose: () => void;
} {
  let resolvePromise: (value: string) => void = () => undefined;
  const promise = new Promise<string>((resolve) => {
    resolvePromise = resolve;
  });
  const handler = () => resolvePromise(signal);

  process.once(signal, handler);

  return {
    promise,
    dispose: () => {
      process.off(signal, handler);
    },
  };
}

function decodeTencentCompactToken(
  value: string | undefined,
): Record<string, unknown> | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const normalized = normalizeTencentCompactBase64(value);
    const decoded = inflateSync(Buffer.from(normalized, "base64")).toString("utf8");
    const parsed = JSON.parse(decoded);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function normalizeTencentCompactBase64(value: string): string {
  const normalized = value.replace(/\*/g, "+").replace(/-/g, "/").replace(/_/g, "=");
  const remainder = normalized.length % 4;

  return remainder === 0 ? normalized : normalized + "=".repeat(4 - remainder);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function toFiniteNumber(value: unknown): number | undefined {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
