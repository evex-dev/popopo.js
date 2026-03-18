import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { once } from "node:events";

const input = await readJsonFromStdin();
const {
  browser,
  browserPath,
  headless,
  source,
  publishTimeoutMs,
  durationMs,
  sdkAppId,
  userId,
  userSig,
  privateMapKey,
  spaceKey,
  trtcVendorRoot,
} = input;

try {
  const playwright = await import("playwright-core");
  const browserType = playwright[browser];
  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");

    if (requestUrl.pathname === "/" || requestUrl.pathname === "/index.html") {
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
      });
      response.end(
        [
          "<!doctype html>",
          "<html>",
          "<head>",
          '<meta charset="utf-8">',
          "<title>uset trtc publisher</title>",
          "</head>",
          "<body>",
          '<div id="app"></div>',
          '<script src="/vendor/trtc.js"></script>',
          "</body>",
          "</html>",
        ].join(""),
      );
      return;
    }

    if (requestUrl.pathname.startsWith("/vendor/")) {
      const relativePath = requestUrl.pathname.slice("/vendor/".length);
      const filePath = resolve(trtcVendorRoot, relativePath);

      if (!filePath.toLowerCase().startsWith(String(trtcVendorRoot).toLowerCase())) {
        response.writeHead(403);
        response.end("forbidden");
        return;
      }

      try {
        const file = await readFile(filePath);
        response.writeHead(200);
        response.end(file);
      } catch {
        response.writeHead(404);
        response.end("not found");
      }

      return;
    }

    response.writeHead(404);
    response.end("not found");
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Failed to start the local Playwright helper server.");
  }

  const pageUrl = `http://127.0.0.1:${address.port}/`;
  const launchedBrowser = await browserType.launch({
    executablePath: browserPath,
    headless: !!headless,
    args: buildLaunchArgs(browser),
  });
  const context = await launchedBrowser.newContext();
  const page = await context.newPage();
  const logs = [];

  page.on("console", (message) => {
    logs.push(message.text());
  });
  page.on("pageerror", (error) => {
    logs.push(`pageerror:${error instanceof Error ? error.message : String(error)}`);
  });

  const cleanup = async () => {
    try {
      await page.evaluate(async () => {
        const state = globalThis.__usetPublisher;
        if (state?.stop) {
          await state.stop();
        }
      });
    } catch {
      // ignore
    }

    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
    await launchedBrowser.close().catch(() => undefined);
    await new Promise((resolvePromise) => server.close(resolvePromise));
  };

  const sigintResult = createSignalPromise("SIGINT");
  const sigtermResult = createSignalPromise("SIGTERM");

  try {
    await page.goto(pageUrl, { waitUntil: "networkidle" });

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
        const globalScope = globalThis;
        const TRTC = globalScope.TRTC;

        if (!TRTC?.create) {
          throw new Error("TRTC Web SDK failed to load.");
        }

        TRTC.setLogLevel?.("DEBUG");
        const trtc = TRTC.create();
        const eventError = TRTC.EVENT.ERROR;
        const eventConnectionStateChanged = TRTC.EVENT.CONNECTION_STATE_CHANGED;
        const eventPublishStateChanged = TRTC.EVENT.PUBLISH_STATE_CHANGED;
        const sceneLive = TRTC.TYPE.SCENE_LIVE;
        const roleAudience = TRTC.TYPE.ROLE_AUDIENCE;
        const roleAnchor = TRTC.TYPE.ROLE_ANCHOR;
        const eventLog = [];
        const asRecord = (value) => {
          if (!value || typeof value !== "object" || Array.isArray(value)) {
            return { value: String(value ?? "") };
          }

          return { ...value };
        };
        const pushEvent = (type, payload) => {
          const entry = {
            type,
            at: Date.now(),
            ...payload,
          };
          eventLog.push(entry);
          console.log(`uset-trtc:${JSON.stringify(entry)}`);
        };

        trtc.on(eventError, (...args) => {
          pushEvent("error", asRecord(args[0]));
        });
        trtc.on(eventConnectionStateChanged, (...args) => {
          pushEvent("connection-state", asRecord(args[0]));
        });
        trtc.on(eventPublishStateChanged, (...args) => {
          pushEvent("publish-state", asRecord(args[0]));
        });

        const audioContext = new AudioContext();
        await audioContext.resume();
        const gainNode = audioContext.createGain();
        gainNode.gain.value = source.gain;
        const destination = audioContext.createMediaStreamDestination();
        gainNode.connect(destination);

        let stopSource = async () => undefined;

        if (source.kind === "file") {
          const bytes = Uint8Array.from(atob(source.audioBase64), (character) =>
            character.charCodeAt(0),
          );
          const audioBuffer = await audioContext.decodeAudioData(bytes.buffer.slice(0));
          const bufferSource = audioContext.createBufferSource();
          bufferSource.buffer = audioBuffer;
          bufferSource.loop = !!source.loop;
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

        const publishStartedFromEvent = new Promise((resolvePromise, rejectPromise) => {
          const timeout = globalThis.setTimeout(() => {
            rejectPromise(new Error("Timed out while waiting for audio publish to start."));
          }, publishTimeoutMs);

          trtc.on(eventPublishStateChanged, (...args) => {
            const state = asRecord(args[0]);
            if (state.mediaType === "audio" && state.state === "started") {
              globalThis.clearTimeout(timeout);
              resolvePromise(state);
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
          new Promise((resolvePromise) => {
            globalThis.setTimeout(() => {
              resolvePromise({
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

    if (durationMs !== null && durationMs > 0) {
      await Promise.race([sleep(durationMs), sigintResult.promise, sigtermResult.promise]);
    } else {
      await Promise.race([sigintResult.promise, sigtermResult.promise]);
    }

    const stopResult = await page.evaluate(async () => {
      const state = globalThis.__usetPublisher;

      if (!state?.stop) {
        return { stopped: false };
      }

      return state.stop();
    });

    process.stdout.write(
      JSON.stringify({
        ok: true,
        spaceKey,
        browser,
        browserPath,
        source: source.kind,
        durationMs,
        sdkAppId,
        userId,
        started,
        stopResult,
        logs,
      }),
    );
  } finally {
    sigintResult.dispose();
    sigtermResult.dispose();
    await cleanup();
  }
} catch (error) {
  process.stderr.write(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
}

async function readJsonFromStdin() {
  const chunks = [];

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function buildLaunchArgs(browserName) {
  if (browserName === "firefox") {
    return [];
  }

  return [
    "--autoplay-policy=no-user-gesture-required",
    "--use-fake-ui-for-media-stream",
    "--allow-file-access-from-files",
  ];
}

function createSignalPromise(signal) {
  let resolvePromise = () => undefined;
  const promise = new Promise((resolve) => {
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

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}
