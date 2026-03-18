export class PopopoApiError<TBody = unknown> extends Error {
  readonly status: number
  readonly statusText: string
  readonly url: string
  readonly body: TBody | undefined
  readonly response: Response

  constructor(message: string, response: Response, body?: TBody) {
    super(message)
    this.name = 'PopopoApiError'
    this.status = response.status
    this.statusText = response.statusText
    this.url = response.url
    this.body = body
    this.response = response
  }
}

export class PopopoConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PopopoConfigurationError'
  }
}
