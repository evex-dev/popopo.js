import { describe, expect, test } from 'bun:test'

import { PopopoClient } from './client.ts'

describe('InvitesClient', () => {
  test('fetches invite info from the API host and joins a space invite', async () => {
    const calls: Array<{ url: string; method: string; body: string }> = []

    const client = new PopopoClient({
      fetch: async (input, init) => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        const body = String(init?.body ?? '')
        calls.push({ url, method, body })

        if (url.endsWith('/api/v2/invites/invite-123')) {
          return new Response(
            JSON.stringify({
              kind: 'space',
              spaceKey: 'space-123',
            }),
            {
              status: 200,
              headers: {
                'content-type': 'application/json',
              },
            },
          )
        }

        return new Response(JSON.stringify({ result: true }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        })
      },
      session: {
        bearerToken: 'backend-token',
      },
    })

    const result = await client.invites.accept(
      'https://www.popopo.com/ja/spaces/space-123/invites/invite-123',
    )

    expect(calls).toEqual([
      {
        url: 'https://api.popopo.com/api/v2/invites/invite-123',
        method: 'GET',
        body: '',
      },
      {
        url: 'https://api.popopo.com/api/v2/spaces/space-123/users/me',
        method: 'POST',
        body: JSON.stringify({ inviteKey: 'invite-123' }),
      },
    ])
    expect(result).toMatchObject({
      kind: 'space',
      inviteKey: 'invite-123',
      spaceKey: 'space-123',
      response: { result: true },
    })
    expect(client.getSession()).toMatchObject({
      currentSpaceKey: 'space-123',
    })
  })
})

describe('CoinsClient', () => {
  test('requests user-private-data from Firestore with a Bearer Firebase token', async () => {
    let seenUrl = ''
    let seenAuthorization = ''

    const client = new PopopoClient({
      fetch: async (input, init) => {
        seenUrl = String(input)
        seenAuthorization = new Headers(init?.headers).get('authorization') ?? ''

        return new Response(
          JSON.stringify({
            name: 'projects/popopo-prod/databases/(default)/documents/user-privates/user-123',
            fields: {
              coinBalances: {
                mapValue: {
                  fields: {
                    paid: { integerValue: '12' },
                    free: { integerValue: '34' },
                  },
                },
              },
            },
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        )
      },
      session: {
        userId: 'user-123',
        firebaseIdToken: 'firebase-token',
      },
      firebase: {
        apiKey: 'api-key',
        projectId: 'popopo-prod',
      },
    })

    const result = await client.coins.getBalance()

    expect(seenUrl).toBe(
      'https://firestore.googleapis.com/v1/projects/popopo-prod/databases/(default)/documents/user-privates/user-123?key=api-key',
    )
    expect(seenAuthorization).toBe('Bearer firebase-token')
    expect(result.documentPath).toBe(
      'projects/popopo-prod/databases/(default)/documents/user-privates/user-123',
    )
    expect(result.coinBalances).toEqual({
      paid: 12,
      free: 34,
    })
    expect(result.paidCoins).toBe(12)
    expect(result.freeCoins).toBe(34)
  })

  test('normalizes array-style coin balances and falls back to session bearer token', async () => {
    const client = new PopopoClient({
      fetch: async () =>
        new Response(
          JSON.stringify({
            name: 'projects/popopo-prod/databases/(default)/documents/user-privates/user-456',
            fields: {
              coinBalances: {
                arrayValue: {
                  values: [
                    {
                      mapValue: {
                        fields: {
                          scope: { stringValue: 'paidCoins' },
                          amount: { integerValue: '99' },
                        },
                      },
                    },
                    {
                      mapValue: {
                        fields: {
                          scope: { stringValue: 'freeCoins' },
                          amount: { integerValue: '7' },
                        },
                      },
                    },
                  ],
                },
              },
            },
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        ),
      session: {
        userId: 'user-456',
        bearerToken: 'fallback-token',
      },
      firebase: {
        apiKey: 'api-key',
        projectId: 'popopo-prod',
      },
    })

    const result = await client.coins.getBalance()

    expect(result.coinBalances).toEqual({
      paidCoins: 99,
      freeCoins: 7,
    })
    expect(result.paidCoins).toBe(99)
    expect(result.freeCoins).toBe(7)
  })
})

describe('LivesClient', () => {
  test('starts a live and stores the live context in session', async () => {
    let seenUrl = ''
    let seenAuthorization = ''
    let seenBody = ''

    const client = new PopopoClient({
      fetch: async (input, init) => {
        seenUrl = String(input)
        seenAuthorization = new Headers(init?.headers).get('authorization') ?? ''
        seenBody = String(init?.body ?? '')

        return new Response(JSON.stringify({ id: 'live-789' }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        })
      },
      session: {
        bearerToken: 'backend-token',
      },
    })

    const result = await client.lives.start({
      spaceKey: 'space-123',
      body: {
        genreId: 'genre-1',
        tags: ['test'],
        canEnter: true,
      },
    })

    expect(seenUrl).toBe('https://api.popopo.com/api/v2/spaces/space-123/lives')
    expect(seenAuthorization).toBe('Bearer backend-token')
    expect(seenBody).toBe(
      JSON.stringify({
        genreId: 'genre-1',
        tags: ['test'],
        canEnter: true,
      }),
    )
    expect(result).toEqual({ id: 'live-789' })
    expect(client.getSession()).toMatchObject({
      currentSpaceKey: 'space-123',
      currentLiveId: 'live-789',
    })
  })

  test('posts live comments to the backend comment endpoint', async () => {
    let seenUrl = ''
    let seenAuthorization = ''
    let seenBody = ''

    const client = new PopopoClient({
      fetch: async (input, init) => {
        seenUrl = String(input)
        seenAuthorization = new Headers(init?.headers).get('authorization') ?? ''
        seenBody = String(init?.body ?? '')

        return new Response(JSON.stringify({ id: 'comment-123' }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        })
      },
      session: {
        bearerToken: 'firebase-id-token',
        currentSpaceKey: 'space-123',
        currentLiveId: 'live-456',
      },
    })

    const result = await client.lives.postComment({
      body: {
        kind: 'text',
        value: 'hello',
      },
    })

    expect(seenUrl).toBe('https://api.popopo.com/api/v2/spaces/space-123/lives/live-456/comments')
    expect(seenAuthorization).toBe('Bearer firebase-id-token')
    expect(seenBody).toBe(JSON.stringify({ kind: 'text', value: 'hello' }))
    expect(result).toEqual({ id: 'comment-123' })
  })

  test('reads live comments from the Firestore comment collection', async () => {
    let seenUrl = ''
    let seenAuthorization = ''

    const client = new PopopoClient({
      fetch: async (input, init) => {
        seenUrl = String(input)
        seenAuthorization = new Headers(init?.headers).get('authorization') ?? ''

        return new Response(
          JSON.stringify({
            documents: [
              {
                name: 'projects/popopo-prod/databases/(default)/documents/spaces/space-123/lives/live-456/comments/comment-789',
                fields: {
                  kind: { stringValue: 'text' },
                  value: { stringValue: 'hello world' },
                  created_at: { integerValue: '123' },
                  user: {
                    mapValue: {
                      fields: {
                        id: { stringValue: 'user-1' },
                        name: { stringValue: 'alice' },
                      },
                    },
                  },
                },
              },
            ],
            nextPageToken: 'next-page',
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        )
      },
      session: {
        firebaseIdToken: 'firebase-token',
        currentSpaceKey: 'space-123',
        currentLiveId: 'live-456',
      },
      firebase: {
        apiKey: 'api-key',
        projectId: 'popopo-prod',
      },
    })

    const result = await client.lives.listComments({
      options: {
        limit: 5,
        orderBy: 'created_at desc',
      },
    })

    expect(seenUrl).toBe(
      'https://firestore.googleapis.com/v1/projects/popopo-prod/databases/(default)/documents/spaces/space-123/lives/live-456/comments?key=api-key&pageSize=5&orderBy=created_at+desc',
    )
    expect(seenAuthorization).toBe('Bearer firebase-token')
    expect(result.nextPageToken).toBe('next-page')
    expect(result.comments).toHaveLength(1)
    expect(result.comments[0]).toMatchObject({
      id: 'comment-789',
      kind: 'text',
      value: 'hello world',
      createdAt: 123,
      user: {
        id: 'user-1',
        name: 'alice',
      },
    })
  })

  test('creates a live selection through the backend selections endpoint', async () => {
    let seenUrl = ''
    let seenAuthorization = ''
    let seenBody = ''

    const client = new PopopoClient({
      fetch: async (input, init) => {
        seenUrl = String(input)
        seenAuthorization = new Headers(init?.headers).get('authorization') ?? ''
        seenBody = String(init?.body ?? '')

        return new Response(JSON.stringify({ id: 'selection-123' }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        })
      },
      session: {
        bearerToken: 'backend-token',
        currentSpaceKey: 'space-123',
        currentLiveId: 'live-456',
      },
    })

    const result = await client.lives.createSelection({
      body: {
        kind: 'message',
        title: 'question box',
      },
    })

    expect(seenUrl).toBe('https://api.popopo.com/api/v2/spaces/space-123/lives/live-456/selections')
    expect(seenAuthorization).toBe('Bearer backend-token')
    expect(seenBody).toBe(JSON.stringify({ kind: 'message', title: 'question box' }))
    expect(result).toEqual({ id: 'selection-123' })
  })

  test('reads live selections from the Firestore selections collection', async () => {
    let seenUrl = ''
    let seenAuthorization = ''

    const client = new PopopoClient({
      fetch: async (input, init) => {
        seenUrl = String(input)
        seenAuthorization = new Headers(init?.headers).get('authorization') ?? ''

        return new Response(
          JSON.stringify({
            documents: [
              {
                name: 'projects/popopo-prod/databases/(default)/documents/spaces/space-123/lives/live-456/selections/selection-789',
                fields: {
                  id: { stringValue: 'selection-789' },
                  kind: { stringValue: 'message' },
                  title: { stringValue: 'letters' },
                  status: { stringValue: 'published' },
                  participants: {
                    arrayValue: {
                      values: [{ stringValue: 'user-1' }, { stringValue: 'user-2' }],
                    },
                  },
                  created_at: { integerValue: '123' },
                },
              },
            ],
            nextPageToken: 'next-page',
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        )
      },
      session: {
        firebaseIdToken: 'firebase-token',
        currentSpaceKey: 'space-123',
        currentLiveId: 'live-456',
      },
      firebase: {
        apiKey: 'api-key',
        projectId: 'popopo-prod',
      },
    })

    const result = await client.lives.listSelections({
      options: {
        limit: 10,
        orderBy: 'created_at desc',
      },
    })

    expect(seenUrl).toBe(
      'https://firestore.googleapis.com/v1/projects/popopo-prod/databases/(default)/documents/spaces/space-123/lives/live-456/selections?key=api-key&pageSize=10&orderBy=created_at+desc',
    )
    expect(seenAuthorization).toBe('Bearer firebase-token')
    expect(result.nextPageToken).toBe('next-page')
    expect(result.selections).toEqual([
      expect.objectContaining({
        id: 'selection-789',
        selectionId: 'selection-789',
        kind: 'message',
        title: 'letters',
        status: 'published',
        participants: ['user-1', 'user-2'],
        createdAt: 123,
      }),
    ])
  })

  test('reads a single live selection document from Firestore', async () => {
    let seenUrl = ''
    let seenAuthorization = ''

    const client = new PopopoClient({
      fetch: async (input, init) => {
        seenUrl = String(input)
        seenAuthorization = new Headers(init?.headers).get('authorization') ?? ''

        return new Response(
          JSON.stringify({
            name: 'projects/popopo-prod/databases/(default)/documents/spaces/space-123/lives/live-456/selections/selection-999',
            fields: {
              kind: { stringValue: 'talk' },
              title: { stringValue: 'talk theme' },
              status: { stringValue: 'published' },
            },
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        )
      },
      session: {
        firebaseIdToken: 'firebase-token',
        currentSpaceKey: 'space-123',
        currentLiveId: 'live-456',
      },
      firebase: {
        apiKey: 'api-key',
        projectId: 'popopo-prod',
      },
    })

    const result = await client.lives.getSelection({
      selectionId: 'selection-999',
    })

    expect(seenUrl).toBe(
      'https://firestore.googleapis.com/v1/projects/popopo-prod/databases/(default)/documents/spaces/space-123/lives/live-456/selections/selection-999?key=api-key',
    )
    expect(seenAuthorization).toBe('Bearer firebase-token')
    expect(result).toMatchObject({
      id: 'selection-999',
      selectionId: 'selection-999',
      kind: 'talk',
      title: 'talk theme',
      status: 'published',
    })
  })

  test('reads selection participants from the Firestore participants collection', async () => {
    let seenUrl = ''
    let seenAuthorization = ''

    const client = new PopopoClient({
      fetch: async (input, init) => {
        seenUrl = String(input)
        seenAuthorization = new Headers(init?.headers).get('authorization') ?? ''

        return new Response(
          JSON.stringify({
            documents: [
              {
                name: 'projects/popopo-prod/databases/(default)/documents/spaces/space-123/lives/live-456/selections/selection-999/participants/participant-1',
                fields: {
                  value: { stringValue: 'hello answer' },
                  selected: { booleanValue: true },
                  created_at: { integerValue: '1234' },
                  user: {
                    mapValue: {
                      fields: {
                        id: { stringValue: 'user-1' },
                        name: { stringValue: 'alice' },
                      },
                    },
                  },
                },
              },
            ],
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        )
      },
      session: {
        firebaseIdToken: 'firebase-token',
        currentSpaceKey: 'space-123',
        currentLiveId: 'live-456',
      },
      firebase: {
        apiKey: 'api-key',
        projectId: 'popopo-prod',
      },
    })

    const result = await client.lives.listSelectionParticipants({
      selectionId: 'selection-999',
      options: {
        limit: 20,
        orderBy: 'created_at desc',
      },
    })

    expect(seenUrl).toBe(
      'https://firestore.googleapis.com/v1/projects/popopo-prod/databases/(default)/documents/spaces/space-123/lives/live-456/selections/selection-999/participants?key=api-key&pageSize=20&orderBy=created_at+desc',
    )
    expect(seenAuthorization).toBe('Bearer firebase-token')
    expect(result.participants).toEqual([
      expect.objectContaining({
        id: 'participant-1',
        participantId: 'participant-1',
        value: 'hello answer',
        selected: true,
        createdAt: 1234,
        user: {
          id: 'user-1',
          name: 'alice',
        },
      }),
    ])
  })

  test('reads selection sequences from the Firestore sequences collection', async () => {
    let seenUrl = ''
    let seenAuthorization = ''

    const client = new PopopoClient({
      fetch: async (input, init) => {
        seenUrl = String(input)
        seenAuthorization = new Headers(init?.headers).get('authorization') ?? ''

        return new Response(
          JSON.stringify({
            documents: [
              {
                name: 'projects/popopo-prod/databases/(default)/documents/spaces/space-123/lives/live-456/selections/selection-999/sequences/sequence-1',
                fields: {
                  kind: { stringValue: 'participate' },
                  value: {
                    mapValue: {
                      fields: {
                        open: { booleanValue: true },
                      },
                    },
                  },
                  created_at: { integerValue: '2345' },
                },
              },
            ],
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        )
      },
      session: {
        firebaseIdToken: 'firebase-token',
        currentSpaceKey: 'space-123',
        currentLiveId: 'live-456',
      },
      firebase: {
        apiKey: 'api-key',
        projectId: 'popopo-prod',
      },
    })

    const result = await client.lives.listSelectionSequences({
      selectionId: 'selection-999',
      options: {
        limit: 20,
        orderBy: 'created_at desc',
      },
    })

    expect(seenUrl).toBe(
      'https://firestore.googleapis.com/v1/projects/popopo-prod/databases/(default)/documents/spaces/space-123/lives/live-456/selections/selection-999/sequences?key=api-key&pageSize=20&orderBy=created_at+desc',
    )
    expect(seenAuthorization).toBe('Bearer firebase-token')
    expect(result.sequences).toEqual([
      expect.objectContaining({
        id: 'sequence-1',
        sequenceId: 'sequence-1',
        kind: 'participate',
        createdAt: 2345,
        value: {
          open: true,
        },
      }),
    ])
  })

  test('starts selection pseudo-nominate and nominate sequence actions', async () => {
    const calls: Array<{ url: string; method: string; body: string }> = []

    const client = new PopopoClient({
      fetch: async (input, init) => {
        calls.push({
          url: String(input),
          method: init?.method ?? 'GET',
          body: String(init?.body ?? ''),
        })

        return new Response(JSON.stringify({ sequenceId: 'sequence-next' }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        })
      },
      session: {
        bearerToken: 'backend-token',
        currentSpaceKey: 'space-123',
        currentLiveId: 'live-456',
      },
    })

    const pseudoNominate = await client.lives.startSelectionPseudoNominate({
      selectionId: 'selection-321',
      count: 2,
      sequenceId: 'sequence-001',
    })
    const nominate = await client.lives.startSelectionDraw({
      selectionId: 'selection-321',
      count: 2,
      sequenceId: 'sequence-001',
    })

    expect(calls).toEqual([
      {
        url: 'https://api.popopo.com/api/v2/spaces/space-123/lives/live-456/selections/selection-321/sequences/pseudo-nominate',
        method: 'POST',
        body: JSON.stringify({
          count: 2,
          sequence: {
            id: 'sequence-001',
          },
        }),
      },
      {
        url: 'https://api.popopo.com/api/v2/spaces/space-123/lives/live-456/selections/selection-321/sequences/nominate',
        method: 'POST',
        body: JSON.stringify({
          count: 2,
          sequence: {
            id: 'sequence-001',
          },
        }),
      },
    ])
    expect(pseudoNominate).toEqual({ sequenceId: 'sequence-next' })
    expect(nominate).toEqual({ sequenceId: 'sequence-next' })
  })

  test('collects receive info from Firestore and decodes Tencent compact tokens', async () => {
    const userSig =
      'eJw1zUEOgjAUBNC7-LUhbQkUmrhAd0AkilG21Bb5IqQiImK8uxF1*2Yy84RtnFqodNNhgboFAVFfGfdcLR9JKQt-hWF4V3snOykjGcym-lVVuTGoQAAjhLmU01-SYa1BUM5tjzmUeF-Vg8H24x75Qj89MYv8B-EIAhbcN2njB02UHXbIPCkz2QejKXO6ubhquI0qUU4do72ew*sN8G04ow__'
    const privateMapKey =
      'eJw1j8tygkAURP9ltklZwxDkUcUCEU2hQOQRDbuB4TGA1oQBUVL59xRoetV9*i5u-4BwHywoyS4dzWnWAg3srjVbNrV598okV11q2wM5SqeKsASB1-mekxozRgnQAIIQLQVZeDYdPWdAE2RZVJAkQOVBsxuj7cQV*AA9z9qkz4EGjIORBmLcpuuYY*hKISppXDUejtiOIP-kfpbf8fuKOoV1q0duTMIJ68zJfChzNlb*OmxK06-cfdRYEIvREDer4Svig1Po*vO36zwPLeD-CloADaTBeNgabxFXXlRO6uS*GatNoNrbs4ktNU2O9CJ3lt27nqOD3z8aEV4q'
    const calls: string[] = []

    const client = new PopopoClient({
      fetch: async (input, init) => {
        const url = String(input)
        calls.push(url)

        if (url.includes('/connection-info')) {
          return new Response(JSON.stringify({ userSig, privateMapKey }), {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          })
        }

        if (url.includes('/documents/spaces/space-123/lives/live-456')) {
          expect(new Headers(init?.headers).get('authorization')).toBe('Bearer firebase-token')

          return new Response(
            JSON.stringify({
              name: 'projects/popopo-prod/databases/(default)/documents/spaces/space-123/lives/live-456',
              fields: {
                stream_name: { stringValue: 'space-123_live-456_stream-token' },
                token: { stringValue: 'stream-token' },
                task_id: { stringValue: 'task-123' },
                status: { stringValue: 'started' },
              },
            }),
            {
              status: 200,
              headers: {
                'content-type': 'application/json',
              },
            },
          )
        }

        throw new Error(`Unexpected request: ${url}`)
      },
      session: {
        bearerToken: 'backend-token',
        firebaseIdToken: 'firebase-token',
        currentSpaceKey: 'space-123',
        currentLiveId: 'live-456',
      },
      firebase: {
        apiKey: 'api-key',
        projectId: 'popopo-prod',
      },
    })

    const result = await client.lives.getReceiveInfo()

    expect(calls).toEqual([
      'https://firestore.googleapis.com/v1/projects/popopo-prod/databases/(default)/documents/spaces/space-123/lives/live-456?key=api-key',
      'https://api.popopo.com/api/v2/spaces/space-123/connection-info',
    ])
    expect(result).toMatchObject({
      spaceKey: 'space-123',
      liveId: 'live-456',
      streamName: 'space-123_live-456_stream-token',
      liveToken: 'stream-token',
      taskId: 'task-123',
      liveStatus: 'started',
      sdkAppId: 20026171,
      userId: 'Kvkp6lkCyOhbf9NiJJwdW5Xjdpb2',
      userSig,
      privateMapKey,
      trtcPlayUrl:
        'trtc://cloud.tencent.com/play/space-123_live-456_stream-token?sdkappid=20026171&userId=Kvkp6lkCyOhbf9NiJJwdW5Xjdpb2&usersig=' +
        encodeURIComponent(userSig).replace(/%2A/g, '*') +
        '&appscene=live',
    })
    expect(result.decodedUserSig).toMatchObject({
      'TLS.identifier': 'Kvkp6lkCyOhbf9NiJJwdW5Xjdpb2',
      'TLS.sdkappid': '20026171',
    })
    expect(result.decodedPrivateMapKey).toMatchObject({
      'TLS.sdkappid': '20026171',
      'TLS.userbuf': expect.any(String),
    })
  })
})

describe('NotificationsClient', () => {
  test('reads system notifications from Firestore and filters non-public entries', async () => {
    let seenUrl = ''
    let seenAuthorization = ''

    const client = new PopopoClient({
      fetch: async (input, init) => {
        seenUrl = String(input)
        seenAuthorization = new Headers(init?.headers).get('authorization') ?? ''

        return new Response(
          JSON.stringify({
            documents: [
              {
                name: 'projects/popopo-prod/databases/(default)/documents/system-notifications/sn-public',
                fields: {
                  title: { stringValue: 'public title' },
                  body: { stringValue: 'public body' },
                  status: { stringValue: 'public' },
                  display_period_state: {
                    mapValue: {
                      fields: {
                        active: { booleanValue: true },
                      },
                    },
                  },
                  display_period: {
                    mapValue: {
                      fields: {
                        start_at: { integerValue: '1700000000' },
                      },
                    },
                  },
                },
              },
              {
                name: 'projects/popopo-prod/databases/(default)/documents/system-notifications/sn-private',
                fields: {
                  title: { stringValue: 'private title' },
                  status: { stringValue: 'private' },
                  display_period_state: {
                    mapValue: {
                      fields: {
                        active: { booleanValue: true },
                      },
                    },
                  },
                },
              },
              {
                name: 'projects/popopo-prod/databases/(default)/documents/system-notifications/sn-inactive',
                fields: {
                  title: { stringValue: 'inactive title' },
                  status: { stringValue: 'public' },
                  display_period_state: {
                    mapValue: {
                      fields: {
                        active: { booleanValue: false },
                      },
                    },
                  },
                },
              },
            ],
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        )
      },
      session: {
        firebaseIdToken: 'firebase-token',
      },
      firebase: {
        apiKey: 'api-key',
        projectId: 'popopo-prod',
      },
    })

    const result = await client.notifications.list()

    expect(seenUrl).toBe(
      'https://firestore.googleapis.com/v1/projects/popopo-prod/databases/(default)/documents/system-notifications?key=api-key&pageSize=20&orderBy=display_period.start_at+desc',
    )
    expect(seenAuthorization).toBe('Bearer firebase-token')
    expect(result).toEqual([
      expect.objectContaining({
        id: 'sn-public',
        systemNotificationId: 'sn-public',
        title: 'public title',
        body: 'public body',
        status: 'public',
        displayPeriodStartAt: 1700000000,
      }),
    ])
  })

  test('refreshes an expired Firebase token before reading Firestore notifications', async () => {
    const calls: string[] = []
    const seenAuthorizations: string[] = []
    const expiredToken = ['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', 'eyJleHAiOjF9', 'sig'].join('.')
    const freshToken = [
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
      'eyJleHAiOjk5OTk5OTk5OTksInVzZXJfaWQiOiJ1c2VyLXJlZnJlc2hlZCJ9',
      'sig',
    ].join('.')

    const client = new PopopoClient({
      fetch: async (input, init) => {
        const url = String(input)
        calls.push(url)
        seenAuthorizations.push(new Headers(init?.headers).get('authorization') ?? '')

        if (url.startsWith('https://securetoken.googleapis.com/v1/token')) {
          return new Response(
            JSON.stringify({
              access_token: 'access-token',
              id_token: freshToken,
              refresh_token: 'refresh-2',
              user_id: 'user-refreshed',
              expires_in: '3600',
              token_type: 'Bearer',
            }),
            {
              status: 200,
              headers: {
                'content-type': 'application/json',
              },
            },
          )
        }

        return new Response(
          JSON.stringify({
            documents: [
              {
                name: 'projects/popopo-prod/databases/(default)/documents/system-notifications/sn-refreshed',
                fields: {
                  title: { stringValue: 'refreshed title' },
                  status: { stringValue: 'public' },
                  display_period_state: {
                    mapValue: {
                      fields: {
                        active: { booleanValue: true },
                      },
                    },
                  },
                },
              },
            ],
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        )
      },
      session: {
        firebaseIdToken: expiredToken,
        refreshToken: 'refresh-1',
      },
      firebase: {
        apiKey: 'api-key',
        projectId: 'popopo-prod',
      },
    })

    const result = await client.notifications.list()

    expect(calls).toEqual([
      'https://securetoken.googleapis.com/v1/token?key=api-key',
      'https://firestore.googleapis.com/v1/projects/popopo-prod/databases/(default)/documents/system-notifications?key=api-key&pageSize=20&orderBy=display_period.start_at+desc',
    ])
    expect(seenAuthorizations).toEqual(['', `Bearer ${freshToken}`])
    expect(client.getSession()).toMatchObject({
      firebaseIdToken: freshToken,
      bearerToken: freshToken,
      refreshToken: 'refresh-2',
      userId: 'user-refreshed',
    })
    expect(result).toEqual([
      expect.objectContaining({
        id: 'sn-refreshed',
        title: 'refreshed title',
      }),
    ])
  })

  test('reads personal notifications from the user Firestore collection', async () => {
    let seenUrl = ''
    let seenAuthorization = ''

    const client = new PopopoClient({
      fetch: async (input, init) => {
        seenUrl = String(input)
        seenAuthorization = new Headers(init?.headers).get('authorization') ?? ''

        return new Response(
          JSON.stringify({
            documents: [
              {
                name: 'projects/popopo-prod/databases/(default)/documents/users/user-123/personal-notifications/pn-123',
                fields: {
                  title: { stringValue: 'personal title' },
                  body: { stringValue: 'personal body' },
                  kind: { stringValue: 'campaign' },
                  is_read: { booleanValue: false },
                  created_at: { integerValue: '1700000100' },
                  image_url: { stringValue: 'https://example.com/image.png' },
                  thumbnail_url: { stringValue: 'https://example.com/thumb.png' },
                  transition_url: { stringValue: 'popopo://notifications/pn-123' },
                },
              },
            ],
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        )
      },
      session: {
        userId: 'user-123',
        firebaseIdToken: 'firebase-token',
      },
      firebase: {
        apiKey: 'api-key',
        projectId: 'popopo-prod',
      },
    })

    const result = await client.notifications.listPersonal()

    expect(seenUrl).toBe(
      'https://firestore.googleapis.com/v1/projects/popopo-prod/databases/(default)/documents/users/user-123/personal-notifications?key=api-key&pageSize=20&orderBy=created_at+desc',
    )
    expect(seenAuthorization).toBe('Bearer firebase-token')
    expect(result).toEqual([
      expect.objectContaining({
        id: 'pn-123',
        personalNotificationId: 'pn-123',
        title: 'personal title',
        body: 'personal body',
        kind: 'campaign',
        read: false,
        createdAt: 1700000100,
        imageUrl: 'https://example.com/image.png',
        thumbnailUrl: 'https://example.com/thumb.png',
        transitionUrl: 'popopo://notifications/pn-123',
      }),
    ])
  })

  test('reads a personal notification document from Firestore', async () => {
    let seenUrl = ''
    let seenAuthorization = ''

    const client = new PopopoClient({
      fetch: async (input, init) => {
        seenUrl = String(input)
        seenAuthorization = new Headers(init?.headers).get('authorization') ?? ''

        return new Response(
          JSON.stringify({
            name: 'projects/popopo-prod/databases/(default)/documents/users/user-123/personal-notifications/pn-456',
            fields: {
              title: { stringValue: 'detail title' },
              body: { stringValue: 'detail body' },
              is_read: { booleanValue: true },
              read_at: { timestampValue: '2026-03-18T00:00:00Z' },
            },
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        )
      },
      session: {
        userId: 'user-123',
        firebaseIdToken: 'firebase-token',
      },
      firebase: {
        apiKey: 'api-key',
        projectId: 'popopo-prod',
      },
    })

    const result = await client.notifications.getPersonalById('pn-456')

    expect(seenUrl).toBe(
      'https://firestore.googleapis.com/v1/projects/popopo-prod/databases/(default)/documents/users/user-123/personal-notifications/pn-456?key=api-key',
    )
    expect(seenAuthorization).toBe('Bearer firebase-token')
    expect(result).toMatchObject({
      id: 'pn-456',
      personalNotificationId: 'pn-456',
      title: 'detail title',
      body: 'detail body',
      read: true,
      readAt: '2026-03-18T00:00:00Z',
    })
  })

  test('parses present notifications from Firestore content and delivery metadata', async () => {
    const client = new PopopoClient({
      fetch: async () =>
        new Response(
          JSON.stringify({
            name: 'projects/popopo-prod/databases/(default)/documents/users/user-123/personal-notifications/pn-present',
            fields: {
              title: { stringValue: 'リリース記念プレゼント（1000コイン）' },
              kind: { stringValue: 'present' },
              icon: { stringValue: 'present' },
              is_read: { booleanValue: false },
              content: {
                mapValue: {
                  fields: {
                    ops: {
                      arrayValue: {
                        values: [
                          {
                            mapValue: {
                              fields: {
                                insert: { stringValue: '1000コインをプレゼント' },
                              },
                            },
                          },
                        ],
                      },
                    },
                  },
                },
              },
              delivery_content: {
                mapValue: {
                  fields: {
                    expire_at: { integerValue: '1777561140000' },
                    received_at: { integerValue: '1773833090511' },
                  },
                },
              },
              source: {
                mapValue: {
                  fields: {
                    kind: { stringValue: 'welcome_delivery' },
                    welcome_delivery_master_id: { stringValue: 'welcome-123' },
                  },
                },
              },
            },
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        ),
      session: {
        userId: 'user-123',
        firebaseIdToken: 'firebase-token',
      },
      firebase: {
        apiKey: 'api-key',
        projectId: 'popopo-prod',
      },
    })

    const result = await client.notifications.getPersonalById('pn-present')

    expect(result).toMatchObject({
      id: 'pn-present',
      personalNotificationId: 'pn-present',
      title: 'リリース記念プレゼント（1000コイン）',
      body: '1000コインをプレゼント',
      kind: 'present',
      icon: 'present',
      read: false,
      receivedAt: 1773833090511,
      source: {
        kind: 'welcome_delivery',
        welcomeDeliveryMasterId: 'welcome-123',
      },
      deliveryContent: {
        expireAt: 1777561140000,
        receivedAt: 1773833090511,
      },
    })
  })

  test('receives personal notification delivery content with PUT and received status', async () => {
    let seenUrl = ''
    let seenMethod = ''
    let seenBody = ''

    const client = new PopopoClient({
      fetch: async (input, init) => {
        seenUrl = String(input)
        seenMethod = init?.method ?? ''
        seenBody = String(init?.body ?? '')

        return new Response(
          JSON.stringify({
            result: true,
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        )
      },
      session: {
        bearerToken: 'backend-token',
      },
    })

    const result = await client.notifications.receivePersonalDeliveryContent('pn-123', {
      status: 'received',
    })

    expect(seenUrl).toBe(
      'https://api.popopo.com/api/v2/personal-notifications/pn-123/delivery-content',
    )
    expect(seenMethod).toBe('PUT')
    expect(seenBody).toBe(JSON.stringify({ status: 'received' }))
    expect(result).toEqual({
      result: true,
    })
  })

  test('receives the latest unreceived present notification', async () => {
    const calls: Array<{ url: string; method: string; authorization: string; body: string }> = []

    const client = new PopopoClient({
      fetch: async (input, init) => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        const authorization = new Headers(init?.headers).get('authorization') ?? ''
        const body = String(init?.body ?? '')
        calls.push({ url, method, authorization, body })

        if (url.includes('/personal-notifications?')) {
          return new Response(
            JSON.stringify({
              documents: [
                {
                  name:
                    'projects/popopo-prod/databases/(default)/documents/users/user-123/personal-notifications/pn-newest-received',
                  fields: {
                    title: { stringValue: 'already received' },
                    kind: { stringValue: 'present' },
                    scheduled_delivery_at: { integerValue: '200' },
                    delivery_content: {
                      mapValue: {
                        fields: {
                          received_at: { integerValue: '201' },
                        },
                      },
                    },
                  },
                },
                {
                  name:
                    'projects/popopo-prod/databases/(default)/documents/users/user-123/personal-notifications/pn-target',
                  fields: {
                    title: { stringValue: 'target present' },
                    kind: { stringValue: 'present' },
                    scheduled_delivery_at: { integerValue: '199' },
                  },
                },
              ],
            }),
            {
              status: 200,
              headers: {
                'content-type': 'application/json',
              },
            },
          )
        }

        if (url.endsWith('/api/v2/personal-notifications/pn-target/delivery-content')) {
          return new Response(JSON.stringify({ result: true }), {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          })
        }

        throw new Error(`Unexpected request: ${url}`)
      },
      session: {
        userId: 'user-123',
        firebaseIdToken: 'firebase-token',
        bearerToken: 'backend-token',
      },
      firebase: {
        apiKey: 'api-key',
        projectId: 'popopo-prod',
      },
    })

    const result = await client.notifications.receiveLatestPresent()

    expect(calls).toEqual([
      {
        url:
          'https://firestore.googleapis.com/v1/projects/popopo-prod/databases/(default)/documents/users/user-123/personal-notifications?key=api-key&pageSize=20&orderBy=scheduled_delivery_at+desc',
        method: 'GET',
        authorization: 'Bearer firebase-token',
        body: '',
      },
      {
        url: 'https://api.popopo.com/api/v2/personal-notifications/pn-target/delivery-content',
        method: 'PUT',
        authorization: 'Bearer backend-token',
        body: JSON.stringify({ status: 'received' }),
      },
    ])
    expect(result).toEqual({
      notification: expect.objectContaining({
        id: 'pn-target',
        personalNotificationId: 'pn-target',
        title: 'target present',
      }),
      response: {
        result: true,
      },
    })
  })
})

describe('PushClient', () => {
  test('upserts a push device with PUT', async () => {
    let seenUrl = ''
    let seenMethod = ''
    let seenAuthorization = ''
    let seenBody = ''

    const client = new PopopoClient({
      fetch: async (input, init) => {
        seenUrl = String(input)
        seenMethod = String(init?.method ?? '')
        seenAuthorization = new Headers(init?.headers).get('authorization') ?? ''
        seenBody = String(init?.body ?? '')

        return new Response(JSON.stringify({ result: true }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        })
      },
      session: {
        bearerToken: 'backend-token',
      },
    })

    const result = await client.push.upsertDevice('device-123', {
      deviceName: 'uset',
      system: 'android',
      app: 'popopo',
    })

    expect(seenUrl).toBe('https://api.popopo.com/api/v2/push/devices/device-123')
    expect(seenMethod).toBe('PUT')
    expect(seenAuthorization).toBe('Bearer backend-token')
    expect(seenBody).toBe(
      JSON.stringify({
        deviceName: 'uset',
        system: 'android',
        app: 'popopo',
      }),
    )
    expect(result).toEqual({ result: true })
  })
})

describe('CallsClient', () => {
  test('creates a live-follower call push', async () => {
    let seenUrl = ''
    let seenMethod = ''
    let seenAuthorization = ''
    let seenBody = ''

    const client = new PopopoClient({
      fetch: async (input, init) => {
        seenUrl = String(input)
        seenMethod = String(init?.method ?? '')
        seenAuthorization = new Headers(init?.headers).get('authorization') ?? ''
        seenBody = String(init?.body ?? '')

        return new Response(JSON.stringify({ pushId: 'push-123' }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        })
      },
      session: {
        bearerToken: 'backend-token',
      },
    })

    const result = await client.calls.createPush({
      kind: 'live-follower-call',
      spaceKey: 'space-123',
      liveId: 'live-456',
    })

    expect(seenUrl).toBe('https://api.popopo.com/api/v2/push/call-pushes')
    expect(seenMethod).toBe('POST')
    expect(seenAuthorization).toBe('Bearer backend-token')
    expect(seenBody).toBe(
      JSON.stringify({
        kind: 'live-follower-call',
        spaceKey: 'space-123',
        liveId: 'live-456',
      }),
    )
    expect(result).toEqual({ pushId: 'push-123' })
  })
})

describe('SpacesClient', () => {
  test('creates a space through the backend API', async () => {
    let seenUrl = ''
    let seenBody = ''

    const client = new PopopoClient({
      fetch: async (input, init) => {
        seenUrl = String(input)
        seenBody = String(init?.body ?? '')

        return new Response(JSON.stringify({ spaceKey: 'space-123' }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        })
      },
      session: {
        bearerToken: 'backend-token',
      },
    })

    const result = await client.spaces.create({
      name: 'test-space',
      backgroundId: 'bg-1',
    })

    expect(seenUrl).toBe('https://api.popopo.com/api/v2/spaces')
    expect(seenBody).toBe(JSON.stringify({ name: 'test-space', backgroundId: 'bg-1' }))
    expect(result).toEqual({ spaceKey: 'space-123' })
  })

  test('connects a space and stores the current space in session', async () => {
    const seenUrls: string[] = []

    const client = new PopopoClient({
      fetch: async (input) => {
        const url = String(input)
        seenUrls.push(url)

        if (url.endsWith('/connection-info')) {
          return new Response(JSON.stringify({ userSig: 'sig' }), {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          })
        }

        return new Response(JSON.stringify({ result: true }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        })
      },
      session: {
        bearerToken: 'backend-token',
      },
    })

    const result = await client.spaces.connect('space-123', { muted: false })

    expect(seenUrls).toEqual([
      'https://api.popopo.com/api/v2/spaces/space-123/connection-info',
      'https://api.popopo.com/api/v2/spaces/space-123/users/me/connection',
    ])
    expect(result).toMatchObject({
      spaceKey: 'space-123',
      muted: false,
      connectionInfo: { userSig: 'sig' },
      connection: { result: true },
    })
    expect(client.getSession()).toMatchObject({
      currentSpaceKey: 'space-123',
    })
  })

  test('posts and reads space messages', async () => {
    const calls: Array<{ url: string; authorization: string; body: string }> = []

    const client = new PopopoClient({
      fetch: async (input, init) => {
        const url = String(input)
        const authorization = new Headers(init?.headers).get('authorization') ?? ''
        const body = String(init?.body ?? '')
        calls.push({ url, authorization, body })

        if (url.includes('/api/v2/spaces/space-123/messages')) {
          return new Response(JSON.stringify({ result: true }), {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          })
        }

        return new Response(
          JSON.stringify({
            documents: [
              {
                name: 'projects/popopo-prod/databases/(default)/documents/spaces/space-123/space-messages/message-456',
                fields: {
                  kind: { stringValue: 'text' },
                  value: { stringValue: 'hello space' },
                  created_at: { integerValue: '321' },
                  user: {
                    mapValue: {
                      fields: {
                        id: { stringValue: 'user-1' },
                        alias: { stringValue: 'alice' },
                      },
                    },
                  },
                },
              },
            ],
            nextPageToken: 'next-page',
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        )
      },
      session: {
        bearerToken: 'backend-token',
        firebaseIdToken: 'firebase-token',
      },
      firebase: {
        apiKey: 'api-key',
        projectId: 'popopo-prod',
      },
    })

    const postResult = await client.spaces.postMessage('space-123', {
      kind: 'text',
      value: 'hello space',
    })
    const listResult = await client.spaces.listMessages('space-123', {
      limit: 5,
      orderBy: 'created_at desc',
    })

    expect(postResult).toEqual({ result: true })
    expect(listResult.nextPageToken).toBe('next-page')
    expect(listResult.messages[0]).toMatchObject({
      id: 'message-456',
      kind: 'text',
      value: 'hello space',
      createdAt: 321,
      user: {
        id: 'user-1',
        alias: 'alice',
      },
    })
    expect(calls).toEqual([
      {
        url: 'https://api.popopo.com/api/v2/spaces/space-123/messages',
        authorization: 'Bearer backend-token',
        body: JSON.stringify({ kind: 'text', value: 'hello space' }),
      },
      {
        url: 'https://firestore.googleapis.com/v1/projects/popopo-prod/databases/(default)/documents/spaces/space-123/space-messages?key=api-key&pageSize=5&orderBy=created_at+desc',
        authorization: 'Bearer firebase-token',
        body: '',
      },
    ])
  })
})
