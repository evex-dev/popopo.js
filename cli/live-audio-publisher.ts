import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { inflateSync } from "node:zlib";
import puppeteer from "puppeteer-core";
import {
  DEFAULT_TENCENT_SDK_APP_ID,
  PopopoApiError,
  type PopopoClient,
} from "../index.ts";

export type LiveAudioPublishOptions = {
  spaceKey?: string;
  browserPath?: string;
  headless?: boolean;
  audioFilePath?: string;
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
    }
  | {
      kind: "tone";
      toneHz: number;
      gain: number;
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

  await ensureSpaceConnected(client, spaceKey);
  const rawConnectionInfo = await client.spaces.connectionInfo<Record<string, unknown>>(
    spaceKey,
    {},
  );
  const userSig = optionalString(rawConnectionInfo.userSig);
  const privateMapKey = optionalString(rawConnectionInfo.privateMapKey);
  const decodedUserSig = decodeTencentCompactToken(userSig);
  const sdkAppId = toFiniteNumber(decodedUserSig?.["TLS.sdkappid"]) ?? DEFAULT_TENCENT_SDK_APP_ID;
  const userId =
    optionalString(decodedUserSig?.["TLS.identifier"]) ??
    session.userId;

  if (!userSig || !privateMapKey || !userId) {
    throw new Error("Space connection info does not contain usable TRTC credentials.");
  }

  const browserPath = options.browserPath ?? detectBrowserPath();
  const headless = options.headless ?? true;
  const source = await resolvePublisherSource(options);
  const publishTimeoutMs = options.publishTimeoutMs ?? 15000;
  const durationMs = options.durationMs;
  const trtcVendorRoot = resolve(
    import.meta.dir,
    "../node_modules/trtc-sdk-v5",
  );
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);

      if (url.pathname === "/" || url.pathname === "/index.html") {
        return new Response(
          [
            "<!doctype html>",
            "<html>",
            "<head>",
            "<meta charset=\"utf-8\">",
            "<title>uset trtc publisher</title>",
            "</head>",
            "<body>",
            "<div id=\"app\"></div>",
            "<script src=\"/vendor/trtc.js\"></script>",
            "</body>",
            "</html>",
          ].join(""),
          {
            headers: {
              "content-type": "text/html; charset=utf-8",
            },
          },
        );
      }

      if (url.pathname.startsWith("/vendor/")) {
        const relativePath = url.pathname.slice("/vendor/".length);
        const filePath = resolve(trtcVendorRoot, relativePath);

        if (!filePath.toLowerCase().startsWith(trtcVendorRoot.toLowerCase())) {
          return new Response("forbidden", { status: 403 });
        }

        const file = Bun.file(filePath);
        return new Response(file);
      }

      return new Response("not found", { status: 404 });
    },
  });
  const pageUrl = `http://127.0.0.1:${server.port}/`;

  const browser = await puppeteer.launch({
    executablePath: browserPath,
    headless: headless ? true : false,
    args: [
      "--autoplay-policy=no-user-gesture-required",
      "--use-fake-ui-for-media-stream",
      "--allow-file-access-from-files",
    ],
  });
  const page = await browser.newPage();
  const logs: string[] = [];

  page.on("console", (message) => {
    logs.push(message.text());
  });
  page.on("pageerror", (error) => {
    logs.push(`pageerror:${error instanceof Error ? error.message : String(error)}`);
  });

  const cleanup = async () => {
    try {
      await page.evaluate(async () => {
        const state = (globalThis as Record<string, unknown>).__usetPublisher as
          | {
              stop?: () => Promise<Record<string, unknown>>;
            }
          | undefined;

        if (state?.stop) {
          await state.stop();
        }
      });
    } catch {
      // The page may already be gone.
    }

    await page.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  };

  const sigintResult = createSignalPromise("SIGINT");
  const sigtermResult = createSignalPromise("SIGTERM");

  try {
    await page.goto(pageUrl, { waitUntil: "networkidle0" });

    const started = await page.evaluate(
      async ({
        sdkAppId,
        userId,
        userSig,
        privateMapKey,
        spaceKey,
        source,
        publishTimeoutMs,
      }) => {
        const globalScope = globalThis as Record<string, unknown>;
        const TRTC = globalScope.TRTC as {
          create: () => {
            enterRoom: (config: Record<string, unknown>) => Promise<void>;
            exitRoom: () => Promise<void>;
            destroy: () => void;
            switchRole: (
              role: string,
              option?: Record<string, unknown>,
            ) => Promise<void>;
            startLocalAudio: (config?: Record<string, unknown>) => Promise<void>;
            stopLocalAudio: () => Promise<void>;
            on: (event: string, listener: (...args: unknown[]) => void) => void;
            TYPE: Record<string, string>;
          };
          EVENT: Record<string, string>;
          TYPE: Record<string, string>;
          setLogLevel?: (level: string) => void;
        };

        if (!TRTC?.create) {
          throw new Error("TRTC Web SDK failed to load.");
        }

        TRTC.setLogLevel?.("DEBUG");
        const trtc = TRTC.create();
        const eventError = TRTC.EVENT.ERROR!;
        const eventConnectionStateChanged = TRTC.EVENT.CONNECTION_STATE_CHANGED!;
        const eventPublishStateChanged = TRTC.EVENT.PUBLISH_STATE_CHANGED!;
        const sceneLive = TRTC.TYPE.SCENE_LIVE!;
        const roleAudience = TRTC.TYPE.ROLE_AUDIENCE!;
        const roleAnchor = TRTC.TYPE.ROLE_ANCHOR!;
        const eventLog: Array<Record<string, unknown>> = [];
        const asRecord = (value: unknown): Record<string, unknown> => {
          if (!value || typeof value !== "object" || Array.isArray(value)) {
            return {
              value: String(value ?? ""),
            };
          }

          return { ...(value as Record<string, unknown>) };
        };

        const pushEvent = (type: string, payload: Record<string, unknown>) => {
          const entry = {
            type,
            at: Date.now(),
            ...payload,
          };
          eventLog.push(entry);
          console.log(`uset-trtc:${JSON.stringify(entry)}`);
        };

        trtc.on(eventError, (...args: unknown[]) => {
          pushEvent("error", asRecord(args[0]));
        });
        trtc.on(
          eventConnectionStateChanged,
          (...args: unknown[]) => {
            pushEvent("connection-state", asRecord(args[0]));
          },
        );
        trtc.on(
          eventPublishStateChanged,
          (...args: unknown[]) => {
            pushEvent("publish-state", asRecord(args[0]));
          },
        );

        const audioContext = new AudioContext();
        await audioContext.resume();
        const gainNode = audioContext.createGain();
        gainNode.gain.value = source.gain;
        const destination = audioContext.createMediaStreamDestination();
        gainNode.connect(destination);

        let stopSource = async () => undefined;

        if (source.kind === "file") {
          const bytes = Uint8Array.from(atob(source.audioBase64), (character) =>
            character.charCodeAt(0)
          );
          const audioBuffer = await audioContext.decodeAudioData(bytes.buffer.slice(0));
          const bufferSource = audioContext.createBufferSource();
          bufferSource.buffer = audioBuffer;
          bufferSource.connect(gainNode);
          bufferSource.start();
          stopSource = async () => {
            try {
              bufferSource.stop();
            } catch {
              // noop
            }
            bufferSource.disconnect();
          };
        } else {
          const oscillator = audioContext.createOscillator();
          oscillator.type = "sine";
          oscillator.frequency.value = source.toneHz;
          oscillator.connect(gainNode);
          oscillator.start();
          stopSource = async () => {
            try {
              oscillator.stop();
            } catch {
              // noop
            }
            oscillator.disconnect();
          };
        }

        const customAudioTrack = destination.stream.getAudioTracks()[0];

        if (!customAudioTrack) {
          throw new Error("Failed to create a custom audio track.");
        }

        const publishStartedFromEvent = new Promise<Record<string, unknown>>((resolve, reject) => {
          const timeout = globalThis.setTimeout(() => {
            reject(new Error("Timed out while waiting for audio publish to start."));
          }, publishTimeoutMs);

          trtc.on(eventPublishStateChanged, (...args: unknown[]) => {
              const state = asRecord(args[0]);
              if (state.mediaType === "audio" && state.state === "started") {
                globalThis.clearTimeout(timeout);
                resolve(state);
              }
            });
        });

        await trtc.enterRoom({
          sdkAppId,
          userId,
          userSig,
          strRoomId: spaceKey,
          scene: sceneLive,
          role: roleAudience,
          privateMapKey,
          autoReceiveAudio: false,
          autoReceiveVideo: false,
          enableAutoPlayDialog: false,
        });
        await trtc.switchRole(roleAnchor, { privateMapKey });
        await trtc.startLocalAudio({
          option: {
            audioTrack: customAudioTrack,
          },
        });
        const publishState = await Promise.race([
          publishStartedFromEvent,
          new Promise<Record<string, unknown>>((resolve) => {
            globalThis.setTimeout(() => {
              resolve({
                mediaType: "audio",
                state: "started",
                reason: "fallback-after-startLocalAudio",
              });
            }, 1500);
          }),
        ]);

        globalScope.__usetPublisher = {
          stop: async () => {
            await stopSource().catch(() => undefined);

            try {
              customAudioTrack.stop();
            } catch {
              // noop
            }

            try {
              await trtc.stopLocalAudio();
            } catch {
              // noop
            }

            try {
              await trtc.exitRoom();
            } catch {
              // noop
            }

            try {
              trtc.destroy();
            } catch {
              // noop
            }

            try {
              await audioContext.close();
            } catch {
              // noop
            }

            return {
              stopped: true,
              events: eventLog,
            };
          },
        };

        return {
          started: true,
          sdkAppId,
          userId,
          strRoomId: spaceKey,
          publishState,
        };
      },
      {
        sdkAppId,
        userId,
        userSig,
        privateMapKey,
        spaceKey,
        source,
        publishTimeoutMs,
      },
    );

    if (durationMs !== undefined && durationMs > 0) {
      await Promise.race([
        sleep(durationMs),
        sigintResult.promise,
        sigtermResult.promise,
      ]);
    } else {
      await Promise.race([sigintResult.promise, sigtermResult.promise]);
    }

    const stopResult = await page.evaluate(async () => {
      const state = (globalThis as Record<string, unknown>).__usetPublisher as
        | {
            stop?: () => Promise<Record<string, unknown>>;
          }
        | undefined;

      if (!state?.stop) {
        return { stopped: false };
      }

      return state.stop();
    });

    return {
      ok: true,
      spaceKey,
      source: source.kind,
      durationMs: durationMs ?? null,
      sdkAppId,
      userId,
      started,
      stopResult,
      logs,
    };
  } finally {
    sigintResult.dispose();
    sigtermResult.dispose();
    await cleanup();
    server.stop(true);
  }
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
    };
  }

  return {
    kind: "tone",
    toneHz: options.toneHz ?? 440,
    gain,
  };
}

function detectBrowserPath(): string {
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error("No supported browser executable was found. Pass --browser-path.");
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
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function normalizeTencentCompactBase64(value: string): string {
  const normalized = value
    .replace(/\*/g, "+")
    .replace(/-/g, "/")
    .replace(/_/g, "=");
  const remainder = normalized.length % 4;

  return remainder === 0
    ? normalized
    : normalized + "=".repeat(4 - remainder);
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

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
}
