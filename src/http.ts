import { PopopoApiError } from './errors.ts'
import type { AuthState } from './types.ts'

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export type RequestQueryValue = string | number | boolean | null | undefined

export type RequestQuery = Record<string, RequestQueryValue | RequestQueryValue[]>

export type RequestAuthMode = 'session' | 'bearer' | 'firebase' | 'none'

export type ResponseParser =
  | 'json'
  | 'text'
  | 'response'
  | ((response: Response) => Promise<unknown>)

export interface HttpRequestOptions<TBody = unknown> {
  method?: string
  path?: string
  url?: string
  query?: RequestQuery
  body?: TBody
  headers?: HeadersInit
  auth?: RequestAuthMode
  includeAppCheck?: boolean
  parseAs?: ResponseParser
  signal?: AbortSignal
}

export interface HttpClientOptions {
  baseUrl: string
  session: AuthState
  fetchImplementation?: FetchLike
  defaultHeaders?: HeadersInit
}

export class HttpClient {
  private readonly baseUrl: string
  private readonly fetchImplementation: FetchLike
  private readonly defaultHeaders: Headers
  private readonly session: AuthState

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl
    this.fetchImplementation = options.fetchImplementation ?? fetch
    this.defaultHeaders = new Headers(options.defaultHeaders)
    this.session = options.session
  }

  getSession(): Readonly<AuthState> {
    return this.session
  }

  setSession(next: Partial<AuthState>): AuthState {
    Object.assign(this.session, next)
    return this.session
  }

  clearSession(): AuthState {
    for (const key of Object.keys(this.session) as Array<keyof AuthState>) {
      delete this.session[key]
    }

    return this.session
  }

  async request<TResponse = unknown, TBody = unknown>(
    options: HttpRequestOptions<TBody>,
  ): Promise<TResponse> {
    const method = (options.method ?? 'GET').toUpperCase()
    const headers = this.buildHeaders(
      options.headers,
      options.auth ?? 'session',
      options.includeAppCheck ?? true,
    )
    const body = serializeBody(options.body, headers)
    const init: RequestInit = {
      method,
      headers,
      signal: options.signal,
    }

    if (body !== undefined && method !== 'GET' && method !== 'HEAD') {
      init.body = body
    }

    const url = buildUrl({
      baseUrl: this.baseUrl,
      path: options.path,
      url: options.url,
      query: options.query,
    })
    const response = await this.fetchImplementation(url, init)
    const payload = await parseResponseBody(response, options.parseAs ?? 'json')

    if (!response.ok) {
      throw new PopopoApiError(
        `Request failed with ${response.status} ${response.statusText}`,
        response,
        payload,
      )
    }

    return payload as TResponse
  }

  get<TResponse = unknown>(
    path: string,
    options: Omit<HttpRequestOptions<never>, 'method' | 'path'> = {},
  ): Promise<TResponse> {
    return this.request<TResponse>({
      ...options,
      method: 'GET',
      path,
    })
  }

  post<TResponse = unknown, TBody = unknown>(
    path: string,
    body?: TBody,
    options: Omit<HttpRequestOptions<TBody>, 'method' | 'path' | 'body'> = {},
  ): Promise<TResponse> {
    return this.request<TResponse, TBody>({
      ...options,
      method: 'POST',
      path,
      body,
    })
  }

  patch<TResponse = unknown, TBody = unknown>(
    path: string,
    body?: TBody,
    options: Omit<HttpRequestOptions<TBody>, 'method' | 'path' | 'body'> = {},
  ): Promise<TResponse> {
    return this.request<TResponse, TBody>({
      ...options,
      method: 'PATCH',
      path,
      body,
    })
  }

  delete<TResponse = unknown, TBody = unknown>(
    path: string,
    body?: TBody,
    options: Omit<HttpRequestOptions<TBody>, 'method' | 'path' | 'body'> = {},
  ): Promise<TResponse> {
    return this.request<TResponse, TBody>({
      ...options,
      method: 'DELETE',
      path,
      body,
    })
  }

  private buildHeaders(
    headersInit: HeadersInit | undefined,
    auth: RequestAuthMode,
    includeAppCheck: boolean,
  ): Headers {
    const headers = new Headers(this.defaultHeaders)

    for (const [key, value] of new Headers(headersInit).entries()) {
      headers.set(key, value)
    }

    const authorization = buildAuthorizationHeader(auth, this.session)

    if (authorization && !headers.has('authorization')) {
      headers.set('authorization', authorization)
    }

    if (this.session.cookie && !headers.has('cookie')) {
      headers.set('cookie', this.session.cookie)
    }

    if (includeAppCheck && this.session.appCheckToken && !headers.has('x-firebase-appcheck')) {
      headers.set('x-firebase-appcheck', this.session.appCheckToken)
    }

    return headers
  }
}

function buildUrl(options: {
  baseUrl: string
  path?: string
  url?: string
  query?: RequestQuery
}): string {
  const rawUrl = options.url ?? options.path

  if (!rawUrl) {
    throw new Error('Either `url` or `path` must be provided.')
  }

  const resolvedUrl = /^https?:\/\//i.test(rawUrl)
    ? new URL(rawUrl)
    : new URL(rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`, ensureTrailingSlash(options.baseUrl))

  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) {
        appendQueryValue(resolvedUrl, key, item)
      }
      continue
    }

    appendQueryValue(resolvedUrl, key, value)
  }

  return resolvedUrl.toString()
}

function appendQueryValue(url: URL, key: string, value: RequestQueryValue): void {
  if (value === undefined || value === null) {
    return
  }

  url.searchParams.append(key, String(value))
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`
}

function serializeBody(body: unknown, headers: Headers): BodyInit | undefined {
  if (body === undefined || body === null) {
    return undefined
  }

  if (
    typeof body === 'string' ||
    body instanceof Blob ||
    body instanceof ArrayBuffer ||
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    body instanceof ReadableStream
  ) {
    return body
  }

  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }

  return JSON.stringify(body)
}

async function parseResponseBody(response: Response, parser: ResponseParser): Promise<unknown> {
  if (typeof parser === 'function') {
    return parser(response)
  }

  if (parser === 'response') {
    return response
  }

  const text = await response.text()

  if (!text) {
    return undefined
  }

  if (parser === 'text') {
    return text
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''

  if (contentType.includes('json') || contentType.includes('+json')) {
    return JSON.parse(text)
  }

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function buildAuthorizationHeader(auth: RequestAuthMode, session: AuthState): string | undefined {
  switch (auth) {
    case 'none':
      return undefined
    case 'firebase': {
      const token = session.firebaseIdToken ?? session.bearerToken
      return token ? `Firebase ${token}` : undefined
    }
    case 'bearer':
    case 'session': {
      const token = session.bearerToken ?? session.firebaseIdToken
      return token ? `Bearer ${token}` : undefined
    }
    default:
      return undefined
  }
}
