import {
  createDefaultEndpoints,
  mergeEndpoints,
  type PopopoEndpointSet,
} from "./endpoints.ts";
import { PopopoApiError, PopopoConfigurationError } from "./errors.ts";
import { HttpClient, type FetchLike, type RequestQuery } from "./http.ts";
import { inflateSync } from "node:zlib";
import type {
  AccountRegisterResult,
  AccountProfilePatch,
  AuthState,
  CallPushCreateRequest,
  CallPushCreateResult,
  LiveComment,
  LiveCommentCreateRequest,
  LiveCommentListOptions,
  LiveCommentListResult,
  LiveAudioStream,
  LiveEnterResult,
  LiveReceiveInfo,
  LiveStartRequest,
  LiveStartResult,
  DeepPartial,
  FirebaseAccountInfo,
  FirebaseAnonymousSignInRequest,
  FirebaseAuthSession,
  FirebaseClientConfig,
  FirebaseCustomTokenSignInRequest,
  FirebaseIdpCredentialInput,
  FirebaseIdpLinkRequest,
  FirebaseIdpLinkResult,
  FirebaseEmailPasswordSignInRequest,
  FirebaseEmailPasswordSignUpRequest,
  FirebaseIdpSignInRequest,
  FirebaseLookupResponse,
  FirebaseFlutterCredentialRequest,
  FirebasePhoneAuthResult,
  FirebasePhoneLinkRequest,
  FirebasePhoneVerificationEvent,
  FirebasePhoneVerificationCodeRequest,
  FirebasePhoneVerificationSession,
  FirebaseProfileUpdateRequest,
  FirebaseSendOobCodeRequest,
  FirebaseTokenRefreshResponse,
  FirebaseVerifyPhoneNumberRequest,
  FirestoreDocument,
  HomeDisplaySpace,
  HomeDisplaySpacesRequest,
  HomeDisplaySpacesResponse,
  Invite,
  InviteAcceptResult,
  LiveListItem,
  NameplateNormalDisplayedMessage,
  NameplateSpecialDisplayedMessage,
  NotificationItem,
  PersonalNotificationData,
  PersonalNotificationDeliveryContent,
  OwnerUserIdChangeRequest,
  PushDeviceUpsertRequest,
  PushDeviceUpsertResult,
  ReceivePersonalNotificationDeliveryContentRequest,
  SceneLoadRequest,
  SequencePlayStartRequest,
  SequenceRecordingStartRequest,
  Space,
  SpaceConnectResult,
  SpaceConnectionRequest,
  SpaceCreateRequest,
  SpaceCreateResult,
  SpaceLiveListRequest,
  SpaceMessage,
  SpaceMessageCreateRequest,
  SpaceMessageListOptions,
  SpaceMessageListResult,
  TsoAuthorizationCodeRequest,
  TsoClientConfig,
  TsoFileFetchOptions,
  TsoFileStatusOptions,
  TencentTlsCompactToken,
  TsoOAuthTokenResponse,
  TsoRefreshTokenRequest,
  UserPrivateData,
  UserAnotherNameChangeRequest,
  UserDisplayNameChangeRequest,
  UserIconSourceChangeRequest,
  UserProfile,
  CoinBalanceSnapshot,
} from "./types.ts";

export const DEFAULT_POPOPO_BASE_URL = "https://www.popopo.com";
export const DEFAULT_POPOPO_API_BASE_URL = "https://api.popopo.com";
export const DEFAULT_FIRESTORE_BASE_URL = "https://firestore.googleapis.com/v1";
export const DEFAULT_FIREBASE_API_KEY = "AIzaSyAmY4T-_U3IGS_TvD5ERQsr2HQsHUmaapc";
export const DEFAULT_FIREBASE_APP_ID =
  "1:209007912111:android:a92e14f304f77c0c33e05a";
export const DEFAULT_FIREBASE_AUTH_DOMAIN = "popopo.firebaseapp.com";
export const DEFAULT_FIREBASE_PROJECT_ID = "popopo-prod";
export const DEFAULT_FIREBASE_STORAGE_BUCKET = "popopo-prod.firebasestorage.app";
export const DEFAULT_FIREBASE_WEB_CLIENT_ID =
  "209007912111-eh2o06rp2h47lq89iheluudr53ena8o8.apps.googleusercontent.com";
export const DEFAULT_FIREBASE_AUTH_BASE_URL =
  "https://www.googleapis.com/identitytoolkit/v3/relyingparty";
export const DEFAULT_FIREBASE_SECURE_TOKEN_BASE_URL =
  "https://securetoken.googleapis.com/v1";
export const DEFAULT_TSO_OAUTH_BASE_URL = "https://oauth.dev.seed.virtualcast.jp";
const DEFAULT_FIREBASE_ANDROID_CLIENT_TYPE = "CLIENT_TYPE_ANDROID";
const DEFAULT_FIREBASE_RECAPTCHA_VERSION = "RECAPTCHA_ENTERPRISE";
export const DEFAULT_TENCENT_SDK_APP_ID = 20026171;
const DEFAULT_TENCENT_TRTC_PLAY_HOST = "cloud.tencent.com";
const DEFAULT_TENCENT_TRTC_PLAY_APP_SCENE = "live";
export const DEFAULT_TENCENT_LIVE_PLAY_HOST = "play.live-t.popopo.com";
const DEFAULT_TENCENT_LIVE_PLAY_PATH = "live";

export const DEFAULT_FIREBASE_CONFIG: FirebaseClientConfig = {
  apiKey: DEFAULT_FIREBASE_API_KEY,
  appId: DEFAULT_FIREBASE_APP_ID,
  authBaseUrl: DEFAULT_FIREBASE_AUTH_BASE_URL,
  authDomain: DEFAULT_FIREBASE_AUTH_DOMAIN,
  firestoreBaseUrl: DEFAULT_FIRESTORE_BASE_URL,
  projectId: DEFAULT_FIREBASE_PROJECT_ID,
  secureTokenBaseUrl: DEFAULT_FIREBASE_SECURE_TOKEN_BASE_URL,
  storageBucket: DEFAULT_FIREBASE_STORAGE_BUCKET,
  webClientId: DEFAULT_FIREBASE_WEB_CLIENT_ID,
  returnSecureToken: true,
};

export interface PopopoClientOptions {
  baseUrl?: string;
  apiBaseUrl?: string;
  apiBasePath?: string;
  fetch?: FetchLike;
  headers?: HeadersInit;
  session?: AuthState;
  firebase?: Partial<FirebaseClientConfig>;
  tso?: Partial<TsoClientConfig>;
  endpoints?: DeepPartial<PopopoEndpointSet>;
}

interface ResolvedClientOptions {
  baseUrl: string;
  apiBaseUrl: string;
  apiBasePath: string;
  firebase: FirebaseClientConfig;
  tso: TsoClientConfig;
}

interface ClientRuntime {
  readonly http: HttpClient;
  readonly endpoints: PopopoEndpointSet;
  readonly options: ResolvedClientOptions;
}

export class PopopoClient {
  readonly http: HttpClient;
  readonly auth: FirebaseAuthClient;
  readonly accounts: AccountsClient;
  readonly spaces: SpacesClient;
  readonly lives: LivesClient;
  readonly push: PushClient;
  readonly calls: CallsClient;
  readonly coins: CoinsClient;
  readonly invites: InvitesClient;
  readonly notifications: NotificationsClient;
  readonly scenes: ScenesClient;
  readonly sequences: SequencesClient;
  readonly nameplates: NameplatesClient;
  readonly tso: TsoClient;
  readonly endpoints: PopopoEndpointSet;

  private readonly runtime: ClientRuntime;

  constructor(options: PopopoClientOptions = {}) {
    const resolved = resolveClientOptions(options);
    const session: AuthState = { ...(options.session ?? {}) };
    const endpoints = mergeEndpoints(
      createDefaultEndpoints(resolved.apiBasePath),
      options.endpoints,
    );
    const http = new HttpClient({
      baseUrl: resolved.baseUrl,
      session,
      fetchImplementation: options.fetch,
      defaultHeaders: options.headers,
    });

    this.runtime = {
      http,
      endpoints,
      options: resolved,
    };
    this.http = http;
    this.endpoints = endpoints;
    this.auth = new FirebaseAuthClient(this.runtime);
    this.accounts = new AccountsClient(this.runtime);
    this.spaces = new SpacesClient(this.runtime);
    this.lives = new LivesClient(this.runtime);
    this.push = new PushClient(this.runtime);
    this.calls = new CallsClient(this.runtime);
    this.coins = new CoinsClient(this.runtime);
    this.invites = new InvitesClient(this.runtime);
    this.notifications = new NotificationsClient(this.runtime);
    this.scenes = new ScenesClient(this.runtime);
    this.sequences = new SequencesClient(this.runtime);
    this.nameplates = new NameplatesClient(this.runtime);
    this.tso = new TsoClient(this.runtime);
  }

  getSession(): Readonly<AuthState> {
    return this.http.getSession();
  }

  setSession(session: Partial<AuthState>): AuthState {
    return this.http.setSession(session);
  }

  clearSession(): AuthState {
    return this.http.clearSession();
  }
}

export class FirebaseAuthClient {
  constructor(private readonly runtime: ClientRuntime) {}

  async signInAnonymously(
    input: FirebaseAnonymousSignInRequest = {},
  ): Promise<FirebaseAuthSession> {
    const payload = await this.runtime.http.request<Record<string, unknown>>({
      method: "POST",
      url: buildFirebaseUrl(
        this.runtime.options.firebase.authBaseUrl,
        "signupNewUser",
      ),
      auth: "none",
      query: {
        key: this.runtime.options.firebase.apiKey,
      },
      body: withAndroidClientInfo(
        compactObject({
          tenantId: this.runtime.options.firebase.tenantId,
        }),
      ),
    });
    const session = toFirebaseSession(payload);

    if (input.persistSession !== false) {
      applyFirebaseSession(this.runtime.http, session);
    }

    return session;
  }

  async signUpWithEmailPassword(
    input: FirebaseEmailPasswordSignUpRequest,
  ): Promise<FirebaseAuthSession> {
    const payload = await this.runtime.http.request<Record<string, unknown>>({
      method: "POST",
      url: buildFirebaseUrl(
        this.runtime.options.firebase.authBaseUrl,
        "signupNewUser",
      ),
      auth: "none",
      query: {
        key: this.runtime.options.firebase.apiKey,
      },
      body: withAndroidClientInfo(
        compactObject({
          email: input.email,
          password: input.password,
          tenantId: this.runtime.options.firebase.tenantId,
        }),
        input.captchaResponse,
        input.clientType,
        input.recaptchaVersion,
      ),
    });
    const session = toFirebaseSession(payload);

    if (input.persistSession !== false) {
      applyFirebaseSession(this.runtime.http, session);
    }

    if (input.displayName) {
      return this.updateProfile({
        idToken: session.idToken,
        displayName: input.displayName,
        returnSecureToken: true,
        persistSession: input.persistSession,
      });
    }

    return session;
  }

  async signInWithEmailPassword(
    input: FirebaseEmailPasswordSignInRequest,
  ): Promise<FirebaseAuthSession> {
    const payload = await this.runtime.http.request<Record<string, unknown>>({
      method: "POST",
      url: buildFirebaseUrl(
        this.runtime.options.firebase.authBaseUrl,
        "verifyPassword",
      ),
      auth: "none",
      query: {
        key: this.runtime.options.firebase.apiKey,
      },
      body: withAndroidClientInfo(
        compactObject({
          email: input.email,
          password: input.password,
          returnSecureToken: this.runtime.options.firebase.returnSecureToken,
          tenantId: this.runtime.options.firebase.tenantId,
        }),
        input.captchaResponse,
        input.clientType,
        input.recaptchaVersion,
      ),
    });
    const session = toFirebaseSession(payload);

    if (input.persistSession !== false) {
      applyFirebaseSession(this.runtime.http, session);
    }

    return session;
  }

  async signInWithCustomToken(
    input: FirebaseCustomTokenSignInRequest,
  ): Promise<FirebaseAuthSession> {
    const payload = await this.runtime.http.request<Record<string, unknown>>({
      method: "POST",
      url: buildFirebaseUrl(
        this.runtime.options.firebase.authBaseUrl,
        "verifyCustomToken",
      ),
      auth: "none",
      query: {
        key: this.runtime.options.firebase.apiKey,
      },
      body: compactObject({
        token: input.token,
        returnSecureToken: this.runtime.options.firebase.returnSecureToken,
        tenantId: this.runtime.options.firebase.tenantId,
      }),
    });
    const session = toFirebaseSession(payload);

    if (input.persistSession !== false) {
      applyFirebaseSession(this.runtime.http, session);
    }

    return session;
  }

  async signInWithIdp(
    input: FirebaseIdpSignInRequest,
  ): Promise<FirebaseAuthSession> {
    const payload = await this.runtime.http.request<Record<string, unknown>>({
      method: "POST",
      url: buildFirebaseUrl(
        this.runtime.options.firebase.authBaseUrl,
        "verifyAssertion",
      ),
      auth: "none",
      query: {
        key: this.runtime.options.firebase.apiKey,
      },
      body: compactObject({
        requestUri:
          input.requestUri ??
          "http://localhost",
        postBody: input.postBody,
        returnSecureToken:
          input.returnSecureToken ?? this.runtime.options.firebase.returnSecureToken,
        returnIdpCredential: input.returnIdpCredential,
        autoCreate: input.autoCreate,
        idToken: input.idToken,
        pendingToken: input.pendingToken,
        sessionId: input.sessionId,
        captchaResponse: input.captchaResponse,
        tenantId: input.tenantId ?? this.runtime.options.firebase.tenantId,
      }),
    });
    const session = toFirebaseSession(payload);

    if (input.persistSession !== false) {
      applyFirebaseSession(this.runtime.http, session);
    }

    return session;
  }

  async signInWithCredential(
    input: FirebaseFlutterCredentialRequest,
  ): Promise<FirebaseAuthSession | FirebasePhoneAuthResult | FirebaseIdpLinkResult> {
    if (input.token !== undefined) {
      throw new PopopoConfigurationError(
        "Native credential token reuse is not supported in this CLI. Pass the credential fields explicitly.",
      );
    }

    switch (input.signInMethod) {
      case "google.com":
        return this.signInWithIdp({
          postBody: buildIdpPostBody({
            providerId: "google.com",
            oauthIdToken: input.idToken,
            oauthAccessToken: input.accessToken,
          }),
          requestUri: "http://localhost",
          persistSession: input.persistSession,
        });
      case "facebook.com":
        return this.signInWithIdp({
          postBody: buildIdpPostBody({
            providerId: "facebook.com",
            oauthAccessToken: requireDefined(input.accessToken, "accessToken"),
          }),
          requestUri: "http://localhost",
          persistSession: input.persistSession,
        });
      case "github.com":
        return this.signInWithIdp({
          postBody: buildIdpPostBody({
            providerId: "github.com",
            oauthAccessToken: requireDefined(input.accessToken, "accessToken"),
          }),
          requestUri: "http://localhost",
          persistSession: input.persistSession,
        });
      case "twitter.com":
        return this.signInWithIdp({
          postBody: buildIdpPostBody({
            providerId: "twitter.com",
            oauthAccessToken: requireDefined(input.accessToken, "accessToken"),
            oauthTokenSecret: requireDefined(input.secret, "secret"),
          }),
          requestUri: "http://localhost",
          persistSession: input.persistSession,
        });
      case "playgames.google.com":
        return this.signInWithIdp({
          postBody: buildIdpPostBody({
            providerId: "playgames.google.com",
            authCode: requireDefined(input.serverAuthCode, "serverAuthCode"),
          }),
          requestUri: "http://localhost",
          persistSession: input.persistSession,
        });
      case "oauth":
        return this.signInWithIdp({
          postBody: buildIdpPostBody({
            providerId: requireDefined(input.providerId, "providerId"),
            oauthIdToken: input.idToken,
            oauthAccessToken: input.accessToken,
            nonce: input.rawNonce,
          }),
          requestUri: "http://localhost",
          persistSession: input.persistSession,
        });
      case "phone":
        return this.signInWithPhoneNumber({
          sessionInfo: requireDefined(input.verificationId, "verificationId"),
          code: requireDefined(input.smsCode, "smsCode"),
          persistSession: input.persistSession,
        });
      case "password":
        return this.signInWithEmailPassword({
          email: requireDefined(input.email, "email"),
          password: requireDefined(input.secret, "secret"),
          captchaResponse: input.captchaResponse,
          clientType: input.clientType,
          recaptchaVersion: input.recaptchaVersion,
          persistSession: input.persistSession,
        });
      case "emailLink":
        return this.signInWithEmailLink({
          email: requireDefined(input.email, "email"),
          emailLink: requireDefined(input.emailLink, "emailLink"),
          captchaResponse: input.captchaResponse,
          persistSession: input.persistSession,
        });
      default:
        throw new PopopoConfigurationError(
          `Unsupported signInMethod: ${(input as { signInMethod: string }).signInMethod}`,
        );
    }
  }

  async linkWithIdp(
    input: FirebaseIdpLinkRequest,
  ): Promise<FirebaseIdpLinkResult> {
    const idToken =
      input.idToken ??
      this.runtime.http.getSession().firebaseIdToken ??
      this.runtime.http.getSession().bearerToken;

    if (!idToken) {
      throw new PopopoConfigurationError("No Firebase ID token is available.");
    }

    const payload = await this.runtime.http.request<Record<string, unknown>>({
      method: "POST",
      url: buildFirebaseUrl(
        this.runtime.options.firebase.authBaseUrl,
        "verifyAssertion",
      ),
      auth: "none",
      query: {
        key: this.runtime.options.firebase.apiKey,
      },
      body: compactObject({
        requestUri: input.requestUri ?? "http://localhost",
        postBody: buildIdpPostBody(input),
        returnSecureToken:
          input.returnSecureToken ?? this.runtime.options.firebase.returnSecureToken,
        returnIdpCredential: input.returnIdpCredential,
        autoCreate: input.autoCreate,
        idToken,
        pendingToken: input.pendingToken,
        sessionId: input.sessionId,
        tenantId: input.tenantId ?? this.runtime.options.firebase.tenantId,
      }),
    });
    const result = toFirebaseIdpLinkResult(payload);

    if (result.session && input.persistSession !== false) {
      applyFirebaseSession(this.runtime.http, result.session);
    }

    return result;
  }

  async linkWithCredential(
    input: FirebaseFlutterCredentialRequest,
  ): Promise<FirebaseAuthSession | FirebasePhoneAuthResult | FirebaseIdpLinkResult> {
    if (input.token !== undefined) {
      throw new PopopoConfigurationError(
        "Native credential token reuse is not supported in this CLI. Pass the credential fields explicitly.",
      );
    }

    switch (input.signInMethod) {
      case "google.com":
        return this.linkWithIdp({
          providerId: "google.com",
          oauthIdToken: input.idToken,
          oauthAccessToken: input.accessToken,
          persistSession: input.persistSession,
        });
      case "facebook.com":
        return this.linkWithIdp({
          providerId: "facebook.com",
          oauthAccessToken: requireDefined(input.accessToken, "accessToken"),
          persistSession: input.persistSession,
        });
      case "github.com":
        return this.linkWithIdp({
          providerId: "github.com",
          oauthAccessToken: requireDefined(input.accessToken, "accessToken"),
          persistSession: input.persistSession,
        });
      case "twitter.com":
        return this.linkWithIdp({
          providerId: "twitter.com",
          oauthAccessToken: requireDefined(input.accessToken, "accessToken"),
          oauthTokenSecret: requireDefined(input.secret, "secret"),
          persistSession: input.persistSession,
        });
      case "playgames.google.com":
        return this.linkWithIdp({
          providerId: "playgames.google.com",
          authCode: requireDefined(input.serverAuthCode, "serverAuthCode"),
          persistSession: input.persistSession,
        });
      case "oauth":
        return this.linkWithIdp({
          providerId: requireDefined(input.providerId, "providerId"),
          oauthIdToken: input.idToken,
          oauthAccessToken: input.accessToken,
          nonce: input.rawNonce,
          persistSession: input.persistSession,
        });
      case "phone":
        return this.updatePhoneNumber({
          verificationId: requireDefined(input.verificationId, "verificationId"),
          verificationCode: requireDefined(input.smsCode, "smsCode"),
          persistSession: input.persistSession,
        });
      case "password":
        return this.linkWithEmailPassword({
          email: requireDefined(input.email, "email"),
          password: requireDefined(input.secret, "secret"),
          captchaResponse: input.captchaResponse,
          clientType: input.clientType,
          recaptchaVersion: input.recaptchaVersion,
          persistSession: input.persistSession,
        });
      case "emailLink":
        return this.linkWithEmailLink({
          email: requireDefined(input.email, "email"),
          emailLink: requireDefined(input.emailLink, "emailLink"),
          captchaResponse: input.captchaResponse,
          persistSession: input.persistSession,
        });
      default:
        throw new PopopoConfigurationError(
          `Unsupported signInMethod: ${(input as { signInMethod: string }).signInMethod}`,
        );
    }
  }

  async linkWithEmailPassword(input: {
    email: string;
    password: string;
    captchaResponse?: string;
    clientType?: string;
    recaptchaVersion?: string;
    persistSession?: boolean;
  }): Promise<FirebaseAuthSession> {
    const idToken =
      this.runtime.http.getSession().firebaseIdToken ??
      this.runtime.http.getSession().bearerToken;

    if (!idToken) {
      throw new PopopoConfigurationError("No Firebase ID token is available.");
    }

    const payload = await this.runtime.http.request<Record<string, unknown>>({
      method: "POST",
      url: buildFirebaseUrl(
        this.runtime.options.firebase.authBaseUrl,
        "signupNewUser",
      ),
      auth: "none",
      query: {
        key: this.runtime.options.firebase.apiKey,
      },
      body: withAndroidClientInfo(
        compactObject({
          email: input.email,
          password: input.password,
          tenantId: this.runtime.options.firebase.tenantId,
          idToken,
        }),
        input.captchaResponse,
        input.clientType,
        input.recaptchaVersion,
      ),
    });
    const session = toFirebaseSession(payload);

    if (input.persistSession !== false) {
      applyFirebaseSession(this.runtime.http, session);
    }

    return session;
  }

  async signInWithEmailLink(input: {
    email: string;
    emailLink: string;
    captchaResponse?: string;
    persistSession?: boolean;
  }): Promise<FirebaseAuthSession> {
    const payload = await this.runtime.http.request<Record<string, unknown>>({
      method: "POST",
      url: buildFirebaseUrl(
        this.runtime.options.firebase.authBaseUrl,
        "emailLinkSignin",
      ),
      auth: "none",
      query: {
        key: this.runtime.options.firebase.apiKey,
      },
      body: withAndroidClientInfo(
        compactObject(buildEmailLinkBody(input.email, input.emailLink)),
        input.captchaResponse,
      ),
    });
    const session = toFirebaseSession(payload);

    if (input.persistSession !== false) {
      applyFirebaseSession(this.runtime.http, session);
    }

    return session;
  }

  async linkWithEmailLink(input: {
    email: string;
    emailLink: string;
    captchaResponse?: string;
    persistSession?: boolean;
  }): Promise<FirebaseAuthSession> {
    const idToken =
      this.runtime.http.getSession().firebaseIdToken ??
      this.runtime.http.getSession().bearerToken;

    if (!idToken) {
      throw new PopopoConfigurationError("No Firebase ID token is available.");
    }

    const payload = await this.runtime.http.request<Record<string, unknown>>({
      method: "POST",
      url: buildFirebaseUrl(
        this.runtime.options.firebase.authBaseUrl,
        "emailLinkSignin",
      ),
      auth: "none",
      query: {
        key: this.runtime.options.firebase.apiKey,
      },
      body: withAndroidClientInfo(
        compactObject({
          ...buildEmailLinkBody(input.email, input.emailLink),
          idToken,
        }),
        input.captchaResponse,
      ),
    });
    const session = toFirebaseSession(payload);

    if (input.persistSession !== false) {
      applyFirebaseSession(this.runtime.http, session);
    }

    return session;
  }

  async sendPhoneVerificationCode(
    input: FirebasePhoneVerificationCodeRequest,
  ): Promise<FirebasePhoneVerificationSession> {
    const payload = await this.runtime.http.request<Record<string, unknown>>({
      method: "POST",
      url: buildFirebaseUrl(
        this.runtime.options.firebase.authBaseUrl,
        "sendVerificationCode",
      ),
      auth: "none",
      query: {
        key: this.runtime.options.firebase.apiKey,
      },
      body: withAndroidClientInfo(
        compactObject({
          phoneNumber: input.phoneNumber,
          tenantId: input.tenantId ?? this.runtime.options.firebase.tenantId,
          recaptchaToken: input.recaptchaToken,
          playIntegrityToken: input.playIntegrityToken,
          autoRetrievalInfo: input.appSignatureHash
            ? {
                appSignatureHash: input.appSignatureHash,
              }
            : undefined,
        }),
        input.captchaResponse,
        input.clientType,
        input.recaptchaVersion,
      ),
    });

    return toFirebasePhoneVerificationSession(payload);
  }

  async verifyPhoneNumber(
    input: FirebaseVerifyPhoneNumberRequest,
  ): Promise<FirebasePhoneVerificationEvent> {
    if (input.multiFactorSessionId || input.multiFactorInfoUid) {
      throw new PopopoConfigurationError(
        "MFA phone verification flow is not implemented in this CLI.",
      );
    }

    const session = await this.sendPhoneVerificationCode({
      phoneNumber: requireDefined(input.phoneNumber, "phoneNumber"),
      recaptchaToken: input.recaptchaToken,
      playIntegrityToken: input.playIntegrityToken,
      captchaResponse: input.captchaResponse,
      clientType: input.clientType,
      recaptchaVersion: input.recaptchaVersion,
      appSignatureHash: input.appSignatureHash,
      tenantId: input.tenantId,
    });

    return {
      name: "Auth#phoneCodeSent",
      verificationId: session.sessionInfo,
      forceResendingToken: input.forceResendingToken,
      raw: session.raw,
    };
  }

  async signInWithPhoneNumber(input: {
    sessionInfo?: string;
    code?: string;
    phoneNumber?: string;
    temporaryProof?: string;
    operation?: number;
    tenantId?: string;
    persistSession?: boolean;
  }): Promise<FirebasePhoneAuthResult> {
    const payload = await this.runtime.http.request<Record<string, unknown>>({
      method: "POST",
      url: buildFirebaseUrl(
        this.runtime.options.firebase.authBaseUrl,
        "verifyPhoneNumber",
      ),
      auth: "none",
      query: {
        key: this.runtime.options.firebase.apiKey,
      },
      body: compactObject({
        sessionInfo: input.sessionInfo,
        code: input.code,
        phoneNumber: input.phoneNumber,
        temporaryProof: input.temporaryProof,
        operation: input.operation,
        tenantId: input.tenantId ?? this.runtime.options.firebase.tenantId,
      }),
    });
    const result = toFirebasePhoneAuthResult(payload);

    if (result.session && input.persistSession !== false) {
      applyFirebaseSession(this.runtime.http, result.session);
    }

    return result;
  }

  async linkWithPhoneNumber(
    input: FirebasePhoneLinkRequest,
  ): Promise<FirebasePhoneAuthResult> {
    const idToken =
      input.idToken ??
      this.runtime.http.getSession().firebaseIdToken ??
      this.runtime.http.getSession().bearerToken;

    if (!idToken) {
      throw new PopopoConfigurationError("No Firebase ID token is available.");
    }

    const isSessionFlow = Boolean(input.sessionInfo || input.code);
    const isTemporaryProofFlow = Boolean(input.phoneNumber || input.temporaryProof);

    if (!isSessionFlow && !isTemporaryProofFlow) {
      throw new PopopoConfigurationError(
        "Phone linking requires --session-info and --code, or --phone-number and --temporary-proof.",
      );
    }

    const payload = await this.runtime.http.request<Record<string, unknown>>({
      method: "POST",
      url: buildFirebaseUrl(
        this.runtime.options.firebase.authBaseUrl,
        "verifyPhoneNumber",
      ),
      auth: "none",
      query: {
        key: this.runtime.options.firebase.apiKey,
      },
      body: compactObject({
        idToken,
        sessionInfo: input.sessionInfo,
        code: input.code,
        phoneNumber: input.phoneNumber,
        temporaryProof: input.temporaryProof,
        operation: input.operation,
        tenantId: input.tenantId ?? this.runtime.options.firebase.tenantId,
      }),
    });
    const result = toFirebasePhoneAuthResult(payload);

    if (result.session && input.persistSession !== false) {
      applyFirebaseSession(this.runtime.http, result.session);
    }

    return result;
  }

  async updatePhoneNumber(input: {
    verificationId: string;
    verificationCode: string;
    idToken?: string;
    persistSession?: boolean;
  }): Promise<FirebasePhoneAuthResult> {
    return this.linkWithPhoneNumber({
      idToken: input.idToken,
      sessionInfo: input.verificationId,
      code: input.verificationCode,
      persistSession: input.persistSession,
    });
  }

  async refreshFirebaseIdToken(
    refreshToken = this.runtime.http.getSession().refreshToken,
  ): Promise<FirebaseTokenRefreshResponse> {
    if (!refreshToken) {
      throw new PopopoConfigurationError("No Firebase refresh token is available.");
    }

    const payload = await this.runtime.http.request<Record<string, unknown>>({
      method: "POST",
      url: buildFirebaseUrl(
        this.runtime.options.firebase.secureTokenBaseUrl,
        "token",
      ),
      auth: "none",
      query: {
        key: this.runtime.options.firebase.apiKey,
      },
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
    const refreshed = toFirebaseRefreshResponse(payload);
    applyFirebaseRefresh(this.runtime.http, refreshed);
    return refreshed;
  }

  async lookup(
    idToken = this.runtime.http.getSession().firebaseIdToken ??
      this.runtime.http.getSession().bearerToken,
  ): Promise<FirebaseLookupResponse> {
    if (!idToken) {
      throw new PopopoConfigurationError("No Firebase ID token is available.");
    }

    const payload = await this.runtime.http.request<Record<string, unknown>>({
      method: "POST",
      url: buildFirebaseUrl(
        this.runtime.options.firebase.authBaseUrl,
        "getAccountInfo",
      ),
      auth: "none",
      query: {
        key: this.runtime.options.firebase.apiKey,
      },
      body: {
        idToken,
      },
    });

    return {
      kind: asOptionalString(payload.kind),
      users: Array.isArray(payload.users)
        ? (payload.users as FirebaseAccountInfo[])
        : undefined,
      raw: payload,
    };
  }

  async getCurrentUser(): Promise<FirebaseAccountInfo | undefined> {
    const lookup = await this.lookup();
    return lookup.users?.[0];
  }

  async updateProfile(
    input: FirebaseProfileUpdateRequest,
  ): Promise<FirebaseAuthSession> {
    const idToken =
      input.idToken ??
      this.runtime.http.getSession().firebaseIdToken ??
      this.runtime.http.getSession().bearerToken;

    if (!idToken) {
      throw new PopopoConfigurationError("No Firebase ID token is available.");
    }

    const payload = await this.runtime.http.request<Record<string, unknown>>({
      method: "POST",
      url: buildFirebaseUrl(
        this.runtime.options.firebase.authBaseUrl,
        "setAccountInfo",
      ),
      auth: "none",
      query: {
        key: this.runtime.options.firebase.apiKey,
      },
      body: {
        idToken,
        displayName: input.displayName,
        photoUrl: input.photoUrl,
        password: input.password,
        deleteAttribute: input.deleteAttribute,
        deleteProvider: input.deleteProvider,
        returnSecureToken:
          input.returnSecureToken ??
          this.runtime.options.firebase.returnSecureToken,
        tenantId: input.tenantId ?? this.runtime.options.firebase.tenantId,
      },
    });
    const session = toFirebaseSession(payload);

    if (input.persistSession !== false) {
      applyFirebaseSession(this.runtime.http, session);
    }

    return session;
  }

  sendOobCode(
    input: FirebaseSendOobCodeRequest,
  ): Promise<Record<string, unknown>> {
    return this.runtime.http.request<Record<string, unknown>>({
      method: "POST",
      url: buildFirebaseUrl(
        this.runtime.options.firebase.authBaseUrl,
        "getOobConfirmationCode",
      ),
      auth: "none",
      query: {
        key: this.runtime.options.firebase.apiKey,
      },
      body: {
        ...input,
        tenantId: input.tenantId ?? this.runtime.options.firebase.tenantId,
      },
    });
  }

  sendPasswordResetEmail(
    email: string,
    options: Omit<FirebaseSendOobCodeRequest, "email" | "requestType"> = {},
  ): Promise<Record<string, unknown>> {
    return this.sendOobCode({
      ...options,
      email,
      requestType: "PASSWORD_RESET",
    });
  }

  sendEmailVerification(
    idToken = this.runtime.http.getSession().firebaseIdToken ??
      this.runtime.http.getSession().bearerToken,
    options: Omit<FirebaseSendOobCodeRequest, "idToken" | "requestType"> = {},
  ): Promise<Record<string, unknown>> {
    if (!idToken) {
      throw new PopopoConfigurationError("No Firebase ID token is available.");
    }

    return this.sendOobCode({
      ...options,
      idToken,
      requestType: "VERIFY_EMAIL",
    });
  }

  signOut(): void {
    this.runtime.http.clearSession();
  }
}

export class AccountsClient {
  constructor(private readonly runtime: ClientRuntime) {}

  getMe<TResponse = UserProfile>(): Promise<TResponse> {
    return this.runtime.http.get<TResponse>(this.runtime.endpoints.users.me);
  }

  register<TResponse = AccountRegisterResult>(
    body: Record<string, unknown> = {},
  ): Promise<TResponse> {
    return this.runtime.http.request<TResponse>({
      method: "POST",
      url: buildAbsoluteUrl(this.runtime.options.apiBaseUrl, "/api/v2/users"),
      body,
    });
  }

  list<TResponse = UserProfile[]>(query?: RequestQuery): Promise<TResponse> {
    return this.runtime.http.get<TResponse>(this.runtime.endpoints.users.collection, {
      query,
    });
  }

  getById<TResponse = UserProfile>(userId: string): Promise<TResponse> {
    return this.runtime.http.get<TResponse>(this.runtime.endpoints.users.byId(userId));
  }

  updateMe<TResponse = UserProfile>(
    patch: AccountProfilePatch,
  ): Promise<TResponse> {
    return this.runtime.http.patch<TResponse, AccountProfilePatch>(
      this.runtime.endpoints.users.me,
      patch,
    );
  }

  changeDisplayName<TResponse = unknown>(
    displayName: string,
    userId = requireUserId(this.runtime.http),
  ): Promise<TResponse> {
    const payload: UserDisplayNameChangeRequest = {
      userId,
      displayName,
    };
    return this.runtime.http.post<TResponse>(
      this.runtime.endpoints.users.updateDisplayName,
      {
        UserId: payload.userId,
        DisplayName: payload.displayName,
      },
    );
  }

  changeAnotherName<TResponse = unknown>(
    anotherName: string,
    userId = requireUserId(this.runtime.http),
  ): Promise<TResponse> {
    const payload: UserAnotherNameChangeRequest = {
      userId,
      anotherName,
    };
    return this.runtime.http.post<TResponse>(
      this.runtime.endpoints.users.updateAnotherName,
      {
        UserId: payload.userId,
        AnotherName: payload.anotherName,
      },
    );
  }

  changeIconSource<TResponse = unknown>(
    iconSource: string,
    userId = requireUserId(this.runtime.http),
  ): Promise<TResponse> {
    const payload: UserIconSourceChangeRequest = {
      userId,
      iconSource,
    };
    return this.runtime.http.post<TResponse>(
      this.runtime.endpoints.users.updateIconSource,
      {
        UserId: payload.userId,
        IconSource: payload.iconSource,
      },
    );
  }

  changeOwnerUserId<TResponse = unknown>(
    userId = requireUserId(this.runtime.http),
  ): Promise<TResponse> {
    const payload: OwnerUserIdChangeRequest = {
      userId,
    };
    return this.runtime.http.post<TResponse>(
      this.runtime.endpoints.users.changeOwnerUserId,
      {
        UserId: payload.userId,
      },
    );
  }
}

export class SpacesClient {
  constructor(private readonly runtime: ClientRuntime) {}

  create<TResponse = SpaceCreateResult>(
    body: SpaceCreateRequest,
  ): Promise<TResponse> {
    return this.runtime.http.request<TResponse, SpaceCreateRequest>({
      method: "POST",
      url: buildAbsoluteUrl(this.runtime.options.apiBaseUrl, "/api/v2/spaces"),
      body,
    });
  }

  current<TResponse = HomeDisplaySpacesResponse>(
    request: HomeDisplaySpacesRequest = {},
    query?: RequestQuery,
  ): Promise<TResponse> {
    return this.runtime.http.request<TResponse>({
      method: "POST",
      url: buildAbsoluteUrl(
        this.runtime.options.apiBaseUrl,
        "/api/v2/users/me/home-display-spaces",
      ),
      body: request,
      query,
    });
  }

  async list<TResponse = HomeDisplaySpace[]>(
    request: HomeDisplaySpacesRequest = {},
    query?: RequestQuery,
  ): Promise<TResponse> {
    const payload = await this.current<HomeDisplaySpacesResponse>(request, query);
    return flattenHomeDisplaySpaces(payload) as TResponse;
  }

  async getByKey<TResponse = HomeDisplaySpace | undefined>(
    spaceKey: string,
    request: HomeDisplaySpacesRequest = {},
    query?: RequestQuery,
  ): Promise<TResponse> {
    const spaces = await this.list<HomeDisplaySpace[]>(request, query);
    return spaces.find((entry) => entry.space?.spaceKey === spaceKey) as TResponse;
  }

  connectionInfo<TResponse = unknown>(
    spaceKey: string,
    body: Record<string, unknown> = {},
    query?: RequestQuery,
  ): Promise<TResponse> {
    return this.runtime.http.request<TResponse>({
      method: "POST",
      url: buildAbsoluteUrl(
        this.runtime.options.apiBaseUrl,
        `/api/v2/spaces/${encodeURIComponent(spaceKey)}/connection-info`,
      ),
      body,
      query,
    });
  }

  async connect(
    spaceKey: string,
    body: SpaceConnectionRequest = { muted: false },
    query?: RequestQuery,
  ): Promise<SpaceConnectResult> {
    const connectionInfo = await this.connectionInfo<Record<string, unknown>>(
      spaceKey,
      {},
      query,
    );
    const connection = await this.runtime.http.request<Record<string, unknown>, SpaceConnectionRequest>({
      method: "POST",
      url: buildAbsoluteUrl(
        this.runtime.options.apiBaseUrl,
        `/api/v2/spaces/${encodeURIComponent(spaceKey)}/users/me/connection`,
      ),
      body,
      query,
    });

    this.runtime.http.setSession({
      currentSpaceKey: spaceKey,
    });

    return {
      spaceKey,
      muted: body.muted,
      connectionInfo,
      connection,
    };
  }

  postMessage<TResponse = { result?: boolean; [key: string]: unknown }>(
    spaceKey: string,
    body: SpaceMessageCreateRequest,
    query?: RequestQuery,
  ): Promise<TResponse> {
    return this.runtime.http.request<TResponse, SpaceMessageCreateRequest>({
      method: "POST",
      url: buildAbsoluteUrl(
        this.runtime.options.apiBaseUrl,
        `/api/v2/spaces/${encodeURIComponent(spaceKey)}/messages`,
      ),
      body,
      query,
    });
  }

  async listMessages(
    spaceKey: string,
    options: SpaceMessageListOptions = {},
  ): Promise<SpaceMessageListResult> {
    const payload = await this.runtime.http.request<Record<string, unknown>>({
      method: "GET",
      url: buildFirestoreCollectionUrl(
        this.runtime.options.firebase.firestoreBaseUrl,
        this.runtime.options.firebase.projectId,
        buildFirestoreCollectionPath("spaces", spaceKey, "space-messages"),
      ),
      auth: "none",
      headers: {
        authorization: `Bearer ${requireFirebaseBearerToken(this.runtime.http)}`,
      },
      query: compactObject({
        key: this.runtime.options.firebase.apiKey,
        pageSize: options.limit,
        orderBy: options.orderBy,
        pageToken: options.pageToken,
      }) as RequestQuery,
    });

    this.runtime.http.setSession({
      currentSpaceKey: spaceKey,
    });

    return parseSpaceMessageList(payload);
  }
}

export class LivesClient {
  constructor(private readonly runtime: ClientRuntime) {}

  async start<TResponse = LiveStartResult>(
    input: {
      spaceKey: string;
      body: LiveStartRequest;
      query?: RequestQuery;
    },
  ): Promise<TResponse> {
    const response = await this.runtime.http.request<TResponse, LiveStartRequest>({
      method: "POST",
      url: buildAbsoluteUrl(
        this.runtime.options.apiBaseUrl,
        `/api/v2/spaces/${encodeURIComponent(input.spaceKey)}/lives`,
      ),
      body: input.body,
      query: input.query,
    });

    const liveId =
      optionalString((response as Record<string, unknown>).id) ??
      optionalString((response as Record<string, unknown>).liveId);

    this.runtime.http.setSession({
      currentSpaceKey: input.spaceKey,
      currentLiveId: liveId,
    });

    return response;
  }

  current<TResponse = HomeDisplaySpacesResponse>(
    request: HomeDisplaySpacesRequest = {},
    query?: RequestQuery,
  ): Promise<TResponse> {
    return this.runtime.http.request<TResponse>({
      method: "POST",
      url: buildAbsoluteUrl(
        this.runtime.options.apiBaseUrl,
        "/api/v2/users/me/home-display-spaces",
      ),
      body: request,
      query,
    });
  }

  async list<TResponse = LiveListItem[]>(
    request: HomeDisplaySpacesRequest = {},
    query?: RequestQuery,
  ): Promise<TResponse> {
    const payload = await this.current<HomeDisplaySpacesResponse>(request, query);
    return flattenHomeDisplayLives(payload) as TResponse;
  }

  async getBySpaceKey<TResponse = LiveListItem[]>(
    spaceKey: string,
    request: HomeDisplaySpacesRequest = {},
    query?: RequestQuery,
  ): Promise<TResponse> {
    const lives = await this.list<LiveListItem[]>(request, query);
    return lives.filter((entry) => entry.spaceKey === spaceKey) as TResponse;
  }

  async getCurrentBySpaceKey<TResponse = LiveListItem | undefined>(
    spaceKey: string,
    request: HomeDisplaySpacesRequest = {},
    query?: RequestQuery,
  ): Promise<TResponse> {
    const lives = await this.getBySpaceKey<LiveListItem[]>(spaceKey, request, query);
    return lives[0] as TResponse;
  }

  listBySpace<TResponse = LiveListItem[]>(
    spaceKey: string,
    body: SpaceLiveListRequest,
    query?: RequestQuery,
  ): Promise<TResponse> {
    return this.runtime.http.request<TResponse>({
      method: "POST",
      url: buildAbsoluteUrl(
        this.runtime.options.apiBaseUrl,
        `/api/v2/spaces/${encodeURIComponent(spaceKey)}/lives`,
      ),
      body,
      query,
    });
  }

  async enter(
    spaceKey: string,
    request: HomeDisplaySpacesRequest = {},
    query?: RequestQuery,
  ): Promise<LiveEnterResult> {
    const live = await this.getCurrentBySpaceKey(spaceKey, request, query);
    const liveId = live?.liveId ?? live?.id;

    if (!liveId) {
      throw new PopopoConfigurationError(
        `No current live was found for space ${spaceKey}.`,
      );
    }

    this.runtime.http.setSession({
      currentSpaceKey: spaceKey,
      currentLiveId: liveId,
    });

    return {
      spaceKey,
      liveId,
      live: live as LiveListItem,
    };
  }

  async postComment<TResponse = { id?: string; [key: string]: unknown }>(
    input: {
      spaceKey?: string;
      liveId?: string;
      body: LiveCommentCreateRequest;
      request?: HomeDisplaySpacesRequest;
      query?: RequestQuery;
    },
  ): Promise<TResponse> {
    const context = await resolveLiveContext(this.runtime, input);

    return this.runtime.http.request<TResponse, LiveCommentCreateRequest>({
      method: "POST",
      url: buildAbsoluteUrl(
        this.runtime.options.apiBaseUrl,
        `/api/v2/spaces/${encodeURIComponent(context.spaceKey)}/lives/${encodeURIComponent(context.liveId)}/comments`,
      ),
      body: input.body,
      query: input.query,
    });
  }

  async listComments(
    input: {
      spaceKey?: string;
      liveId?: string;
      options?: LiveCommentListOptions;
      request?: HomeDisplaySpacesRequest;
    } = {},
  ): Promise<LiveCommentListResult> {
    const context = await resolveLiveContext(this.runtime, input);
    const payload = await this.runtime.http.request<Record<string, unknown>>({
      method: "GET",
      url: buildFirestoreCollectionUrl(
        this.runtime.options.firebase.firestoreBaseUrl,
        this.runtime.options.firebase.projectId,
        buildFirestoreCollectionPath("spaces", context.spaceKey, "lives", context.liveId, "comments"),
      ),
      auth: "none",
      headers: {
        authorization: `Bearer ${requireFirebaseBearerToken(this.runtime.http)}`,
      },
      query: compactObject({
        key: this.runtime.options.firebase.apiKey,
        pageSize: input.options?.limit,
        orderBy: input.options?.orderBy,
        pageToken: input.options?.pageToken,
      }) as RequestQuery,
    });

    return parseLiveCommentList(payload);
  }

  async getLiveDocument(
    input: {
      spaceKey?: string;
      liveId?: string;
      request?: HomeDisplaySpacesRequest;
      query?: RequestQuery;
    } = {},
  ): Promise<FirestoreDocument<Record<string, unknown>>> {
    const context = await resolveLiveContext(this.runtime, input);
    const payload = await this.runtime.http.request<Record<string, unknown>>({
      method: "GET",
      url: buildFirestoreDocumentUrl(
        this.runtime.options.firebase.firestoreBaseUrl,
        this.runtime.options.firebase.projectId,
        buildFirestoreCollectionPath("spaces", context.spaceKey, "lives", context.liveId),
      ),
      auth: "none",
      headers: {
        authorization: `Bearer ${requireFirebaseBearerToken(this.runtime.http)}`,
      },
      query: {
        key: this.runtime.options.firebase.apiKey,
      },
    });

    return parseFirestoreDocument<Record<string, unknown>>(payload);
  }

  async getReceiveInfo(
    input: {
      spaceKey?: string;
      liveId?: string;
      request?: HomeDisplaySpacesRequest;
      query?: RequestQuery;
    } = {},
  ): Promise<LiveReceiveInfo> {
    const context = await resolveLiveContext(this.runtime, input);
    const liveDocument = await this.getLiveDocument(input);
    const liveFields = liveDocument.fields;

    let connectionInfo: Record<string, unknown> | undefined;
    let connectionInfoError: LiveReceiveInfo["connectionInfoError"];

    try {
      connectionInfo = await new SpacesClient(this.runtime).connectionInfo<Record<string, unknown>>(
        context.spaceKey,
        {},
        input.query,
      );
    } catch (error) {
      if (isIgnorableConnectionInfoError(error)) {
        connectionInfoError = {
          statusCode: error.status,
          message: error.message,
        };
      } else {
        throw error;
      }
    }

    const userSig = optionalString(connectionInfo?.userSig);
    const privateMapKey = optionalString(connectionInfo?.privateMapKey);
    const decodedUserSig = decodeTencentCompactToken(userSig);
    const decodedPrivateMapKey = decodeTencentCompactToken(privateMapKey);
    const sdkAppId =
      toFiniteNumber(decodedUserSig?.["TLS.sdkappid"]) ??
      toFiniteNumber(decodedPrivateMapKey?.["TLS.sdkappid"]) ??
      DEFAULT_TENCENT_SDK_APP_ID;
    const userId =
      optionalString(decodedUserSig?.["TLS.identifier"]) ??
      optionalString(decodedPrivateMapKey?.["TLS.identifier"]) ??
      this.runtime.http.getSession().userId;
    const streamName = optionalString(liveFields.stream_name);

    return {
      spaceKey: context.spaceKey,
      liveId: context.liveId,
      streamName,
      liveToken: optionalString(liveFields.token),
      taskId: optionalString(liveFields.task_id),
      liveStatus: optionalString(liveFields.status),
      playbackDomain: DEFAULT_TENCENT_LIVE_PLAY_HOST,
      liveFlvUrl: streamName ? buildTencentLivePlaybackUrl(streamName, "flv") : undefined,
      liveHlsUrl: streamName ? buildTencentLivePlaybackUrl(streamName, "m3u8") : undefined,
      liveRtmpUrl: streamName ? buildTencentLiveRtmpUrl(streamName) : undefined,
      sdkAppId,
      userId,
      userSig,
      privateMapKey,
      trtcPlayUrl:
        sdkAppId && userId && userSig && streamName
          ? buildTencentTrtcPlayUrl({
              sdkAppId,
              userId,
              userSig,
              streamName,
            })
          : undefined,
      decodedUserSig,
      decodedPrivateMapKey,
      liveDocumentPath: liveDocument.name,
      liveDocument,
      connectionInfo,
      connectionInfoError,
    };
  }

  async openAudioStream(
    input: {
      spaceKey?: string;
      liveId?: string;
      request?: HomeDisplaySpacesRequest;
      query?: RequestQuery;
    } = {},
  ): Promise<LiveAudioStream> {
    const receiveInfo = await this.getReceiveInfo(input);
    const url = receiveInfo.liveFlvUrl;

    if (!url) {
      throw new PopopoConfigurationError(
        "Unable to resolve a playable live audio URL for this live.",
      );
    }

    const abortController = new AbortController();
    const response = await this.runtime.http.request<Response>({
      method: "GET",
      url,
      auth: "none",
      includeAppCheck: false,
      parseAs: "response",
      signal: abortController.signal,
      headers: {
        accept: "video/x-flv,application/octet-stream;q=0.9,*/*;q=0.1",
      },
    });

    const stream = response.body;

    if (!stream) {
      throw new PopopoConfigurationError("The live audio response does not contain a body stream.");
    }

    return {
      url,
      contentType: response.headers.get("content-type") ?? undefined,
      response,
      stream,
      receiveInfo,
      cancel: () => abortController.abort(),
    };
  }

}

export class CoinsClient {
  constructor(private readonly runtime: ClientRuntime) {}

  async getUserPrivateData(
    userId = requireUserId(this.runtime.http),
  ): Promise<FirestoreDocument<UserPrivateData>> {
    const documentPath = buildFirestoreDocumentPath("user-privates", userId);
    const payload = await this.runtime.http.request<Record<string, unknown>>({
      method: "GET",
      url: buildFirestoreDocumentUrl(
        this.runtime.options.firebase.firestoreBaseUrl,
        this.runtime.options.firebase.projectId,
        documentPath,
      ),
      auth: "none",
      headers: {
        authorization: `Bearer ${requireFirebaseBearerToken(this.runtime.http)}`,
      },
      query: {
        key: this.runtime.options.firebase.apiKey,
      },
    });

    return parseFirestoreDocument<UserPrivateData>(payload);
  }

  async getBalance(
    userId = requireUserId(this.runtime.http),
  ): Promise<CoinBalanceSnapshot> {
    const document = await this.getUserPrivateData(userId);
    const coinBalances = normalizeCoinBalances(document.fields.coinBalances);
    const paidCoins =
      pickNamedCoinBalance(coinBalances, "paid") ??
      toFiniteNumber((document.fields as Record<string, unknown>).paidCoins);
    const freeCoins =
      pickNamedCoinBalance(coinBalances, "free") ??
      toFiniteNumber((document.fields as Record<string, unknown>).freeCoins);

    return {
      userId,
      documentPath: document.name,
      paidCoins,
      freeCoins,
      coinBalances,
      userPrivateData: document.fields,
      rawDocument: document,
    };
  }
}

export class PushClient {
  constructor(private readonly runtime: ClientRuntime) {}

  upsertDevice<TResponse = PushDeviceUpsertResult>(
    deviceId: string,
    body: PushDeviceUpsertRequest,
    query?: RequestQuery,
  ): Promise<TResponse> {
    return this.runtime.http.request<TResponse, PushDeviceUpsertRequest>({
      method: "PUT",
      url: buildAbsoluteUrl(
        this.runtime.options.apiBaseUrl,
        `/api/v2/push/devices/${encodeURIComponent(deviceId)}`,
      ),
      body,
      query,
    });
  }
}

export class CallsClient {
  constructor(private readonly runtime: ClientRuntime) {}

  createPush<TResponse = CallPushCreateResult>(
    body: CallPushCreateRequest,
    query?: RequestQuery,
  ): Promise<TResponse> {
    return this.runtime.http.request<TResponse, CallPushCreateRequest>({
      method: "POST",
      url: buildAbsoluteUrl(
        this.runtime.options.apiBaseUrl,
        "/api/v2/push/call-pushes",
      ),
      body,
      query,
    });
  }
}

export class InvitesClient {
  constructor(private readonly runtime: ClientRuntime) {}

  list<TResponse = Invite[]>(query?: RequestQuery): Promise<TResponse> {
    return this.runtime.http.request<TResponse>({
      method: "GET",
      url: buildAbsoluteUrl(
        this.runtime.options.apiBaseUrl,
        "/api/v2/invites",
      ),
      query,
    });
  }

  getByCode<TResponse = Invite>(code: string): Promise<TResponse> {
    const inviteKey = extractInviteKey(code);

    return this.runtime.http.request<TResponse>({
      method: "GET",
      url: buildAbsoluteUrl(
        this.runtime.options.apiBaseUrl,
        `/api/v2/invites/${encodeURIComponent(inviteKey)}`,
      ),
    });
  }

  async accept<TResponse = InviteAcceptResult>(
    code: string,
    body?: Record<string, unknown>,
  ): Promise<TResponse> {
    const inviteKey = extractInviteKey(code);
    const inviteInfo = await this.getByCode<Invite>(inviteKey);
    const kind = optionalString((inviteInfo as Record<string, unknown>).kind);

    if (kind === "space") {
      const spaceKey = requiredString(
        inviteInfo as Record<string, unknown>,
        ["spaceKey", "space_key"],
      );
      const response = await this.runtime.http.request<Record<string, unknown>>({
        method: "POST",
        url: buildAbsoluteUrl(
          this.runtime.options.apiBaseUrl,
          `/api/v2/spaces/${encodeURIComponent(spaceKey)}/users/me`,
        ),
        body: compactObject({
          inviteKey,
          ...(body ?? {}),
        }),
      });

      this.runtime.http.setSession({
        currentSpaceKey: spaceKey,
      });

      return {
        kind,
        inviteKey,
        inviteInfo,
        spaceKey,
        response,
      } as TResponse;
    }

    if (kind === "friend") {
      const response = await this.runtime.http.request<Record<string, unknown>>({
        method: "POST",
        url: buildAbsoluteUrl(
          this.runtime.options.apiBaseUrl,
          `/api/v2/users/me/use-friend-invites/${encodeURIComponent(inviteKey)}`,
        ),
        body: body ?? {},
      });

      return {
        kind,
        inviteKey,
        inviteInfo,
        response,
      } as TResponse;
    }

    throw new PopopoConfigurationError(
      `Unsupported invite kind${kind ? `: ${kind}` : ""}.`,
    );
  }
}

export class NotificationsClient {
  constructor(private readonly runtime: ClientRuntime) {}

  list<TResponse = NotificationItem[]>(
    query?: RequestQuery,
  ): Promise<TResponse> {
    return this.runtime.http.get<TResponse>(
      this.runtime.endpoints.notifications.collection,
      { query },
    );
  }

  getById<TResponse = NotificationItem>(
    notificationId: string,
  ): Promise<TResponse> {
    return this.runtime.http.get<TResponse>(
      this.runtime.endpoints.notifications.byId(notificationId),
    );
  }

  markRead<TResponse = unknown>(notificationId: string): Promise<TResponse> {
    return this.runtime.http.post<TResponse>(
      this.runtime.endpoints.notifications.markRead(notificationId),
      {},
    );
  }

  listPersonal<TResponse = PersonalNotificationData[]>(
    query?: RequestQuery,
  ): Promise<TResponse> {
    return this.runtime.http.request<TResponse>({
      method: "GET",
      url: buildAbsoluteUrl(
        this.runtime.options.apiBaseUrl,
        "/api/v2/personal-notifications",
      ),
      query,
    });
  }

  getPersonalById<TResponse = PersonalNotificationData>(
    notificationId: string,
    query?: RequestQuery,
  ): Promise<TResponse> {
    return this.runtime.http.request<TResponse>({
      method: "GET",
      url: buildAbsoluteUrl(
        this.runtime.options.apiBaseUrl,
        `/api/v2/personal-notifications/${encodeURIComponent(notificationId)}`,
      ),
      query,
    });
  }

  receivePersonalDeliveryContent<TResponse = PersonalNotificationDeliveryContent>(
    notificationId: string,
    request: ReceivePersonalNotificationDeliveryContentRequest = {},
    query?: RequestQuery,
  ): Promise<TResponse> {
    return this.runtime.http.request<TResponse>({
      method: "POST",
      url: buildAbsoluteUrl(
        this.runtime.options.apiBaseUrl,
        `/api/v2/personal-notifications/${encodeURIComponent(notificationId)}/delivery-content`,
      ),
      body: request,
      query,
    });
  }
}

export class ScenesClient {
  constructor(private readonly runtime: ClientRuntime) {}

  load<TResponse = unknown>(
    request: SceneLoadRequest = {},
  ): Promise<TResponse> {
    return this.runtime.http.post<TResponse>(
      this.runtime.endpoints.ipc.sceneLoad,
      request,
    );
  }

  exit<TResponse = unknown>(): Promise<TResponse> {
    return this.runtime.http.post<TResponse>(
      this.runtime.endpoints.ipc.sceneExit,
      {},
    );
  }

  cancelCurrent<TResponse = unknown>(): Promise<TResponse> {
    return this.runtime.http.post<TResponse>(
      this.runtime.endpoints.ipc.cancelCurrentSceneRequests,
      {},
    );
  }
}

export class SequencesClient {
  constructor(private readonly runtime: ClientRuntime) {}

  startPlayback<TResponse = unknown>(
    request: SequencePlayStartRequest,
  ): Promise<TResponse> {
    return this.runtime.http.post<TResponse>(
      this.runtime.endpoints.ipc.sequencePlayStart,
      {
        JsonPath: request.jsonPath,
      },
    );
  }

  stopPlayback<TResponse = unknown>(): Promise<TResponse> {
    return this.runtime.http.post<TResponse>(
      this.runtime.endpoints.ipc.sequencePlayStop,
      {},
    );
  }

  startRecording<TResponse = unknown>(
    request: SequenceRecordingStartRequest,
  ): Promise<TResponse> {
    return this.runtime.http.post<TResponse>(
      this.runtime.endpoints.ipc.sequenceRecordingStart,
      {
        SequenceName: request.sequenceName,
      },
    );
  }

  stopRecording<TResponse = unknown>(): Promise<TResponse> {
    return this.runtime.http.post<TResponse>(
      this.runtime.endpoints.ipc.sequenceRecordingStop,
      {},
    );
  }
}

export class NameplatesClient {
  constructor(private readonly runtime: ClientRuntime) {}

  displayNormal<TResponse = unknown>(
    message: NameplateNormalDisplayedMessage,
  ): Promise<TResponse> {
    return this.runtime.http.post<TResponse>(
      this.runtime.endpoints.ipc.nameplateNormal,
      {
        Id: message.id,
        PositionType: message.positionType,
      },
    );
  }

  displaySpecial<TResponse = unknown>(
    message: NameplateSpecialDisplayedMessage,
  ): Promise<TResponse> {
    return this.runtime.http.post<TResponse>(
      this.runtime.endpoints.ipc.nameplateSpecial,
      {
        Id: message.id,
        NameplateTemplateId: message.nameplateTemplateId,
      },
    );
  }

  clear<TResponse = unknown>(): Promise<TResponse> {
    return this.runtime.http.post<TResponse>(
      this.runtime.endpoints.ipc.nameplateClear,
      {},
    );
  }
}

export class TsoClient {
  constructor(private readonly runtime: ClientRuntime) {}

  async exchangeAuthorizationCode(
    input: TsoAuthorizationCodeRequest,
  ): Promise<TsoOAuthTokenResponse> {
    const payload = await this.runtime.http.request<Record<string, unknown>>({
      method: "POST",
      url: buildAbsoluteUrl(this.runtime.options.tso.oauthBaseUrl, "/oauth/token"),
      auth: "none",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(compactStringRecord({
        grant_type: "authorization_code",
        code: input.code,
        code_verifier: input.codeVerifier,
        redirect_uri: input.redirectUri ?? this.runtime.options.tso.redirectUri,
        client_id: input.clientId ?? this.runtime.options.tso.clientId,
        client_secret: input.clientSecret ?? this.runtime.options.tso.clientSecret,
      })),
    });

    return toTsoTokenResponse(payload);
  }

  async refreshAccessToken(
    input: TsoRefreshTokenRequest | string,
  ): Promise<TsoOAuthTokenResponse> {
    const request =
      typeof input === "string" ? { refreshToken: input } : input;

    const payload = await this.runtime.http.request<Record<string, unknown>>({
      method: "POST",
      url: buildAbsoluteUrl(this.runtime.options.tso.oauthBaseUrl, "/oauth/token"),
      auth: "none",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(compactStringRecord({
        grant_type: "refresh_token",
        refresh_token: request.refreshToken,
        client_id: request.clientId ?? this.runtime.options.tso.clientId,
        client_secret: request.clientSecret ?? this.runtime.options.tso.clientSecret,
      })),
    });

    return toTsoTokenResponse(payload);
  }

  buildFileFetchUrl(fileId: string, options: TsoFileFetchOptions = {}): string {
    const baseUrl = requireTsoFileApiBaseUrl(this.runtime.options.tso);
    const url = new URL("/", ensureTrailingSlash(baseUrl));
    const clientId = options.clientId ?? this.runtime.options.tso.clientId;

    url.searchParams.set("file_id", fileId);

    if (clientId) {
      url.searchParams.set("client_id", clientId);
    }

    if (options.isModifierEnabled) {
      url.searchParams.set("is_enabled_modifier", "true");
    }

    return url.toString();
  }

  buildFileStatusUrl(
    fileId: string,
    options: TsoFileStatusOptions = {},
  ): string {
    const baseUrl = requireTsoFileApiBaseUrl(this.runtime.options.tso);
    const url = new URL("/status", ensureTrailingSlash(baseUrl));
    const clientId = options.clientId ?? this.runtime.options.tso.clientId;

    url.searchParams.set("file_id", fileId);

    if (clientId) {
      url.searchParams.set("client_id", clientId);
    }

    return url.toString();
  }

  fetchFileStatus<TResponse = unknown>(
    fileId: string,
    options: TsoFileStatusOptions = {},
  ): Promise<TResponse> {
    return this.runtime.http.request<TResponse>({
      method: "GET",
      url: this.buildFileStatusUrl(fileId, options),
      auth: "none",
    });
  }

  fetchFile(
    fileId: string,
    options: TsoFileFetchOptions = {},
  ): Promise<Response> {
    return this.runtime.http.request<Response>({
      method: "GET",
      url: this.buildFileFetchUrl(fileId, options),
      auth: "none",
      parseAs: "response",
    });
  }
}

function resolveClientOptions(options: PopopoClientOptions): ResolvedClientOptions {
  return {
    baseUrl: options.baseUrl ?? DEFAULT_POPOPO_BASE_URL,
    apiBaseUrl: options.apiBaseUrl ?? DEFAULT_POPOPO_API_BASE_URL,
    apiBasePath: options.apiBasePath ?? "",
    firebase: {
      apiKey: options.firebase?.apiKey ?? DEFAULT_FIREBASE_CONFIG.apiKey,
      appId: options.firebase?.appId ?? DEFAULT_FIREBASE_CONFIG.appId,
      authBaseUrl:
        options.firebase?.authBaseUrl ?? DEFAULT_FIREBASE_CONFIG.authBaseUrl,
      authDomain:
        options.firebase?.authDomain ?? DEFAULT_FIREBASE_CONFIG.authDomain,
      firestoreBaseUrl:
        options.firebase?.firestoreBaseUrl ?? DEFAULT_FIREBASE_CONFIG.firestoreBaseUrl,
      projectId:
        options.firebase?.projectId ?? DEFAULT_FIREBASE_CONFIG.projectId,
      secureTokenBaseUrl:
        options.firebase?.secureTokenBaseUrl ??
        DEFAULT_FIREBASE_CONFIG.secureTokenBaseUrl,
      storageBucket:
        options.firebase?.storageBucket ?? DEFAULT_FIREBASE_CONFIG.storageBucket,
      webClientId:
        options.firebase?.webClientId ?? DEFAULT_FIREBASE_CONFIG.webClientId,
      returnSecureToken:
        options.firebase?.returnSecureToken ?? DEFAULT_FIREBASE_CONFIG.returnSecureToken,
      tenantId: options.firebase?.tenantId,
    },
    tso: {
      oauthBaseUrl:
        options.tso?.oauthBaseUrl ?? DEFAULT_TSO_OAUTH_BASE_URL,
      fileApiBaseUrl: options.tso?.fileApiBaseUrl,
      clientId: options.tso?.clientId,
      clientSecret: options.tso?.clientSecret,
      redirectUri: options.tso?.redirectUri,
    },
  };
}

function buildFirebaseUrl(baseUrl: string, suffix: string): string {
  return buildAbsoluteUrl(baseUrl, `/${suffix}`);
}

function buildFirestoreDocumentUrl(
  baseUrl: string,
  projectId: string,
  documentPath: string,
): string {
  return buildAbsoluteUrl(
    baseUrl,
    `/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${documentPath}`,
  );
}

function buildFirestoreCollectionUrl(
  baseUrl: string,
  projectId: string,
  collectionPath: string,
): string {
  return buildAbsoluteUrl(
    baseUrl,
    `/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${collectionPath}`,
  );
}

function buildFirestoreDocumentPath(
  collectionId: string,
  documentId: string,
): string {
  return `${encodeURIComponent(collectionId)}/${encodeURIComponent(documentId)}`;
}

function buildFirestoreCollectionPath(...segments: string[]): string {
  return segments.map((segment) => encodeURIComponent(segment)).join("/");
}

function buildAbsoluteUrl(baseUrl: string, suffix: string): string {
  const url = new URL(ensureTrailingSlash(baseUrl));
  const normalizedBasePath = url.pathname.replace(/\/+$/, "");
  const normalizedSuffix = suffix.replace(/^\/+/, "");

  url.pathname =
    `${normalizedBasePath}/${normalizedSuffix}`.replace(/\/{2,}/g, "/");

  return url.toString();
}

function buildIdpPostBody(input: FirebaseIdpCredentialInput): string {
  const postBody = new URLSearchParams();

  if (input.oauthIdToken) {
    postBody.set("id_token", input.oauthIdToken);
  }

  if (input.oauthAccessToken) {
    postBody.set("access_token", input.oauthAccessToken);
  }

  if (input.identifier) {
    postBody.set("identifier", input.identifier);
  }

  if (input.oauthTokenSecret) {
    postBody.set("oauth_token_secret", input.oauthTokenSecret);
  }

  if (input.authCode) {
    postBody.set("code", input.authCode);
  }

  if (input.nonce) {
    postBody.set("nonce", input.nonce);
  }

  if (![...postBody.keys()].some((key) => key !== "identifier")) {
    throw new PopopoConfigurationError(
      "IDP linking requires at least one provider token or auth code.",
    );
  }

  postBody.set("providerId", input.providerId);
  return postBody.toString();
}

function buildEmailLinkBody(
  email: string,
  emailLink: string,
): Record<string, string | undefined> {
  const parsed = tryParseEmailLink(emailLink);

  return {
    email,
    oobCode: parsed?.oobCode,
    tenantId: parsed?.tenantId,
  };
}

function tryParseEmailLink(
  emailLink: string,
): { oobCode?: string; tenantId?: string } | undefined {
  try {
    const url = new URL(emailLink);
    return {
      oobCode: url.searchParams.get("oobCode") ?? undefined,
      tenantId: url.searchParams.get("tenantId") ?? undefined,
    };
  } catch {
    return undefined;
  }
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

function toFirebaseSession(payload: Record<string, unknown>): FirebaseAuthSession {
  const idToken = requiredString(payload, ["idToken", "id_token"]);
  const refreshToken = requiredString(payload, ["refreshToken", "refresh_token"]);
  const localId = requiredString(payload, ["localId", "user_id"]);
  const expiresIn = requiredNumber(payload, ["expiresIn", "expires_in"]);

  return {
    kind: asOptionalString(payload.kind),
    idToken,
    refreshToken,
    expiresIn,
    localId,
    email: asOptionalString(payload.email),
    displayName: asOptionalString(payload.displayName),
    registered: typeof payload.registered === "boolean" ? payload.registered : undefined,
    photoUrl: asOptionalString(payload.photoUrl),
    raw: payload,
  };
}

function toFirebaseIdpLinkResult(
  payload: Record<string, unknown>,
): FirebaseIdpLinkResult {
  return {
    session: maybeToFirebaseSession(payload),
    providerId: asOptionalString(payload.providerId),
    email: asOptionalString(payload.email),
    rawUserInfo: asOptionalString(payload.rawUserInfo),
    isNewUser: typeof payload.isNewUser === "boolean" ? payload.isNewUser : undefined,
    needConfirmation:
      typeof payload.needConfirmation === "boolean"
        ? payload.needConfirmation
        : undefined,
    pendingToken: asOptionalString(payload.pendingToken),
    tenantId: asOptionalString(payload.tenantId),
    errorMessage: asOptionalString(payload.errorMessage),
    raw: payload,
  };
}

function toFirebaseRefreshResponse(
  payload: Record<string, unknown>,
): FirebaseTokenRefreshResponse {
  return {
    accessToken: requiredString(payload, ["access_token", "accessToken"]),
    expiresIn: requiredNumber(payload, ["expires_in", "expiresIn"]),
    idToken: requiredString(payload, ["id_token", "idToken"]),
    projectId: asOptionalString(payload.project_id),
    refreshToken: requiredString(payload, ["refresh_token", "refreshToken"]),
    tokenType: asOptionalString(payload.token_type),
    userId: requiredString(payload, ["user_id", "localId"]),
    raw: payload,
  };
}

function toTsoTokenResponse(payload: Record<string, unknown>): TsoOAuthTokenResponse {
  return {
    tokenType: asOptionalString(payload.token_type),
    expiresIn: requiredNumber(payload, ["expires_in", "expiresIn"]),
    accessToken: requiredString(payload, ["access_token", "accessToken"]),
    refreshToken: asOptionalString(payload.refresh_token),
    scope: asOptionalString(payload.scope),
    raw: payload,
  };
}

function toFirebasePhoneVerificationSession(
  payload: Record<string, unknown>,
): FirebasePhoneVerificationSession {
  return {
    sessionInfo: requiredString(payload, ["sessionInfo"]),
    raw: payload,
  };
}

function toFirebasePhoneAuthResult(
  payload: Record<string, unknown>,
): FirebasePhoneAuthResult {
  return {
    session: maybeToFirebaseSession(payload),
    phoneNumber: asOptionalString(payload.phoneNumber),
    temporaryProof: asOptionalString(payload.temporaryProof),
    temporaryProofExpiresIn: optionalNumber(payload, [
      "temporaryProofExpiresIn",
    ]),
    verificationProof: asOptionalString(payload.verificationProof),
    verificationProofExpiresIn: optionalNumber(payload, [
      "verificationProofExpiresIn",
    ]),
    isNewUser: typeof payload.isNewUser === "boolean" ? payload.isNewUser : undefined,
    raw: payload,
  };
}

function applyFirebaseSession(http: HttpClient, session: FirebaseAuthSession): void {
  http.setSession({
    bearerToken: session.idToken,
    firebaseIdToken: session.idToken,
    refreshToken: session.refreshToken,
    userId: session.localId,
    email: session.email,
  });
}

function applyFirebaseRefresh(
  http: HttpClient,
  refresh: FirebaseTokenRefreshResponse,
): void {
  http.setSession({
    bearerToken: refresh.idToken,
    firebaseIdToken: refresh.idToken,
    refreshToken: refresh.refreshToken,
    userId: refresh.userId,
  });
}

function withAndroidClientInfo(
  record: Record<string, unknown>,
  captchaResponse?: string,
  clientType?: string,
  recaptchaVersion?: string,
): Record<string, unknown> {
  const next = compactObject({
    ...record,
    clientType: clientType ?? DEFAULT_FIREBASE_ANDROID_CLIENT_TYPE,
  });

  if (!captchaResponse) {
    return next;
  }

  return compactObject({
    ...next,
    captchaResponse,
    recaptchaVersion: recaptchaVersion ?? DEFAULT_FIREBASE_RECAPTCHA_VERSION,
  });
}

function requireUserId(http: HttpClient): string {
  const userId = http.getSession().userId;

  if (!userId) {
    throw new PopopoConfigurationError(
      "No userId is available. Sign in first or set `session.userId` explicitly.",
    );
  }

  return userId;
}

function requireFirebaseBearerToken(http: HttpClient): string {
  const token = http.getSession().firebaseIdToken ?? http.getSession().bearerToken;

  if (!token) {
    throw new PopopoConfigurationError(
      "No Firebase ID token is available. Sign in first or set `session.firebaseIdToken` explicitly.",
    );
  }

  return token;
}

function flattenHomeDisplaySpaces(
  response: HomeDisplaySpacesResponse,
): HomeDisplaySpace[] {
  return Array.isArray(response.spaces) ? response.spaces : [];
}

function flattenHomeDisplayLives(
  response: HomeDisplaySpacesResponse,
): LiveListItem[] {
  const lives: LiveListItem[] = [];

  for (const entry of flattenHomeDisplaySpaces(response)) {
    if (entry.live) {
      lives.push(entry.live);
    }

    if (entry.currentLive) {
      lives.push(entry.currentLive);
    }

    if (Array.isArray(entry.lives)) {
      lives.push(...entry.lives);
    }
  }

  if (Array.isArray(response.lives)) {
    lives.push(...response.lives);
  }

  return lives;
}

function parseFirestoreDocument<TFields = Record<string, unknown>>(
  payload: Record<string, unknown>,
): FirestoreDocument<TFields> {
  const name = requiredString(payload, ["name"]);
  const fields = decodeFirestoreFields(payload.fields) as TFields;

  return {
    name,
    createTime: optionalString(payload.createTime),
    updateTime: optionalString(payload.updateTime),
    fields,
    raw: payload,
  };
}

function parseFirestoreDocumentList<TFields = Record<string, unknown>>(
  payload: Record<string, unknown>,
): {
  documents: FirestoreDocument<TFields>[];
  nextPageToken?: string;
  raw: Record<string, unknown>;
} {
  const documents = Array.isArray(payload.documents)
    ? payload.documents
        .filter((value): value is Record<string, unknown> =>
          Boolean(value) && typeof value === "object"
        )
        .map((value) => parseFirestoreDocument<TFields>(value))
    : [];

  return {
    documents,
    nextPageToken: optionalString(payload.nextPageToken),
    raw: payload,
  };
}

function parseLiveCommentList(payload: Record<string, unknown>): LiveCommentListResult {
  const parsed = parseFirestoreDocumentList(payload);

  return {
    comments: parsed.documents.map((document) => toLiveComment(document)),
    nextPageToken: parsed.nextPageToken,
    raw: parsed.raw,
  };
}

function parseSpaceMessageList(payload: Record<string, unknown>): SpaceMessageListResult {
  const parsed = parseFirestoreDocumentList(payload);

  return {
    messages: parsed.documents.map((document) => toSpaceMessage(document)),
    nextPageToken: parsed.nextPageToken,
    raw: parsed.raw,
  };
}

function toLiveComment(
  document: FirestoreDocument<Record<string, unknown>>,
): LiveComment {
  const record = document.fields;

  return {
    id: lastPathSegment(document.name),
    documentPath: document.name,
    kind: optionalString(record.kind),
    value: optionalString(record.value),
    createdAt: toFiniteNumber(record.created_at),
    updatedAt: toFiniteNumber(record.updated_at),
    priority: toFiniteNumber(record.priority),
    user: (record.user && typeof record.user === "object")
      ? normalizeLiveCommentUser(record.user as Record<string, unknown>)
      : undefined,
    raw: document,
    ...record,
  };
}

function normalizeLiveCommentUser(
  user: Record<string, unknown>,
): Record<string, unknown> {
  return compactObject({
    ...user,
    id: optionalString(user.id),
    name: optionalString(user.name),
    alias: optionalString(user.alias),
    icon: optionalString(user.icon),
    firstNominatedSelectionId: optionalString(user.first_nominated_selection_id),
    onlineSpaceId: optionalString(user.online_space_id),
  });
}

function toSpaceMessage(
  document: FirestoreDocument<Record<string, unknown>>,
): SpaceMessage {
  const record = document.fields;

  return {
    id: lastPathSegment(document.name),
    documentPath: document.name,
    kind: optionalString(record.kind),
    value: optionalString(record.value),
    createdAt: toFiniteNumber(record.created_at),
    updatedAt: toFiniteNumber(record.updated_at),
    user: (record.user && typeof record.user === "object")
      ? normalizeLiveCommentUser(record.user as Record<string, unknown>)
      : undefined,
    raw: document,
    ...record,
  };
}

function isIgnorableConnectionInfoError(error: unknown): error is PopopoApiError {
  return error instanceof PopopoApiError &&
    (error.status === 401 || error.status === 403);
}

async function resolveLiveContext(
  runtime: ClientRuntime,
  input: {
    spaceKey?: string;
    liveId?: string;
    request?: HomeDisplaySpacesRequest;
    query?: RequestQuery;
  },
): Promise<{ spaceKey: string; liveId: string }> {
  const session = runtime.http.getSession();
  const sessionSpaceKey = session.currentSpaceKey;
  const spaceKey = input.spaceKey ?? sessionSpaceKey;
  const liveId = input.liveId ??
    (spaceKey && sessionSpaceKey && spaceKey === sessionSpaceKey
      ? session.currentLiveId
      : undefined);

  if (spaceKey && liveId) {
    return { spaceKey, liveId };
  }

  if (!spaceKey) {
    throw new PopopoConfigurationError(
      "No live context is available. Pass --space-key/--live-id or run `uset lives enter` first.",
    );
  }

  const lives = new LivesClient(runtime);
  const current = await lives.getCurrentBySpaceKey(
    spaceKey,
    input.request,
    input.query,
  );
  const currentLiveId = current?.liveId ?? current?.id;

  if (!currentLiveId) {
    throw new PopopoConfigurationError(
      `No current live was found for space ${spaceKey}.`,
    );
  }

  runtime.http.setSession({
    currentSpaceKey: spaceKey,
    currentLiveId,
  });

  return {
    spaceKey,
    liveId: currentLiveId,
  };
}

function lastPathSegment(path: string): string {
  const segments = path.split("/");
  return segments[segments.length - 1] ?? path;
}

function decodeFirestoreFields(fields: unknown): Record<string, unknown> {
  if (!fields || typeof fields !== "object") {
    return {};
  }

  const decoded: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(fields as Record<string, unknown>)) {
    decoded[key] = decodeFirestoreValue(value);
  }

  return decoded;
}

function decodeFirestoreValue(value: unknown): unknown {
  if (!value || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;

  if ("nullValue" in record) {
    return null;
  }

  if ("booleanValue" in record) {
    return record.booleanValue;
  }

  if ("stringValue" in record) {
    return record.stringValue;
  }

  if ("timestampValue" in record) {
    return record.timestampValue;
  }

  if ("referenceValue" in record) {
    return record.referenceValue;
  }

  if ("bytesValue" in record) {
    return record.bytesValue;
  }

  if ("integerValue" in record) {
    return toFirestoreNumber(record.integerValue);
  }

  if ("doubleValue" in record) {
    return toFirestoreNumber(record.doubleValue);
  }

  if ("geoPointValue" in record && typeof record.geoPointValue === "object") {
    return { ...(record.geoPointValue as Record<string, unknown>) };
  }

  if ("arrayValue" in record) {
    const values = (record.arrayValue as Record<string, unknown>)?.values;

    if (!Array.isArray(values)) {
      return [];
    }

    return values.map((item) => decodeFirestoreValue(item));
  }

  if ("mapValue" in record) {
    return decodeFirestoreFields((record.mapValue as Record<string, unknown>)?.fields);
  }

  return record;
}

function toFirestoreNumber(value: unknown): number | string | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}

function decodeTencentCompactToken(
  value: string | undefined,
): TencentTlsCompactToken | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const normalized = normalizeTencentCompactBase64(value);
    const decoded = inflateSync(Buffer.from(normalized, "base64")).toString("utf8");
    const parsed = JSON.parse(decoded);

    return parsed && typeof parsed === "object"
      ? parsed as TencentTlsCompactToken
      : undefined;
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

function extractInviteKey(input: string): string {
  const trimmed = input.trim();

  if (!trimmed) {
    throw new PopopoConfigurationError("Invite key is empty.");
  }

  if (!/^[a-z]+:\/\//i.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    const match = url.pathname.match(/\/invites\/([^/]+)/i);

    if (!match?.[1]) {
      throw new PopopoConfigurationError(`Unable to extract invite key from URL: ${trimmed}`);
    }

    return decodeURIComponent(match[1]);
  } catch (error) {
    if (error instanceof PopopoConfigurationError) {
      throw error;
    }

    throw new PopopoConfigurationError(`Invalid invite URL: ${trimmed}`);
  }
}

function buildTencentTrtcPlayUrl(input: {
  sdkAppId: number;
  userId: string;
  userSig: string;
  streamName: string;
}): string {
  const query = new URLSearchParams({
    sdkappid: String(input.sdkAppId),
    userId: input.userId,
    usersig: input.userSig,
    appscene: DEFAULT_TENCENT_TRTC_PLAY_APP_SCENE,
  });

  return `trtc://${DEFAULT_TENCENT_TRTC_PLAY_HOST}/play/${encodeURIComponent(input.streamName)}?${query.toString()}`;
}

function buildTencentLivePlaybackUrl(
  streamName: string,
  extension: "flv" | "m3u8",
): string {
  return `https://${DEFAULT_TENCENT_LIVE_PLAY_HOST}/${DEFAULT_TENCENT_LIVE_PLAY_PATH}/${encodeURIComponent(streamName)}.${extension}`;
}

function buildTencentLiveRtmpUrl(streamName: string): string {
  return `rtmp://${DEFAULT_TENCENT_LIVE_PLAY_HOST}/${DEFAULT_TENCENT_LIVE_PLAY_PATH}/${encodeURIComponent(streamName)}`;
}

function normalizeCoinBalances(value: unknown): Record<string, number> {
  const balances: Record<string, number> = {};

  if (Array.isArray(value)) {
    for (const item of value) {
      if (!item || typeof item !== "object") {
        continue;
      }

      const record = item as Record<string, unknown>;
      const rawName =
        record.scope ??
        record.kind ??
        record.type ??
        record.name ??
        record.label ??
        record.id;
      const amount =
        toFiniteNumber(record.balance) ??
        toFiniteNumber(record.amount) ??
        toFiniteNumber(record.coin) ??
        toFiniteNumber(record.coins) ??
        toFiniteNumber(record.value);

      if (typeof rawName === "string" && amount !== undefined) {
        balances[rawName] = amount;
      }
    }

    return balances;
  }

  if (!value || typeof value !== "object") {
    return balances;
  }

  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const amount =
      toFiniteNumber(entry) ??
      (entry && typeof entry === "object"
        ? toFiniteNumber((entry as Record<string, unknown>).balance) ??
          toFiniteNumber((entry as Record<string, unknown>).amount) ??
          toFiniteNumber((entry as Record<string, unknown>).value)
        : undefined);

    if (amount !== undefined) {
      balances[key] = amount;
    }
  }

  return balances;
}

function pickNamedCoinBalance(
  balances: Record<string, number>,
  token: string,
): number | undefined {
  const lowered = token.toLowerCase();

  for (const [key, value] of Object.entries(balances)) {
    if (key.toLowerCase().includes(lowered)) {
      return value;
    }
  }

  return undefined;
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function requireTsoFileApiBaseUrl(config: TsoClientConfig): string {
  if (!config.fileApiBaseUrl) {
    throw new PopopoConfigurationError(
      "TSO file API base URL is not configured. Set `tso.fileApiBaseUrl` first.",
    );
  }

  return config.fileApiBaseUrl;
}

function requiredString(
  payload: Record<string, unknown>,
  keys: string[],
): string {
  for (const key of keys) {
    const value = payload[key];

    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  throw new PopopoConfigurationError(
    `Response payload does not contain a required string field: ${keys.join(", ")}`,
  );
}

function requiredNumber(
  payload: Record<string, unknown>,
  keys: string[],
): number {
  for (const key of keys) {
    const value = payload[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  throw new PopopoConfigurationError(
    `Response payload does not contain a required numeric field: ${keys.join(", ")}`,
  );
}

function optionalNumber(
  payload: Record<string, unknown>,
  keys: string[],
): number | undefined {
  for (const key of keys) {
    const value = payload[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return undefined;
}

function maybeToFirebaseSession(
  payload: Record<string, unknown>,
): FirebaseAuthSession | undefined {
  const hasIdToken = typeof payload.idToken === "string" || typeof payload.id_token === "string";
  const hasRefreshToken =
    typeof payload.refreshToken === "string" || typeof payload.refresh_token === "string";
  const hasLocalId = typeof payload.localId === "string" || typeof payload.user_id === "string";

  if (!hasIdToken || !hasRefreshToken || !hasLocalId) {
    return undefined;
  }

  return toFirebaseSession(payload);
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function requireDefined<T>(
  value: T | undefined,
  field: string,
): T {
  if (value === undefined || value === null || value === "") {
    throw new PopopoConfigurationError(`Missing required credential field: ${field}`);
  }

  return value;
}

function compactObject(
  record: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) {
      next[key] = value;
    }
  }

  return next;
}

function compactStringRecord(
  record: Record<string, string | undefined>,
): Record<string, string> {
  const next: Record<string, string> = {};

  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) {
      next[key] = value;
    }
  }

  return next;
}
