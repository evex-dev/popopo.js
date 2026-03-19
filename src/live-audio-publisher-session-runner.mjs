import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { once } from 'node:events'
import { createInterface } from 'node:readline'

const rl = createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
})

let session = null
let shouldExit = false

try {
  for await (const line of rl) {
    if (shouldExit) {
      break
    }

    const trimmed = line.trim()

    if (!trimmed) {
      continue
    }

    const command = JSON.parse(trimmed)

    try {
      switch (command.type) {
        case 'init':
          if (session) {
            throw new Error('The live audio publisher session is already initialized.')
          }

          session = await createPublisherSession(command)
          writeMessage({
            type: 'ready',
            data: {
              ok: true,
              browser: command.browser,
              browserPath: command.browserPath,
              spaceKey: command.spaceKey,
              sdkAppId: command.sdkAppId,
              userId: command.userId,
            },
          })
          break
        case 'pcm-begin':
          ensureSession(session)
          writeResponse(command.requestId, await session.beginPcmStream(command))
          break
        case 'pcm-chunk':
          ensureSession(session)
          await session.pushPcmChunk(command)
          break
        case 'pcm-end':
          ensureSession(session)
          writeResponse(command.requestId, await session.endPcmStream())
          break
        case 'close': {
          if (!session) {
            writeResponse(command.requestId, { ok: true, alreadyClosed: true })
            break
          }

          const result = await session.close()
          session = null
          writeResponse(command.requestId, result)
          process.exitCode = 0
          shouldExit = true
          break
        }
        default:
          throw new Error(`Unknown live audio publisher command: ${command.type}`)
      }
    } catch (error) {
      if (command.requestId) {
        writeError(command.requestId, error)
      } else {
        throw error
      }
    }
  }
} catch (error) {
  process.stderr.write(error instanceof Error ? (error.stack ?? error.message) : String(error))
  process.exitCode = 1
} finally {
  if (session) {
    await session.close().catch(() => undefined)
  }
}

async function createPublisherSession(input) {
  const playwright = await import('playwright-core')
  const browserType = playwright[input.browser]
  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1')

    if (requestUrl.pathname === '/' || requestUrl.pathname === '/index.html') {
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
      })
      response.end(
        [
          '<!doctype html>',
          '<html>',
          '<head>',
          '<meta charset="utf-8">',
          '<title>uset trtc publisher</title>',
          '</head>',
          '<body>',
          '<div id="app"></div>',
          '<script src="/vendor/trtc.js"></script>',
          '</body>',
          '</html>',
        ].join(''),
      )
      return
    }

    if (requestUrl.pathname.startsWith('/vendor/')) {
      const relativePath = requestUrl.pathname.slice('/vendor/'.length)
      const filePath = resolve(input.trtcVendorRoot, relativePath)

      if (!filePath.toLowerCase().startsWith(String(input.trtcVendorRoot).toLowerCase())) {
        response.writeHead(403)
        response.end('forbidden')
        return
      }

      try {
        const file = await readFile(filePath)
        response.writeHead(200)
        response.end(file)
      } catch {
        response.writeHead(404)
        response.end('not found')
      }

      return
    }

    response.writeHead(404)
    response.end('not found')
  })

  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()

  if (!address || typeof address === 'string') {
    throw new Error('Failed to start the local Playwright helper server.')
  }

  const launchedBrowser = await browserType.launch({
    executablePath: input.browserPath,
    headless: !!input.headless,
    args: buildLaunchArgs(input.browser),
  })
  const context = await launchedBrowser.newContext()
  const page = await context.newPage()
  const logs = []

  page.on('console', (message) => {
    const text = message.text()
    logs.push(text)
    forwardTrtcEvent(text)
  })
  page.on('pageerror', (error) => {
    logs.push(`pageerror:${error instanceof Error ? error.message : String(error)}`)
  })

  await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: 'networkidle' })
  await page.evaluate(
    async ({ sdkAppId, userId, userSig, privateMapKey, spaceKey, gain, publishTimeoutMs }) => {
      const TRTC = globalThis.TRTC

      if (!TRTC?.create) {
        throw new Error('TRTC Web SDK failed to load.')
      }

      TRTC.setLogLevel?.('DEBUG')
      const trtc = TRTC.create()
      const eventError = TRTC.EVENT.ERROR
      const eventConnectionStateChanged = TRTC.EVENT.CONNECTION_STATE_CHANGED
      const eventPublishStateChanged = TRTC.EVENT.PUBLISH_STATE_CHANGED
      const sceneLive = TRTC.TYPE.SCENE_LIVE
      const roleAudience = TRTC.TYPE.ROLE_AUDIENCE
      const roleAnchor = TRTC.TYPE.ROLE_ANCHOR
      const eventLog = []
      const activeSources = new Set()
      const audioContext = new AudioContext()
      await audioContext.resume()
      const gainNode = audioContext.createGain()
      gainNode.gain.value = gain
      const destination = audioContext.createMediaStreamDestination()
      gainNode.connect(destination)
      const keepAliveGain = audioContext.createGain()
      keepAliveGain.gain.value = 0.000001
      const keepAliveSource = audioContext.createConstantSource()
      keepAliveSource.offset.value = 1
      keepAliveSource.connect(keepAliveGain)
      keepAliveGain.connect(destination)
      keepAliveSource.start()

      const pushEvent = (type, payload) => {
        const entry = {
          type,
          at: Date.now(),
          ...payload,
        }
        eventLog.push(entry)
        console.log(`uset-trtc:${JSON.stringify(entry)}`)
      }
      const asRecord = (value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          return { value: String(value ?? '') }
        }

        return { ...value }
      }

      trtc.on(eventError, (...args) => {
        pushEvent('error', asRecord(args[0]))
      })
      trtc.on(eventConnectionStateChanged, (...args) => {
        pushEvent('connection-state', asRecord(args[0]))
      })
      trtc.on(eventPublishStateChanged, (...args) => {
        pushEvent('publish-state', asRecord(args[0]))
      })

      audioContext.onstatechange = () => {
        pushEvent('audio-context-state', { state: audioContext.state })
      }

      const customAudioTrack = destination.stream.getAudioTracks()[0]

      if (!customAudioTrack) {
        throw new Error('Failed to create a custom audio track.')
      }

      customAudioTrack.addEventListener('ended', () => {
        pushEvent('track-state', { kind: 'audio', state: 'ended' })
      })

      const keepAudioContextAlive = globalThis.setInterval(() => {
        if (audioContext.state !== 'running') {
          void audioContext.resume().catch(() => undefined)
        }
      }, 5000)

      const publishStartedFromEvent = new Promise((resolvePromise, rejectPromise) => {
        const timeout = globalThis.setTimeout(() => {
          rejectPromise(new Error('Timed out while waiting for audio publish to start.'))
        }, publishTimeoutMs)

        trtc.on(eventPublishStateChanged, (...args) => {
          const state = asRecord(args[0])
          if (state.mediaType === 'audio' && state.state === 'started') {
            globalThis.clearTimeout(timeout)
            resolvePromise(state)
          }
        })
      })

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
      })
      await trtc.switchRole(roleAnchor, { privateMapKey })
      await trtc.startLocalAudio({
        option: {
          audioTrack: customAudioTrack,
        },
      })
      await Promise.race([
        publishStartedFromEvent,
        new Promise((resolvePromise) => {
          globalThis.setTimeout(() => {
            resolvePromise({
              mediaType: 'audio',
              state: 'started',
              reason: 'fallback-after-startLocalAudio',
            })
          }, 1500)
        }),
      ])

      globalThis.__usetPublisherSession = {
        pcmConfig: null,
        queueTime: audioContext.currentTime,
        beginPcmStream({ format, sampleRate, channelCount }) {
          if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
            throw new Error('PCM sampleRate must be a positive number.')
          }
          if (!Number.isFinite(channelCount) || channelCount <= 0) {
            throw new Error('PCM channelCount must be a positive number.')
          }
          if (format !== 's16le' && format !== 'f32le') {
            throw new Error(`Unsupported PCM format: ${format}`)
          }

          this.pcmConfig = {
            format,
            sampleRate,
            channelCount,
          }
          this.queueTime = Math.max(this.queueTime, audioContext.currentTime + 0.05)

          return {
            ok: true,
            sampleRate,
            channelCount,
            format,
          }
        },
        pushPcmChunk({ payloadBase64 }) {
          if (!this.pcmConfig) {
            throw new Error('No PCM stream is active. Call beginPcmStream first.')
          }

          const bytes = Uint8Array.from(atob(payloadBase64), (character) => character.charCodeAt(0))
          const bytesPerSample = this.pcmConfig.format === 'f32le' ? 4 : 2
          const bytesPerFrame = bytesPerSample * this.pcmConfig.channelCount

          if (bytes.byteLength % bytesPerFrame !== 0) {
            throw new Error(
              `PCM chunk size ${bytes.byteLength} is not aligned to ${bytesPerFrame} bytes/frame.`,
            )
          }

          const frameCount = bytes.byteLength / bytesPerFrame
          const audioBuffer = audioContext.createBuffer(
            this.pcmConfig.channelCount,
            frameCount,
            this.pcmConfig.sampleRate,
          )
          const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

          for (let channelIndex = 0; channelIndex < this.pcmConfig.channelCount; channelIndex += 1) {
            const channelData = audioBuffer.getChannelData(channelIndex)

            for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
              const byteOffset = frameIndex * bytesPerFrame + channelIndex * bytesPerSample
              channelData[frameIndex] =
                this.pcmConfig.format === 'f32le'
                  ? view.getFloat32(byteOffset, true)
                  : view.getInt16(byteOffset, true) / 32768
            }
          }

          const sourceNode = audioContext.createBufferSource()
          sourceNode.buffer = audioBuffer
          sourceNode.connect(gainNode)
          const startAt = Math.max(audioContext.currentTime + 0.02, this.queueTime)
          this.queueTime = startAt + audioBuffer.duration
          sourceNode.onended = () => {
            activeSources.delete(sourceNode)
          }
          activeSources.add(sourceNode)
          sourceNode.start(startAt)

          return {
            ok: true,
            queuedDurationMs: Math.max(0, (this.queueTime - audioContext.currentTime) * 1000),
          }
        },
        endPcmStream() {
          const queuedDurationMs = Math.max(0, (this.queueTime - audioContext.currentTime) * 1000)
          this.pcmConfig = null

          return {
            ok: true,
            queuedDurationMs,
          }
        },
        async stop() {
          globalThis.clearInterval(keepAudioContextAlive)

          for (const sourceNode of activeSources) {
            try {
              sourceNode.stop()
            } catch {
              // noop
            }
          }
          activeSources.clear()

          try {
            customAudioTrack.stop()
          } catch {
            // noop
          }

          try {
            keepAliveSource.stop()
          } catch {
            // noop
          }

          try {
            await trtc.stopLocalAudio()
          } catch {
            // noop
          }

          try {
            await trtc.exitRoom()
          } catch {
            // noop
          }

          try {
            trtc.destroy()
          } catch {
            // noop
          }

          try {
            await audioContext.close()
          } catch {
            // noop
          }

          return {
            ok: true,
            events: eventLog,
          }
        },
      }
    },
    {
      sdkAppId: input.sdkAppId,
      userId: input.userId,
      userSig: input.userSig,
      privateMapKey: input.privateMapKey,
      spaceKey: input.spaceKey,
      gain: input.gain,
      publishTimeoutMs: input.publishTimeoutMs,
    },
  )

  return {
    async beginPcmStream(command) {
      return page.evaluate((payload) => {
        return globalThis.__usetPublisherSession.beginPcmStream(payload)
      }, command)
    },
    async pushPcmChunk(command) {
      await page.evaluate((payload) => {
        return globalThis.__usetPublisherSession.pushPcmChunk(payload)
      }, command)
    },
    async endPcmStream() {
      return page.evaluate(() => {
        return globalThis.__usetPublisherSession.endPcmStream()
      })
    },
    async close() {
      let stopResult = { ok: true, stopped: false }

      try {
        stopResult = await page.evaluate(async () => {
          return globalThis.__usetPublisherSession.stop()
        })
      } catch {
        // ignore
      }

      await page.close().catch(() => undefined)
      await context.close().catch(() => undefined)
      await launchedBrowser.close().catch(() => undefined)
      await new Promise((resolvePromise) => server.close(resolvePromise))

      return {
        ok: true,
        stopResult,
        logs,
      }
    },
  }
}

function buildLaunchArgs(browserName) {
  if (browserName === 'firefox') {
    return []
  }

  return [
    '--autoplay-policy=no-user-gesture-required',
    '--use-fake-ui-for-media-stream',
    '--allow-file-access-from-files',
  ]
}

function ensureSession(session) {
  if (!session) {
    throw new Error('The live audio publisher session is not initialized.')
  }
}

function writeMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

function writeResponse(requestId, data) {
  writeMessage({
    type: 'response',
    requestId,
    ok: true,
    data,
  })
}

function writeError(requestId, error) {
  writeMessage({
    type: 'response',
    requestId,
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  })
}

function forwardTrtcEvent(text) {
  if (!text.startsWith('uset-trtc:')) {
    return
  }

  try {
    const payload = JSON.parse(text.slice('uset-trtc:'.length))
    writeMessage({
      type: 'event',
      event: 'trtc',
      data: payload,
    })
  } catch {
    // ignore malformed console payloads
  }
}
