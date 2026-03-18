import { describe, expect, test } from "bun:test";

import { PopopoClient } from "./client.ts";

describe("InvitesClient", () => {
  test("fetches invite info from the API host and joins a space invite", async () => {
    const calls: Array<{ url: string; method: string; body: string }> = [];

    const client = new PopopoClient({
      fetch: async (input, init) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        const body = String(init?.body ?? "");
        calls.push({ url, method, body });

        if (url.endsWith("/api/v2/invites/invite-123")) {
          return new Response(
            JSON.stringify({
              kind: "space",
              spaceKey: "space-123",
            }),
            {
              status: 200,
              headers: {
                "content-type": "application/json",
              },
            },
          );
        }

        return new Response(JSON.stringify({ result: true }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        });
      },
      session: {
        bearerToken: "backend-token",
      },
    });

    const result = await client.invites.accept(
      "https://www.popopo.com/ja/spaces/space-123/invites/invite-123",
    );

    expect(calls).toEqual([
      {
        url: "https://api.popopo.com/api/v2/invites/invite-123",
        method: "GET",
        body: "",
      },
      {
        url: "https://api.popopo.com/api/v2/spaces/space-123/users/me",
        method: "POST",
        body: JSON.stringify({ inviteKey: "invite-123" }),
      },
    ]);
    expect(result).toMatchObject({
      kind: "space",
      inviteKey: "invite-123",
      spaceKey: "space-123",
      response: { result: true },
    });
    expect(client.getSession()).toMatchObject({
      currentSpaceKey: "space-123",
    });
  });
});

describe("CoinsClient", () => {
  test("requests user-private-data from Firestore with a Bearer Firebase token", async () => {
    let seenUrl = "";
    let seenAuthorization = "";

    const client = new PopopoClient({
      fetch: async (input, init) => {
        seenUrl = String(input);
        seenAuthorization = new Headers(init?.headers).get("authorization") ?? "";

        return new Response(
          JSON.stringify({
            name: "projects/popopo-prod/databases/(default)/documents/user-privates/user-123",
            fields: {
              coinBalances: {
                mapValue: {
                  fields: {
                    paid: { integerValue: "12" },
                    free: { integerValue: "34" },
                  },
                },
              },
            },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      },
      session: {
        userId: "user-123",
        firebaseIdToken: "firebase-token",
      },
      firebase: {
        apiKey: "api-key",
        projectId: "popopo-prod",
      },
    });

    const result = await client.coins.getBalance();

    expect(seenUrl).toBe(
      "https://firestore.googleapis.com/v1/projects/popopo-prod/databases/(default)/documents/user-privates/user-123?key=api-key",
    );
    expect(seenAuthorization).toBe("Bearer firebase-token");
    expect(result.documentPath).toBe(
      "projects/popopo-prod/databases/(default)/documents/user-privates/user-123",
    );
    expect(result.coinBalances).toEqual({
      paid: 12,
      free: 34,
    });
    expect(result.paidCoins).toBe(12);
    expect(result.freeCoins).toBe(34);
  });

  test("normalizes array-style coin balances and falls back to session bearer token", async () => {
    const client = new PopopoClient({
      fetch: async () =>
        new Response(
          JSON.stringify({
            name: "projects/popopo-prod/databases/(default)/documents/user-privates/user-456",
            fields: {
              coinBalances: {
                arrayValue: {
                  values: [
                    {
                      mapValue: {
                        fields: {
                          scope: { stringValue: "paidCoins" },
                          amount: { integerValue: "99" },
                        },
                      },
                    },
                    {
                      mapValue: {
                        fields: {
                          scope: { stringValue: "freeCoins" },
                          amount: { integerValue: "7" },
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
              "content-type": "application/json",
            },
          },
        ),
      session: {
        userId: "user-456",
        bearerToken: "fallback-token",
      },
      firebase: {
        apiKey: "api-key",
        projectId: "popopo-prod",
      },
    });

    const result = await client.coins.getBalance();

    expect(result.coinBalances).toEqual({
      paidCoins: 99,
      freeCoins: 7,
    });
    expect(result.paidCoins).toBe(99);
    expect(result.freeCoins).toBe(7);
  });
});

describe("LivesClient", () => {
  test("starts a live and stores the live context in session", async () => {
    let seenUrl = "";
    let seenAuthorization = "";
    let seenBody = "";

    const client = new PopopoClient({
      fetch: async (input, init) => {
        seenUrl = String(input);
        seenAuthorization = new Headers(init?.headers).get("authorization") ?? "";
        seenBody = String(init?.body ?? "");

        return new Response(JSON.stringify({ id: "live-789" }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        });
      },
      session: {
        bearerToken: "backend-token",
      },
    });

    const result = await client.lives.start({
      spaceKey: "space-123",
      body: {
        genreId: "genre-1",
        tags: ["test"],
        canEnter: true,
      },
    });

    expect(seenUrl).toBe("https://api.popopo.com/api/v2/spaces/space-123/lives");
    expect(seenAuthorization).toBe("Bearer backend-token");
    expect(seenBody).toBe(
      JSON.stringify({
        genreId: "genre-1",
        tags: ["test"],
        canEnter: true,
      }),
    );
    expect(result).toEqual({ id: "live-789" });
    expect(client.getSession()).toMatchObject({
      currentSpaceKey: "space-123",
      currentLiveId: "live-789",
    });
  });

  test("posts live comments to the backend comment endpoint", async () => {
    let seenUrl = "";
    let seenAuthorization = "";
    let seenBody = "";

    const client = new PopopoClient({
      fetch: async (input, init) => {
        seenUrl = String(input);
        seenAuthorization = new Headers(init?.headers).get("authorization") ?? "";
        seenBody = String(init?.body ?? "");

        return new Response(JSON.stringify({ id: "comment-123" }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        });
      },
      session: {
        bearerToken: "firebase-id-token",
        currentSpaceKey: "space-123",
        currentLiveId: "live-456",
      },
    });

    const result = await client.lives.postComment({
      body: {
        kind: "text",
        value: "hello",
      },
    });

    expect(seenUrl).toBe(
      "https://api.popopo.com/api/v2/spaces/space-123/lives/live-456/comments",
    );
    expect(seenAuthorization).toBe("Bearer firebase-id-token");
    expect(seenBody).toBe(JSON.stringify({ kind: "text", value: "hello" }));
    expect(result).toEqual({ id: "comment-123" });
  });

  test("reads live comments from the Firestore comment collection", async () => {
    let seenUrl = "";
    let seenAuthorization = "";

    const client = new PopopoClient({
      fetch: async (input, init) => {
        seenUrl = String(input);
        seenAuthorization = new Headers(init?.headers).get("authorization") ?? "";

        return new Response(
          JSON.stringify({
            documents: [
              {
                name:
                  "projects/popopo-prod/databases/(default)/documents/spaces/space-123/lives/live-456/comments/comment-789",
                fields: {
                  kind: { stringValue: "text" },
                  value: { stringValue: "hello world" },
                  created_at: { integerValue: "123" },
                  user: {
                    mapValue: {
                      fields: {
                        id: { stringValue: "user-1" },
                        name: { stringValue: "alice" },
                      },
                    },
                  },
                },
              },
            ],
            nextPageToken: "next-page",
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      },
      session: {
        firebaseIdToken: "firebase-token",
        currentSpaceKey: "space-123",
        currentLiveId: "live-456",
      },
      firebase: {
        apiKey: "api-key",
        projectId: "popopo-prod",
      },
    });

    const result = await client.lives.listComments({
      options: {
        limit: 5,
        orderBy: "created_at desc",
      },
    });

    expect(seenUrl).toBe(
      "https://firestore.googleapis.com/v1/projects/popopo-prod/databases/(default)/documents/spaces/space-123/lives/live-456/comments?key=api-key&pageSize=5&orderBy=created_at+desc",
    );
    expect(seenAuthorization).toBe("Bearer firebase-token");
    expect(result.nextPageToken).toBe("next-page");
    expect(result.comments).toHaveLength(1);
    expect(result.comments[0]).toMatchObject({
      id: "comment-789",
      kind: "text",
      value: "hello world",
      createdAt: 123,
      user: {
        id: "user-1",
        name: "alice",
      },
    });
  });

  test("collects receive info from Firestore and decodes Tencent compact tokens", async () => {
    const userSig =
      "eJw1zUEOgjAUBNC7-LUhbQkUmrhAd0AkilG21Bb5IqQiImK8uxF1*2Yy84RtnFqodNNhgboFAVFfGfdcLR9JKQt-hWF4V3snOykjGcym-lVVuTGoQAAjhLmU01-SYa1BUM5tjzmUeF-Vg8H24x75Qj89MYv8B-EIAhbcN2njB02UHXbIPCkz2QejKXO6ubhquI0qUU4do72ew*sN8G04ow__";
    const privateMapKey =
      "eJw1j8tygkAURP9ltklZwxDkUcUCEU2hQOQRDbuB4TGA1oQBUVL59xRoetV9*i5u-4BwHywoyS4dzWnWAg3srjVbNrV598okV11q2wM5SqeKsASB1-mekxozRgnQAIIQLQVZeDYdPWdAE2RZVJAkQOVBsxuj7cQV*AA9z9qkz4EGjIORBmLcpuuYY*hKISppXDUejtiOIP-kfpbf8fuKOoV1q0duTMIJ68zJfChzNlb*OmxK06-cfdRYEIvREDer4Svig1Po*vO36zwPLeD-CloADaTBeNgabxFXXlRO6uS*GatNoNrbs4ktNU2O9CJ3lt27nqOD3z8aEV4q";
    const calls: string[] = [];

    const client = new PopopoClient({
      fetch: async (input, init) => {
        const url = String(input);
        calls.push(url);

        if (url.includes("/connection-info")) {
          return new Response(JSON.stringify({ userSig, privateMapKey }), {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          });
        }

        if (url.includes("/documents/spaces/space-123/lives/live-456")) {
          expect(new Headers(init?.headers).get("authorization")).toBe("Bearer firebase-token");

          return new Response(
            JSON.stringify({
              name:
                "projects/popopo-prod/databases/(default)/documents/spaces/space-123/lives/live-456",
              fields: {
                stream_name: { stringValue: "space-123_live-456_stream-token" },
                token: { stringValue: "stream-token" },
                task_id: { stringValue: "task-123" },
                status: { stringValue: "started" },
              },
            }),
            {
              status: 200,
              headers: {
                "content-type": "application/json",
              },
            },
          );
        }

        throw new Error(`Unexpected request: ${url}`);
      },
      session: {
        bearerToken: "backend-token",
        firebaseIdToken: "firebase-token",
        currentSpaceKey: "space-123",
        currentLiveId: "live-456",
      },
      firebase: {
        apiKey: "api-key",
        projectId: "popopo-prod",
      },
    });

    const result = await client.lives.getReceiveInfo();

    expect(calls).toEqual([
      "https://firestore.googleapis.com/v1/projects/popopo-prod/databases/(default)/documents/spaces/space-123/lives/live-456?key=api-key",
      "https://api.popopo.com/api/v2/spaces/space-123/connection-info",
    ]);
    expect(result).toMatchObject({
      spaceKey: "space-123",
      liveId: "live-456",
      streamName: "space-123_live-456_stream-token",
      liveToken: "stream-token",
      taskId: "task-123",
      liveStatus: "started",
      sdkAppId: 20026171,
      userId: "Kvkp6lkCyOhbf9NiJJwdW5Xjdpb2",
      userSig,
      privateMapKey,
      trtcPlayUrl:
        "trtc://cloud.tencent.com/play/space-123_live-456_stream-token?sdkappid=20026171&userId=Kvkp6lkCyOhbf9NiJJwdW5Xjdpb2&usersig=" +
        encodeURIComponent(userSig).replace(/%2A/g, "*") +
        "&appscene=live",
    });
    expect(result.decodedUserSig).toMatchObject({
      "TLS.identifier": "Kvkp6lkCyOhbf9NiJJwdW5Xjdpb2",
      "TLS.sdkappid": "20026171",
    });
    expect(result.decodedPrivateMapKey).toMatchObject({
      "TLS.sdkappid": "20026171",
      "TLS.userbuf": expect.any(String),
    });
  });
});

describe("NotificationsClient", () => {
  test("reads system notifications from Firestore and filters non-public entries", async () => {
    let seenUrl = "";
    let seenAuthorization = "";

    const client = new PopopoClient({
      fetch: async (input, init) => {
        seenUrl = String(input);
        seenAuthorization = new Headers(init?.headers).get("authorization") ?? "";

        return new Response(
          JSON.stringify({
            documents: [
              {
                name:
                  "projects/popopo-prod/databases/(default)/documents/system-notifications/sn-public",
                fields: {
                  title: { stringValue: "public title" },
                  body: { stringValue: "public body" },
                  status: { stringValue: "public" },
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
                        start_at: { integerValue: "1700000000" },
                      },
                    },
                  },
                },
              },
              {
                name:
                  "projects/popopo-prod/databases/(default)/documents/system-notifications/sn-private",
                fields: {
                  title: { stringValue: "private title" },
                  status: { stringValue: "private" },
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
                name:
                  "projects/popopo-prod/databases/(default)/documents/system-notifications/sn-inactive",
                fields: {
                  title: { stringValue: "inactive title" },
                  status: { stringValue: "public" },
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
              "content-type": "application/json",
            },
          },
        );
      },
      session: {
        firebaseIdToken: "firebase-token",
      },
      firebase: {
        apiKey: "api-key",
        projectId: "popopo-prod",
      },
    });

    const result = await client.notifications.list();

    expect(seenUrl).toBe(
      "https://firestore.googleapis.com/v1/projects/popopo-prod/databases/(default)/documents/system-notifications?key=api-key&pageSize=20&orderBy=display_period.start_at+desc",
    );
    expect(seenAuthorization).toBe("Bearer firebase-token");
    expect(result).toEqual([
      expect.objectContaining({
        id: "sn-public",
        systemNotificationId: "sn-public",
        title: "public title",
        body: "public body",
        status: "public",
        displayPeriodStartAt: 1700000000,
      }),
    ]);
  });

  test("reads personal notifications from the user Firestore collection", async () => {
    let seenUrl = "";
    let seenAuthorization = "";

    const client = new PopopoClient({
      fetch: async (input, init) => {
        seenUrl = String(input);
        seenAuthorization = new Headers(init?.headers).get("authorization") ?? "";

        return new Response(
          JSON.stringify({
            documents: [
              {
                name:
                  "projects/popopo-prod/databases/(default)/documents/users/user-123/personal-notifications/pn-123",
                fields: {
                  title: { stringValue: "personal title" },
                  body: { stringValue: "personal body" },
                  kind: { stringValue: "campaign" },
                  is_read: { booleanValue: false },
                  created_at: { integerValue: "1700000100" },
                  image_url: { stringValue: "https://example.com/image.png" },
                  thumbnail_url: { stringValue: "https://example.com/thumb.png" },
                  transition_url: { stringValue: "popopo://notifications/pn-123" },
                },
              },
            ],
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      },
      session: {
        userId: "user-123",
        firebaseIdToken: "firebase-token",
      },
      firebase: {
        apiKey: "api-key",
        projectId: "popopo-prod",
      },
    });

    const result = await client.notifications.listPersonal();

    expect(seenUrl).toBe(
      "https://firestore.googleapis.com/v1/projects/popopo-prod/databases/(default)/documents/users/user-123/personal-notifications?key=api-key&pageSize=20&orderBy=created_at+desc",
    );
    expect(seenAuthorization).toBe("Bearer firebase-token");
    expect(result).toEqual([
      expect.objectContaining({
        id: "pn-123",
        personalNotificationId: "pn-123",
        title: "personal title",
        body: "personal body",
        kind: "campaign",
        read: false,
        createdAt: 1700000100,
        imageUrl: "https://example.com/image.png",
        thumbnailUrl: "https://example.com/thumb.png",
        transitionUrl: "popopo://notifications/pn-123",
      }),
    ]);
  });

  test("reads a personal notification document from Firestore", async () => {
    let seenUrl = "";
    let seenAuthorization = "";

    const client = new PopopoClient({
      fetch: async (input, init) => {
        seenUrl = String(input);
        seenAuthorization = new Headers(init?.headers).get("authorization") ?? "";

        return new Response(
          JSON.stringify({
            name:
              "projects/popopo-prod/databases/(default)/documents/users/user-123/personal-notifications/pn-456",
            fields: {
              title: { stringValue: "detail title" },
              body: { stringValue: "detail body" },
              is_read: { booleanValue: true },
              read_at: { timestampValue: "2026-03-18T00:00:00Z" },
            },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      },
      session: {
        userId: "user-123",
        firebaseIdToken: "firebase-token",
      },
      firebase: {
        apiKey: "api-key",
        projectId: "popopo-prod",
      },
    });

    const result = await client.notifications.getPersonalById("pn-456");

    expect(seenUrl).toBe(
      "https://firestore.googleapis.com/v1/projects/popopo-prod/databases/(default)/documents/users/user-123/personal-notifications/pn-456?key=api-key",
    );
    expect(seenAuthorization).toBe("Bearer firebase-token");
    expect(result).toMatchObject({
      id: "pn-456",
      personalNotificationId: "pn-456",
      title: "detail title",
      body: "detail body",
      read: true,
      readAt: "2026-03-18T00:00:00Z",
    });
  });

  test("receives personal notification delivery content with PUT and received status", async () => {
    let seenUrl = "";
    let seenMethod = "";
    let seenBody = "";

    const client = new PopopoClient({
      fetch: async (input, init) => {
        seenUrl = String(input);
        seenMethod = init?.method ?? "";
        seenBody = String(init?.body ?? "");

        return new Response(
          JSON.stringify({
            title: "detail title",
            body: "detail body",
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      },
      session: {
        bearerToken: "backend-token",
      },
    });

    const result = await client.notifications.receivePersonalDeliveryContent(
      "pn-123",
      { status: "received" },
    );

    expect(seenUrl).toBe(
      "https://api.popopo.com/api/v2/personal-notifications/pn-123/delivery-content",
    );
    expect(seenMethod).toBe("PUT");
    expect(seenBody).toBe(JSON.stringify({ status: "received" }));
    expect(result).toEqual({
      title: "detail title",
      body: "detail body",
    });
  });
});

describe("PushClient", () => {
  test("upserts a push device with PUT", async () => {
    let seenUrl = "";
    let seenMethod = "";
    let seenAuthorization = "";
    let seenBody = "";

    const client = new PopopoClient({
      fetch: async (input, init) => {
        seenUrl = String(input);
        seenMethod = String(init?.method ?? "");
        seenAuthorization = new Headers(init?.headers).get("authorization") ?? "";
        seenBody = String(init?.body ?? "");

        return new Response(JSON.stringify({ result: true }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        });
      },
      session: {
        bearerToken: "backend-token",
      },
    });

    const result = await client.push.upsertDevice("device-123", {
      deviceName: "uset",
      system: "android",
      app: "popopo",
    });

    expect(seenUrl).toBe("https://api.popopo.com/api/v2/push/devices/device-123");
    expect(seenMethod).toBe("PUT");
    expect(seenAuthorization).toBe("Bearer backend-token");
    expect(seenBody).toBe(
      JSON.stringify({
        deviceName: "uset",
        system: "android",
        app: "popopo",
      }),
    );
    expect(result).toEqual({ result: true });
  });
});

describe("CallsClient", () => {
  test("creates a live-follower call push", async () => {
    let seenUrl = "";
    let seenMethod = "";
    let seenAuthorization = "";
    let seenBody = "";

    const client = new PopopoClient({
      fetch: async (input, init) => {
        seenUrl = String(input);
        seenMethod = String(init?.method ?? "");
        seenAuthorization = new Headers(init?.headers).get("authorization") ?? "";
        seenBody = String(init?.body ?? "");

        return new Response(JSON.stringify({ pushId: "push-123" }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        });
      },
      session: {
        bearerToken: "backend-token",
      },
    });

    const result = await client.calls.createPush({
      kind: "live-follower-call",
      spaceKey: "space-123",
      liveId: "live-456",
    });

    expect(seenUrl).toBe("https://api.popopo.com/api/v2/push/call-pushes");
    expect(seenMethod).toBe("POST");
    expect(seenAuthorization).toBe("Bearer backend-token");
    expect(seenBody).toBe(
      JSON.stringify({
        kind: "live-follower-call",
        spaceKey: "space-123",
        liveId: "live-456",
      }),
    );
    expect(result).toEqual({ pushId: "push-123" });
  });
});

describe("SpacesClient", () => {
  test("creates a space through the backend API", async () => {
    let seenUrl = "";
    let seenBody = "";

    const client = new PopopoClient({
      fetch: async (input, init) => {
        seenUrl = String(input);
        seenBody = String(init?.body ?? "");

        return new Response(JSON.stringify({ spaceKey: "space-123" }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        });
      },
      session: {
        bearerToken: "backend-token",
      },
    });

    const result = await client.spaces.create({
      name: "test-space",
      backgroundId: "bg-1",
    });

    expect(seenUrl).toBe("https://api.popopo.com/api/v2/spaces");
    expect(seenBody).toBe(JSON.stringify({ name: "test-space", backgroundId: "bg-1" }));
    expect(result).toEqual({ spaceKey: "space-123" });
  });

  test("connects a space and stores the current space in session", async () => {
    const seenUrls: string[] = [];

    const client = new PopopoClient({
      fetch: async (input) => {
        const url = String(input);
        seenUrls.push(url);

        if (url.endsWith("/connection-info")) {
          return new Response(JSON.stringify({ userSig: "sig" }), {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          });
        }

        return new Response(JSON.stringify({ result: true }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        });
      },
      session: {
        bearerToken: "backend-token",
      },
    });

    const result = await client.spaces.connect("space-123", { muted: false });

    expect(seenUrls).toEqual([
      "https://api.popopo.com/api/v2/spaces/space-123/connection-info",
      "https://api.popopo.com/api/v2/spaces/space-123/users/me/connection",
    ]);
    expect(result).toMatchObject({
      spaceKey: "space-123",
      muted: false,
      connectionInfo: { userSig: "sig" },
      connection: { result: true },
    });
    expect(client.getSession()).toMatchObject({
      currentSpaceKey: "space-123",
    });
  });

  test("posts and reads space messages", async () => {
    const calls: Array<{ url: string; authorization: string; body: string }> = [];

    const client = new PopopoClient({
      fetch: async (input, init) => {
        const url = String(input);
        const authorization = new Headers(init?.headers).get("authorization") ?? "";
        const body = String(init?.body ?? "");
        calls.push({ url, authorization, body });

        if (url.includes("/api/v2/spaces/space-123/messages")) {
          return new Response(JSON.stringify({ result: true }), {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          });
        }

        return new Response(
          JSON.stringify({
            documents: [
              {
                name:
                  "projects/popopo-prod/databases/(default)/documents/spaces/space-123/space-messages/message-456",
                fields: {
                  kind: { stringValue: "text" },
                  value: { stringValue: "hello space" },
                  created_at: { integerValue: "321" },
                  user: {
                    mapValue: {
                      fields: {
                        id: { stringValue: "user-1" },
                        alias: { stringValue: "alice" },
                      },
                    },
                  },
                },
              },
            ],
            nextPageToken: "next-page",
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      },
      session: {
        bearerToken: "backend-token",
        firebaseIdToken: "firebase-token",
      },
      firebase: {
        apiKey: "api-key",
        projectId: "popopo-prod",
      },
    });

    const postResult = await client.spaces.postMessage("space-123", {
      kind: "text",
      value: "hello space",
    });
    const listResult = await client.spaces.listMessages("space-123", {
      limit: 5,
      orderBy: "created_at desc",
    });

    expect(postResult).toEqual({ result: true });
    expect(listResult.nextPageToken).toBe("next-page");
    expect(listResult.messages[0]).toMatchObject({
      id: "message-456",
      kind: "text",
      value: "hello space",
      createdAt: 321,
      user: {
        id: "user-1",
        alias: "alice",
      },
    });
    expect(calls).toEqual([
      {
        url: "https://api.popopo.com/api/v2/spaces/space-123/messages",
        authorization: "Bearer backend-token",
        body: JSON.stringify({ kind: "text", value: "hello space" }),
      },
      {
        url: "https://firestore.googleapis.com/v1/projects/popopo-prod/databases/(default)/documents/spaces/space-123/space-messages?key=api-key&pageSize=5&orderBy=created_at+desc",
        authorization: "Bearer firebase-token",
        body: "",
      },
    ]);
  });
});
