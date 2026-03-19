import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { basename, delimiter, resolve } from 'node:path'
import { inflateSync } from 'node:zlib'
import { DEFAULT_TENCENT_SDK_APP_ID, type PopopoClient } from './client.ts'
import { PopopoApiError } from './errors.ts'

export type LiveAudioPublishOptions = {
  spaceKey?: string
  browser?: 'auto' | 'chromium' | 'firefox'
  browserPath?: string
  headless?: boolean
  audioFilePath?: string
  loop?: boolean
  toneHz?: number
  gain?: number
  durationMs?: number
  publishTimeoutMs?: number
}

export type LiveAudioPublisherOptions = {
  spaceKey?: string
  browser?: 'auto' | 'chromium' | 'firefox'
  browserPath?: string
  headless?: boolean
  gain?: number
  publishTimeoutMs?: number
}

export type LiveAudioPcmStreamOptions = {
  sampleRate: number
  channelCount?: number
  format?: 's16le' | 'f32le'
}

export type LiveAudioPublisherHealth = {
  healthy: boolean
  connectionState?: string
  publishState?: string
  lastProblem?: string
}

export type LiveAudioPublisherSession = {
  readonly spaceKey: string
  readonly browser: BrowserName
  readonly browserPath: string
  readonly sdkAppId: number
  readonly userId: string
  readonly credentialIssuedAt?: number
  readonly credentialExpiresAt?: number
  publishPcmStream: (
    stream: ReadableStream<Uint8Array>,
    options: LiveAudioPcmStreamOptions,
  ) => Promise<void>
  /**
   * @deprecated Use publishPcmStream(stream, options) instead.
   */
  publishStream: (
    stream: ReadableStream<Uint8Array>,
    options: LiveAudioPcmStreamOptions,
  ) => Promise<void>
  isHealthy: () => boolean
  getHealth: () => LiveAudioPublisherHealth
  close: () => Promise<Record<string, unknown>>
}

type PublisherSourceConfig =
  | {
      kind: 'file'
      audioBase64: string
      gain: number
      loop: boolean
    }
  | {
      kind: 'tone'
      toneHz: number
      gain: number
    }

type PlaywrightModule = typeof import('playwright-core')
type BrowserName = 'chromium' | 'firefox'

type BrowserExecutable = {
  name: BrowserName
  path: string
}

type PublisherSessionConfig = {
  spaceKey: string
  browser: BrowserName
  browserPath: string
  headless: boolean
  gain: number
  publishTimeoutMs: number
  sdkAppId: number
  userId: string
  userSig: string
  privateMapKey: string
  credentialIssuedAt?: number
  credentialExpiresAt?: number
  trtcVendorRoot: string
}

const SPACE_CONNECTION_HEARTBEAT_INTERVAL_MS = 5_000

type PublisherRunnerMessage =
  | {
      type: 'ready'
      data: Record<string, unknown>
    }
  | {
      type: 'response'
      requestId: string
      ok: true
      data?: Record<string, unknown>
    }
  | {
      type: 'response'
      requestId: string
      ok: false
      error: string
    }
  | {
      type: 'event'
      event: string
      data?: Record<string, unknown>
    }

export async function publishLiveAudio(
  client: PopopoClient,
  options: LiveAudioPublishOptions,
): Promise<Record<string, unknown>> {
  const config = await resolvePublisherSessionConfig(client, options)
  const source = await resolvePublisherSource(options)
  const durationMs = options.durationMs

  return runPublisherInNode({
    browser: config.browser,
    browserPath: config.browserPath,
    headless: config.headless,
    source,
    publishTimeoutMs: config.publishTimeoutMs,
    durationMs: durationMs ?? null,
    sdkAppId: config.sdkAppId,
    userId: config.userId,
    userSig: config.userSig,
    privateMapKey: config.privateMapKey,
    spaceKey: config.spaceKey,
    trtcVendorRoot: config.trtcVendorRoot,
  })
}

export async function createLiveAudioPublisher(
  client: PopopoClient,
  options: LiveAudioPublisherOptions = {},
): Promise<LiveAudioPublisherSession> {
  const config = await resolvePublisherSessionConfig(client, options)
  const runnerPath = fileURLToPath(
    new URL('./live-audio-publisher-session-runner.mjs', import.meta.url),
  )
  const child = spawn('node', [runnerPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  })
  let stdoutBuffer = ''
  let stderr = ''
  let requestCounter = 0
  let activePublish = false
  let closed = false
  let connectionState: string | undefined
  let publishState: string | undefined
  let unhealthyReason: string | undefined
  let stopSpaceConnectionHeartbeat: (() => void) | undefined
  let resolveReady: (value: Record<string, unknown>) => void = () => undefined
  let rejectReady: (reason?: unknown) => void = () => undefined
  const readyPromise = new Promise<Record<string, unknown>>((resolvePromise, rejectPromise) => {
    resolveReady = resolvePromise
    rejectReady = rejectPromise
  })
  const pending = new Map<
    string,
    {
      resolve: (value: Record<string, unknown>) => void
      reject: (reason?: unknown) => void
    }
  >()

  const failAll = (error: Error) => {
    stopSpaceConnectionHeartbeat?.()
    stopSpaceConnectionHeartbeat = undefined
    if (!closed) {
      closed = true
    }
    rejectReady(error)
    for (const entry of pending.values()) {
      entry.reject(error)
    }
    pending.clear()
    unhealthyReason = error.message
  }

  const handleMessage = (message: PublisherRunnerMessage) => {
    if (message.type === 'ready') {
      resolveReady(message.data)
      return
    }

    if (message.type === 'response') {
      const pendingRequest = pending.get(message.requestId)
      if (!pendingRequest) {
        return
      }

      pending.delete(message.requestId)

      if (message.ok) {
        pendingRequest.resolve(message.data ?? {})
      } else {
        pendingRequest.reject(new Error(message.error))
      }

      return
    }

    if (message.type === 'event' && message.event === 'trtc') {
      updateHealthFromTrtcEvent(message.data)
    }
  }

  const updateHealthFromTrtcEvent = (payload: Record<string, unknown> | undefined) => {
    const eventType = optionalString(payload?.type)

    if (!eventType) {
      return
    }

    if (eventType === 'connection-state') {
      connectionState =
        optionalString(payload?.state) ??
        optionalString(payload?.connectionState) ??
        optionalString(payload?.status)
    }

    if (eventType === 'publish-state') {
      publishState =
        optionalString(payload?.state) ??
        optionalString(payload?.publishState) ??
        optionalString(payload?.status)
    }

    if (eventType === 'error') {
      const code = optionalString(payload?.code) ?? optionalString(payload?.value)
      unhealthyReason = code ? `trtc-error:${code}` : 'trtc-error'
      return
    }

    if (eventType === 'audio-context-state') {
      const state = optionalString(payload?.state)
      unhealthyReason = deriveUnhealthyAudioContextReason(state)
      return
    }

    if (eventType === 'track-state') {
      const kind = optionalString(payload?.kind) ?? 'track'
      const state = optionalString(payload?.state)
      unhealthyReason = state ? `${kind}-state:${state}` : `${kind}-state`
      return
    }

    unhealthyReason =
      deriveUnhealthyConnectionReason(connectionState) ??
      deriveUnhealthyPublishReason(publishState)
  }

  child.stdout.on('data', (chunk: Buffer | string) => {
    stdoutBuffer += chunk.toString()

    while (true) {
      const newlineIndex = stdoutBuffer.indexOf('\n')
      if (newlineIndex === -1) {
        break
      }

      const line = stdoutBuffer.slice(0, newlineIndex).trim()
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1)

      if (!line) {
        continue
      }

      try {
        handleMessage(JSON.parse(line) as PublisherRunnerMessage)
      } catch (error) {
        failAll(
          new Error(
            `Failed to parse the live audio publisher response: ${
              error instanceof Error ? error.message : String(error)
            }`,
          ),
        )
      }
    }
  })
  child.stderr.on('data', (chunk: Buffer | string) => {
    stderr += chunk.toString()
  })
  child.on('error', (error) => {
    failAll(new Error(`Failed to launch the Node publish helper: ${error.message}`))
  })
  child.on('close', (code) => {
    if (closed && code === 0) {
      return
    }

    failAll(
      new Error(stderr.trim() || `The Node publish helper exited unexpectedly with code ${code}.`),
    )
  })

  const sendCommand = async (payload: Record<string, unknown>): Promise<void> => {
    if (closed) {
      throw new Error('The live audio publisher session is already closed.')
    }

    if (!child.stdin.write(`${JSON.stringify(payload)}\n`)) {
      await once(child.stdin, 'drain')
    }
  }

  const request = async (
    type: string,
    data: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> => {
    const requestId = `req-${++requestCounter}`
    const promise = new Promise<Record<string, unknown>>((resolvePromise, rejectPromise) => {
      pending.set(requestId, {
        resolve: resolvePromise,
        reject: rejectPromise,
      })
    })

    await sendCommand({
      type,
      requestId,
      ...data,
    })

    return promise
  }

  await sendCommand({
    type: 'init',
    ...config,
  })
  await readyPromise
  stopSpaceConnectionHeartbeat = startSpaceConnectionHeartbeat(client, config.spaceKey)

  const publishPcmStream = async (
    stream: ReadableStream<Uint8Array>,
    streamOptions: LiveAudioPcmStreamOptions,
  ): Promise<void> => {
    if (activePublish) {
      throw new Error('Concurrent publishPcmStream calls are not supported.')
    }

    activePublish = true

    try {
      await request('pcm-begin', {
        format: streamOptions.format ?? 's16le',
        sampleRate: streamOptions.sampleRate,
        channelCount: streamOptions.channelCount ?? 1,
      })

      const reader = stream.getReader()

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            break
          }

          if (!value || value.byteLength === 0) {
            continue
          }

          await sendCommand({
            type: 'pcm-chunk',
            payloadBase64: Buffer.from(value).toString('base64'),
          })
        }
      } finally {
        reader.releaseLock()
      }

      const endResult = await request('pcm-end')
      const queuedDurationMs = toFiniteNumber(endResult.queuedDurationMs)

      if (queuedDurationMs && queuedDurationMs > 0) {
        await sleep(queuedDurationMs)
      }
    } finally {
      activePublish = false
    }
  }

  const close = async (): Promise<Record<string, unknown>> => {
    if (closed) {
      return { ok: true, alreadyClosed: true }
    }

    try {
      const result = await request('close')
      closed = true
      stopSpaceConnectionHeartbeat?.()
      stopSpaceConnectionHeartbeat = undefined
      child.stdin.end()
      await once(child, 'close').catch(() => undefined)
      return result
    } finally {
      stopSpaceConnectionHeartbeat?.()
      stopSpaceConnectionHeartbeat = undefined
      if (child.exitCode === null && child.signalCode === null) {
        child.kill()
      }
    }
  }

  return {
    spaceKey: config.spaceKey,
    browser: config.browser,
    browserPath: config.browserPath,
    sdkAppId: config.sdkAppId,
    userId: config.userId,
    credentialIssuedAt: config.credentialIssuedAt,
    credentialExpiresAt: config.credentialExpiresAt,
    publishPcmStream,
    publishStream: publishPcmStream,
    isHealthy: () => !closed && !unhealthyReason,
    getHealth: () => ({
      healthy: !closed && !unhealthyReason,
      connectionState,
      publishState,
      lastProblem: unhealthyReason,
    }),
    close,
  }
}

async function ensureSpaceConnected(client: PopopoClient, spaceKey: string): Promise<void> {
  try {
    await client.spaces.connect(spaceKey, { muted: false })
  } catch (error) {
    if (
      error instanceof PopopoApiError &&
      error.status === 409 &&
      typeof error.body === 'object' &&
      error.body &&
      'message' in error.body &&
      String(error.body.message).includes('既にオンライン')
    ) {
      return
    }

    if (
      error instanceof PopopoApiError &&
      error.status === 403 &&
      typeof error.body === 'object' &&
      error.body &&
      'message' in error.body &&
      String(error.body.message).includes('スペースのユーザーではありません')
    ) {
      throw new Error(
        'You are not a member of this space. Join it first with `uset invites accept --code <invite-url-or-key>`.',
      )
    }

    throw error
  }
}

async function resolvePublisherSource(
  options: LiveAudioPublishOptions,
): Promise<PublisherSourceConfig> {
  const gain = options.gain ?? 0.15

  if (options.audioFilePath) {
    const filePath = resolve(options.audioFilePath)
    const audioBase64 = await readFile(filePath, 'base64')

    return {
      kind: 'file',
      audioBase64,
      gain,
      loop: options.loop ?? false,
    }
  }

  return {
    kind: 'tone',
    toneHz: options.toneHz ?? 440,
    gain,
  }
}

async function resolvePublisherSessionConfig(
  client: PopopoClient,
  options: LiveAudioPublisherOptions,
): Promise<PublisherSessionConfig> {
  const session = client.getSession()
  const spaceKey = options.spaceKey ?? session.currentSpaceKey

  if (!spaceKey) {
    throw new Error('No target space is available. Pass --space-key or join a space first.')
  }

  const trtcVendorRoot = resolve(import.meta.dir, '../node_modules/trtc-sdk-v5')
  const trtcScriptPath = resolve(trtcVendorRoot, 'trtc.js')

  if (!existsSync(trtcScriptPath)) {
    throw new Error(
      'Optional dependency `trtc-sdk-v5` is not installed. Run `bun install` in `client_lib`.',
    )
  }

  await ensureSpaceConnected(client, spaceKey)
  const rawConnectionInfo = await client.spaces.connectionInfo<Record<string, unknown>>(
    spaceKey,
    {},
  )
  const userSig = optionalString(rawConnectionInfo.userSig)
  const privateMapKey = optionalString(rawConnectionInfo.privateMapKey)
  const decodedUserSig = decodeTencentCompactToken(userSig)
  const decodedPrivateMapKey = decodeTencentCompactToken(privateMapKey)
  const sdkAppId = toFiniteNumber(decodedUserSig?.['TLS.sdkappid']) ?? DEFAULT_TENCENT_SDK_APP_ID
  const userId = optionalString(decodedUserSig?.['TLS.identifier']) ?? session.userId
  const credentialIssuedAtSeconds =
    toFiniteNumber(decodedUserSig?.['TLS.time']) ??
    toFiniteNumber(decodedPrivateMapKey?.['TLS.time'])
  const credentialExpiresInSeconds =
    toFiniteNumber(decodedUserSig?.['TLS.expire']) ??
    toFiniteNumber(decodedPrivateMapKey?.['TLS.expire'])
  const credentialIssuedAt =
    credentialIssuedAtSeconds !== undefined ? credentialIssuedAtSeconds * 1000 : undefined
  const credentialExpiresAt =
    credentialIssuedAtSeconds !== undefined && credentialExpiresInSeconds !== undefined
      ? (credentialIssuedAtSeconds + credentialExpiresInSeconds) * 1000
      : undefined

  if (!userSig || !privateMapKey || !userId) {
    throw new Error('Space connection info does not contain usable TRTC credentials.')
  }

  const browserExecutable = resolveBrowserExecutable(options)

  return {
    spaceKey,
    browser: browserExecutable.name,
    browserPath: browserExecutable.path,
    headless: options.headless ?? true,
    gain: options.gain ?? 1,
    publishTimeoutMs: options.publishTimeoutMs ?? 15000,
    sdkAppId,
    userId,
    userSig,
    privateMapKey,
    credentialIssuedAt,
    credentialExpiresAt,
    trtcVendorRoot,
  }
}

function resolveBrowserExecutable(options: LiveAudioPublishOptions): BrowserExecutable {
  const preferredBrowser = options.browser ?? 'auto'

  if (options.browserPath) {
    const inferredName = inferBrowserNameFromPath(options.browserPath)

    return {
      name: preferredBrowser === 'auto' ? inferredName : preferredBrowser,
      path: options.browserPath,
    }
  }

  for (const candidate of getBrowserCandidates(preferredBrowser)) {
    if (existsSync(candidate.path)) {
      return candidate
    }
  }

  const expectedBrowsers =
    preferredBrowser === 'auto' ? 'Chromium/Chrome/Edge/Firefox' : preferredBrowser
  throw new Error(`No supported ${expectedBrowsers} executable was found. Pass --browser-path.`)
}

function inferBrowserNameFromPath(browserPath: string): BrowserName {
  const filename = basename(browserPath).toLowerCase()

  if (filename.includes('firefox')) {
    return 'firefox'
  }

  return 'chromium'
}

function getBrowserCandidates(preferredBrowser: 'auto' | BrowserName): BrowserExecutable[] {
  const orderedNames =
    preferredBrowser === 'auto' ? (['chromium', 'firefox'] as const) : ([preferredBrowser] as const)
  const knownPathsByBrowser = getKnownBrowserPaths()
  const pathExecutableNamesByBrowser = getPathExecutableNames()
  const candidates: BrowserExecutable[] = []
  const seenPaths = new Set<string>()

  for (const browserName of orderedNames) {
    for (const candidatePath of knownPathsByBrowser[browserName]) {
      pushBrowserCandidate(candidates, seenPaths, browserName, candidatePath)
    }

    for (const candidatePath of resolveExecutablesFromPath(
      pathExecutableNamesByBrowser[browserName],
    )) {
      pushBrowserCandidate(candidates, seenPaths, browserName, candidatePath)
    }
  }

  return candidates
}

function getKnownBrowserPaths(): Record<BrowserName, string[]> {
  switch (process.platform) {
    case 'win32':
      return {
        chromium: [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
          'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
          'C:\\Program Files\\Chromium\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Chromium\\Application\\chrome.exe',
        ],
        firefox: [
          'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
          'C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe',
        ],
      }
    case 'darwin':
      return {
        chromium: [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
          '/Applications/Chromium.app/Contents/MacOS/Chromium',
        ],
        firefox: ['/Applications/Firefox.app/Contents/MacOS/firefox'],
      }
    default:
      return {
        chromium: [
          '/usr/bin/google-chrome',
          '/usr/bin/google-chrome-stable',
          '/usr/bin/chromium',
          '/usr/bin/chromium-browser',
          '/usr/bin/microsoft-edge',
          '/usr/bin/microsoft-edge-stable',
          '/snap/bin/chromium',
        ],
        firefox: ['/usr/bin/firefox', '/snap/bin/firefox'],
      }
  }
}

function getPathExecutableNames(): Record<BrowserName, string[]> {
  switch (process.platform) {
    case 'win32':
      return {
        chromium: ['chrome.exe', 'msedge.exe', 'chromium.exe'],
        firefox: ['firefox.exe'],
      }
    default:
      return {
        chromium: [
          'google-chrome',
          'google-chrome-stable',
          'chromium',
          'chromium-browser',
          'microsoft-edge',
          'microsoft-edge-stable',
        ],
        firefox: ['firefox'],
      }
  }
}

function resolveExecutablesFromPath(executableNames: string[]): string[] {
  const results: string[] = []
  const pathValue = process.env.PATH ?? ''

  for (const directory of pathValue.split(delimiter)) {
    if (!directory) {
      continue
    }

    for (const executableName of executableNames) {
      const candidatePath = resolve(directory, executableName)
      if (existsSync(candidatePath)) {
        results.push(candidatePath)
      }
    }
  }

  return results
}

function pushBrowserCandidate(
  candidates: BrowserExecutable[],
  seenPaths: Set<string>,
  name: BrowserName,
  candidatePath: string,
): void {
  const normalized = candidatePath.toLowerCase()

  if (seenPaths.has(normalized)) {
    return
  }

  seenPaths.add(normalized)
  candidates.push({
    name,
    path: candidatePath,
  })
}

function buildLaunchArgs(browserName: BrowserName): string[] {
  if (browserName === 'firefox') {
    return []
  }

  return [
    '--autoplay-policy=no-user-gesture-required',
    '--use-fake-ui-for-media-stream',
    '--allow-file-access-from-files',
  ]
}

async function runPublisherInNode(
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const runnerPath = fileURLToPath(new URL('./live-audio-publisher-runner.mjs', import.meta.url))

  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('node', [runnerPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      rejectPromise(new Error(`Failed to launch the Node publish helper: ${error.message}`))
    })
    child.on('close', (code) => {
      const trimmedStdout = stdout.trim()
      const trimmedStderr = stderr.trim()

      if (code !== 0) {
        rejectPromise(
          new Error(
            trimmedStderr || trimmedStdout || `The Node publish helper exited with code ${code}.`,
          ),
        )
        return
      }

      if (!trimmedStdout) {
        rejectPromise(new Error('The Node publish helper returned no output.'))
        return
      }

      try {
        resolvePromise(JSON.parse(trimmedStdout) as Record<string, unknown>)
      } catch (error) {
        rejectPromise(
          new Error(
            `Failed to parse the Node publish helper output: ${
              error instanceof Error ? error.message : String(error)
            }\n${trimmedStdout}`,
          ),
        )
      }
    })

    child.stdin.end(JSON.stringify(input))
  })
}

function createSignalPromise(signal: NodeJS.Signals): {
  promise: Promise<string>
  dispose: () => void
} {
  let resolvePromise: (value: string) => void = () => undefined
  const promise = new Promise<string>((resolve) => {
    resolvePromise = resolve
  })
  const handler = () => resolvePromise(signal)

  process.once(signal, handler)

  return {
    promise,
    dispose: () => {
      process.off(signal, handler)
    },
  }
}

function decodeTencentCompactToken(value: string | undefined): Record<string, unknown> | undefined {
  if (!value) {
    return undefined
  }

  try {
    const normalized = normalizeTencentCompactBase64(value)
    const decoded = inflateSync(Buffer.from(normalized, 'base64')).toString('utf8')
    const parsed = JSON.parse(decoded)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

function normalizeTencentCompactBase64(value: string): string {
  const normalized = value.replace(/\*/g, '+').replace(/-/g, '/').replace(/_/g, '=')
  const remainder = normalized.length % 4

  return remainder === 0 ? normalized : normalized + '='.repeat(4 - remainder)
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function toFiniteNumber(value: unknown): number | undefined {
  const numberValue = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numberValue) ? numberValue : undefined
}

function deriveUnhealthyConnectionReason(state: string | undefined): string | undefined {
  if (!state) {
    return undefined
  }

  switch (state.toLowerCase()) {
    case 'disconnected':
    case 'failed':
    case 'closed':
      return `connection-state:${state}`
    default:
      return undefined
  }
}

function deriveUnhealthyPublishReason(state: string | undefined): string | undefined {
  if (!state) {
    return undefined
  }

  switch (state.toLowerCase()) {
    case 'failed':
    case 'stopped':
      return `publish-state:${state}`
    default:
      return undefined
  }
}

function deriveUnhealthyAudioContextReason(state: string | undefined): string | undefined {
  if (!state) {
    return undefined
  }

  switch (state.toLowerCase()) {
    case 'suspended':
    case 'closed':
      return `audio-context-state:${state}`
    default:
      return undefined
  }
}

function startSpaceConnectionHeartbeat(client: PopopoClient, spaceKey: string): () => void {
  let stopped = false
  let inFlight = false

  const tick = async () => {
    if (stopped || inFlight) {
      return
    }

    inFlight = true

    try {
      await touchSpaceConnection(client, spaceKey)
    } catch {
      // The main session health is tracked via TRTC events. Heartbeat retries stay best-effort.
    } finally {
      inFlight = false
    }
  }

  const timer = setInterval(() => {
    void tick()
  }, SPACE_CONNECTION_HEARTBEAT_INTERVAL_MS)

  void tick()

  return () => {
    stopped = true
    clearInterval(timer)
  }
}

async function touchSpaceConnection(client: PopopoClient, spaceKey: string): Promise<void> {
  try {
    await client.spaces.touchConnection(spaceKey)
  } catch (error) {
    if (!shouldReconnectSpaceConnection(error)) {
      throw error
    }

    await ensureSpaceConnected(client, spaceKey)
    await client.spaces.touchConnection(spaceKey)
  }
}

function shouldReconnectSpaceConnection(error: unknown): boolean {
  return error instanceof PopopoApiError && (error.status === 404 || error.status === 409)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
