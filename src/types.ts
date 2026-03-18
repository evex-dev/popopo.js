export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue | undefined;
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (...args: infer TArgs) => infer TResult
    ? (...args: TArgs) => TResult
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

export interface AuthState {
  bearerToken?: string;
  refreshToken?: string;
  firebaseIdToken?: string;
  appCheckToken?: string;
  cookie?: string;
  userId?: string;
  email?: string;
  currentSpaceKey?: string;
  currentLiveId?: string;
}

export interface FirebaseClientConfig {
  apiKey: string;
  authBaseUrl: string;
  firestoreBaseUrl: string;
  secureTokenBaseUrl: string;
  authDomain: string;
  appId: string;
  projectId: string;
  storageBucket: string;
  webClientId: string;
  returnSecureToken: boolean;
  tenantId?: string;
}

export interface TsoClientConfig {
  oauthBaseUrl: string;
  fileApiBaseUrl?: string;
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
}

export interface UserProfile {
  id?: string;
  userId?: string;
  email?: string;
  alias?: string;
  displayName?: string;
  anotherName?: string;
  iconSource?: string;
  ownerUserId?: string;
  photoUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface AccountProfilePatch {
  alias?: string;
  displayName?: string;
  anotherName?: string;
  iconSource?: string;
  ownerUserId?: string;
  photoUrl?: string;
  [key: string]: unknown;
}

export interface AccountRegisterResult {
  result?: boolean;
  [key: string]: unknown;
}

export type PushDeviceSystem = "dummy" | "android" | "ios";

export interface PushDeviceUpsertRequest {
  deviceName: string;
  system: PushDeviceSystem;
  app: string;
  [key: string]: unknown;
}

export interface PushDeviceUpsertResult {
  result?: boolean;
  [key: string]: unknown;
}

export type CallPushKind = "user-call" | "space-friends-call" | "live-follower-call";

export interface UserCallPushRequest {
  kind: "user-call";
  spaceKey: string;
  userId: string;
  [key: string]: unknown;
}

export interface SpaceFriendsCallPushRequest {
  kind: "space-friends-call";
  spaceKey: string;
  [key: string]: unknown;
}

export interface LiveFollowerCallPushRequest {
  kind: "live-follower-call";
  spaceKey: string;
  liveId: string;
  [key: string]: unknown;
}

export type CallPushCreateRequest =
  | UserCallPushRequest
  | SpaceFriendsCallPushRequest
  | LiveFollowerCallPushRequest;

export interface CallPushCreateResult {
  result?: boolean;
  pushId?: string;
  id?: string;
  [key: string]: unknown;
}

export interface Space {
  id?: string;
  spaceKey?: string;
  userId?: string;
  slug?: string;
  name?: string;
  title?: string;
  description?: string;
  onlineUsers?: string[];
  nonMuteOnlineUserCount?: number;
  bgm?: Record<string, unknown>;
  background?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface LiveListItem {
  id?: string;
  liveId?: string;
  spaceId?: string;
  spaceKey?: string;
  userId?: string;
  token?: string;
  genreId?: string;
  tags?: string[];
  canEnter?: boolean;
  currentCount?: number;
  selectionRecruiting?: boolean;
  createdAt?: number;
  slug?: string;
  title?: string;
  name?: string;
  description?: string;
  status?: string;
  startedAt?: string;
  endedAt?: string;
  scheduledStartAt?: string;
  viewerCount?: number;
  thumbnailUrl?: string;
  [key: string]: unknown;
}

export interface LiveEnterResult {
  spaceKey: string;
  liveId: string;
  live: LiveListItem;
}

export interface TencentTlsCompactToken {
  "TLS.identifier"?: string;
  "TLS.sdkappid"?: string;
  "TLS.time"?: number;
  "TLS.expire"?: number;
  "TLS.userbuf"?: string;
  "TLS.ver"?: string;
  "TLS.sig"?: string;
  [key: string]: unknown;
}

export interface LiveReceiveInfo {
  spaceKey: string;
  liveId: string;
  streamName?: string;
  liveToken?: string;
  taskId?: string;
  liveStatus?: string;
  playbackDomain?: string;
  liveFlvUrl?: string;
  liveHlsUrl?: string;
  liveRtmpUrl?: string;
  sdkAppId?: number;
  userId?: string;
  userSig?: string;
  privateMapKey?: string;
  trtcPlayUrl?: string;
  decodedUserSig?: TencentTlsCompactToken;
  decodedPrivateMapKey?: TencentTlsCompactToken;
  liveDocumentPath?: string;
  liveDocument?: FirestoreDocument<Record<string, unknown>>;
  connectionInfo?: Record<string, unknown>;
  connectionInfoError?: {
    statusCode?: number;
    message: string;
  };
}

export interface LiveAudioStream {
  url: string;
  contentType?: string;
  response: Response;
  stream: ReadableStream<Uint8Array>;
  receiveInfo: LiveReceiveInfo;
  cancel: () => void;
}

export type LiveSelectionKind = "message" | "talk" | "unknown" | (string & {});
export type LiveSelectionStatus = "published" | "finished" | (string & {});

export interface LiveSelection {
  id: string;
  selectionId: string;
  documentPath: string;
  kind?: LiveSelectionKind;
  title?: string;
  status?: LiveSelectionStatus;
  participants?: unknown[];
  createdAt?: number;
  updatedAt?: number;
  raw: FirestoreDocument<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface LiveSelectionCreateRequest {
  kind: LiveSelectionKind;
  title?: string;
  [key: string]: unknown;
}

export interface LiveSelectionCreateResult {
  id?: string;
  selectionId?: string;
  [key: string]: unknown;
}

export interface LiveSelectionListOptions {
  limit?: number;
  orderBy?: string;
  pageToken?: string;
}

export interface LiveSelectionListResult {
  selections: LiveSelection[];
  nextPageToken?: string;
  raw: Record<string, unknown>;
}

export interface LiveSelectionParticipantUser {
  id?: string;
  name?: string;
  alias?: string;
  icon?: string;
  onlineSpaceId?: string;
  [key: string]: unknown;
}

export interface LiveSelectionParticipant {
  id: string;
  participantId: string;
  documentPath: string;
  value?: string;
  selected?: boolean;
  displaying?: boolean;
  user?: LiveSelectionParticipantUser;
  createdAt?: number;
  updatedAt?: number;
  raw: FirestoreDocument<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface LiveSelectionParticipantListOptions {
  limit?: number;
  orderBy?: string;
  pageToken?: string;
}

export interface LiveSelectionParticipantListResult {
  participants: LiveSelectionParticipant[];
  nextPageToken?: string;
  raw: Record<string, unknown>;
}

export interface LiveSelectionSequenceStartResult {
  sequenceId?: string;
  [key: string]: unknown;
}

export interface SpaceCreateRequest {
  name: string;
  backgroundId: string;
  [key: string]: unknown;
}

export interface SpaceCreateResult {
  spaceKey: string;
  [key: string]: unknown;
}

export interface SpaceConnectionRequest {
  muted: boolean;
  [key: string]: unknown;
}

export interface SpaceConnectResult {
  spaceKey: string;
  muted: boolean;
  connectionInfo?: Record<string, unknown>;
  connection?: Record<string, unknown>;
}

export interface LiveCommentUser {
  id?: string;
  name?: string;
  alias?: string;
  icon?: string;
  firstNominatedSelectionId?: string;
  onlineSpaceId?: string;
  [key: string]: unknown;
}

export interface LiveComment {
  id: string;
  documentPath: string;
  kind?: string;
  value?: string;
  createdAt?: number;
  updatedAt?: number;
  priority?: number;
  user?: LiveCommentUser;
  raw: FirestoreDocument<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface LiveCommentCreateRequest {
  kind: string;
  value?: string;
  [key: string]: unknown;
}

export interface LiveCommentListOptions {
  limit?: number;
  orderBy?: string;
  pageToken?: string;
}

export interface LiveCommentListResult {
  comments: LiveComment[];
  nextPageToken?: string;
  raw: Record<string, unknown>;
}

export interface SpaceMessageUser {
  id?: string;
  name?: string;
  alias?: string;
  icon?: string;
  onlineSpaceId?: string;
  [key: string]: unknown;
}

export interface SpaceMessage {
  id: string;
  documentPath: string;
  kind?: string;
  value?: string;
  createdAt?: number;
  updatedAt?: number;
  user?: SpaceMessageUser;
  raw: FirestoreDocument<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface SpaceMessageCreateRequest {
  kind: string;
  value?: string;
  [key: string]: unknown;
}

export interface SpaceMessageListOptions {
  limit?: number;
  orderBy?: string;
  pageToken?: string;
}

export interface SpaceMessageListResult {
  messages: SpaceMessage[];
  nextPageToken?: string;
  raw: Record<string, unknown>;
}

export interface LiveStartRequest {
  genreId: string;
  tags: string[];
  canEnter: boolean;
  [key: string]: unknown;
}

export interface LiveStartResult {
  id: string;
  [key: string]: unknown;
}

export interface HomeDisplaySpace {
  space?: Space;
  live?: LiveListItem;
  thumbnail?: Record<string, unknown>;
  id?: string;
  spaceId?: string;
  spaceKey?: string;
  slug?: string;
  name?: string;
  title?: string;
  lives?: LiveListItem[];
  currentLive?: LiveListItem;
  [key: string]: unknown;
}

export interface HomeDisplaySpacesResponse {
  spaces?: HomeDisplaySpace[];
  pins?: Record<string, unknown>[];
  lives?: LiveListItem[];
  totalCount?: number;
  [key: string]: unknown;
}

export interface HomeDisplaySpacesRequest {
  kind?: string;
  category?: string;
  [key: string]: unknown;
}

export interface SpaceLiveListRequest {
  genreId: string;
  tags: string[];
  canEnter: boolean;
  selectionRecruiting: boolean;
  latestStartedAt?: number;
  latestCurrentMax?: number;
  latestOverallCount?: number;
  [key: string]: unknown;
}

export interface FirestoreDocument<TFields = Record<string, unknown>> {
  name: string;
  createTime?: string;
  updateTime?: string;
  fields: TFields;
  raw: Record<string, unknown>;
}

export interface UserPrivateData {
  coinBalances?: unknown;
  coinTransaction?: unknown;
  [key: string]: unknown;
}

export interface CoinBalanceSnapshot {
  userId: string;
  documentPath: string;
  paidCoins?: number;
  freeCoins?: number;
  coinBalances: Record<string, number>;
  userPrivateData: UserPrivateData;
  rawDocument: FirestoreDocument<UserPrivateData>;
}

export interface Invite {
  kind?: string;
  code?: string;
  id?: string;
  inviterId?: string;
  spaceId?: string;
  spaceKey?: string;
  userId?: string;
  status?: string;
  [key: string]: unknown;
}

export interface InviteAcceptResult {
  kind?: string;
  inviteKey: string;
  inviteInfo: Invite;
  spaceKey?: string;
  response: unknown;
  [key: string]: unknown;
}

export interface NotificationItem {
  id?: string;
  documentPath?: string;
  type?: string;
  title?: string;
  body?: string;
  read?: boolean;
  createdAt?: string | number | null;
  updatedAt?: string | number | null;
  rawDocument?: FirestoreDocument<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface PersonalNotificationData extends NotificationItem {
  personalNotificationId?: string;
  kind?: string;
  icon?: string;
  unreadAt?: string | number | null;
  readAt?: string | number | null;
  deliveredAt?: string | number | null;
  receivedAt?: string | number | null;
  scheduledDeliveryAt?: string | number | null;
  imageUrl?: string;
  thumbnailUrl?: string;
  transitionUrl?: string;
  source?: PersonalNotificationSource;
  deliveryContent?: PersonalNotificationDeliveryState;
  [key: string]: unknown;
}

export interface PersonalNotificationSource {
  kind?: string;
  welcomeDeliveryMasterId?: string;
  bulkDeliveryMasterId?: string;
  subscriptionItemGrantMasterId?: string;
  [key: string]: unknown;
}

export interface PersonalNotificationDeliveryState {
  expireAt?: string | number | null;
  receivedAt?: string | number | null;
  [key: string]: unknown;
}

export interface PersonalNotificationDeliveryContent {
  result?: boolean;
  title?: string;
  body?: string;
  receivedAt?: string | null;
  imageUrl?: string;
  thumbnailUrl?: string;
  transitionUrl?: string;
  [key: string]: unknown;
}

export type ReceivePersonalNotificationDeliveryContentStatus = "received";

export interface ReceivePersonalNotificationDeliveryContentRequest {
  status?: ReceivePersonalNotificationDeliveryContentStatus;
  [key: string]: unknown;
}

export interface SystemNotificationData extends NotificationItem {
  systemNotificationId?: string;
  unreadAt?: string | number | null;
  readAt?: string | number | null;
  displayPeriodStartAt?: string | number | null;
  hasSeenLaunchPopup?: boolean;
  imageUrl?: string;
  transitionUrl?: string;
  [key: string]: unknown;
}

export interface FirebaseEmailPasswordCredentials {
  email: string;
  password: string;
  captchaResponse?: string;
  clientType?: string;
  recaptchaVersion?: string;
}

export interface FirebaseEmailPasswordSignUpRequest
  extends FirebaseEmailPasswordCredentials {
  displayName?: string;
  persistSession?: boolean;
}

export interface FirebaseEmailPasswordSignInRequest
  extends FirebaseEmailPasswordCredentials {
  persistSession?: boolean;
}

export interface FirebaseCustomTokenSignInRequest {
  token: string;
  persistSession?: boolean;
}

export interface FirebaseAnonymousSignInRequest {
  persistSession?: boolean;
}

export interface FirebaseIdpCredentialInput {
  providerId: string;
  oauthIdToken?: string;
  oauthAccessToken?: string;
  oauthTokenSecret?: string;
  authCode?: string;
  nonce?: string;
  identifier?: string;
}

export interface FirebaseIdpSignInRequest {
  requestUri?: string;
  postBody: string;
  returnIdpCredential?: boolean;
  returnSecureToken?: boolean;
  autoCreate?: boolean;
  idToken?: string;
  pendingToken?: string;
  sessionId?: string;
  captchaResponse?: string;
  tenantId?: string;
  persistSession?: boolean;
}

export interface FirebaseIdpLinkRequest extends FirebaseIdpCredentialInput {
  idToken?: string;
  requestUri?: string;
  returnIdpCredential?: boolean;
  returnSecureToken?: boolean;
  autoCreate?: boolean;
  pendingToken?: string;
  sessionId?: string;
  tenantId?: string;
  persistSession?: boolean;
}

export interface FirebaseAuthSession {
  kind?: string;
  idToken: string;
  refreshToken: string;
  expiresIn: number;
  localId: string;
  email?: string;
  displayName?: string;
  registered?: boolean;
  photoUrl?: string;
  raw: Record<string, unknown>;
}

export interface FirebaseIdpLinkResult {
  session?: FirebaseAuthSession;
  providerId?: string;
  email?: string;
  rawUserInfo?: string;
  isNewUser?: boolean;
  needConfirmation?: boolean;
  pendingToken?: string;
  tenantId?: string;
  errorMessage?: string;
  raw: Record<string, unknown>;
}

export interface FirebaseFlutterCredentialRequest {
  token?: number;
  signInMethod:
    | "twitter.com"
    | "playgames.google.com"
    | "google.com"
    | "facebook.com"
    | "oauth"
    | "phone"
    | "password"
    | "github.com"
    | "emailLink";
  providerId?: string;
  secret?: string;
  idToken?: string;
  accessToken?: string;
  rawNonce?: string;
  verificationId?: string;
  smsCode?: string;
  email?: string;
  emailLink?: string;
  serverAuthCode?: string;
  captchaResponse?: string;
  clientType?: string;
  recaptchaVersion?: string;
  persistSession?: boolean;
}

export interface FirebaseTokenRefreshResponse {
  accessToken: string;
  expiresIn: number;
  idToken: string;
  projectId?: string;
  refreshToken: string;
  tokenType?: string;
  userId: string;
  raw: Record<string, unknown>;
}

export interface FirebaseAccountInfo {
  localId?: string;
  email?: string;
  emailVerified?: boolean;
  displayName?: string;
  photoUrl?: string;
  providerUserInfo?: unknown[];
  passwordHash?: string;
  passwordUpdatedAt?: number;
  validSince?: string;
  lastLoginAt?: string;
  createdAt?: string;
  customAuth?: boolean;
  [key: string]: unknown;
}

export interface FirebaseLookupResponse {
  kind?: string;
  users?: FirebaseAccountInfo[];
  raw: Record<string, unknown>;
}

export interface FirebasePhoneVerificationCodeRequest {
  phoneNumber: string;
  recaptchaToken?: string;
  playIntegrityToken?: string;
  captchaResponse?: string;
  clientType?: string;
  recaptchaVersion?: string;
  appSignatureHash?: string;
  tenantId?: string;
}

export interface FirebaseVerifyPhoneNumberRequest {
  phoneNumber?: string;
  timeoutMs: number;
  forceResendingToken?: number;
  autoRetrievedSmsCodeForTesting?: string;
  multiFactorSessionId?: string;
  multiFactorInfoUid?: string;
  recaptchaToken?: string;
  playIntegrityToken?: string;
  captchaResponse?: string;
  clientType?: string;
  recaptchaVersion?: string;
  appSignatureHash?: string;
  tenantId?: string;
}

export interface FirebasePhoneVerificationSession {
  sessionInfo: string;
  raw: Record<string, unknown>;
}

export interface FirebasePhoneVerificationEvent {
  name:
    | "Auth#phoneCodeSent"
    | "Auth#phoneCodeAutoRetrievalTimeout"
    | "Auth#phoneVerificationCompleted"
    | "Auth#phoneVerificationFailed";
  verificationId?: string;
  forceResendingToken?: number;
  token?: number;
  smsCode?: string;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
  raw: Record<string, unknown>;
}

export interface FirebasePhoneLinkRequest {
  idToken?: string;
  sessionInfo?: string;
  code?: string;
  phoneNumber?: string;
  temporaryProof?: string;
  operation?: number;
  tenantId?: string;
  persistSession?: boolean;
}

export interface FirebasePhoneAuthResult {
  session?: FirebaseAuthSession;
  phoneNumber?: string;
  temporaryProof?: string;
  temporaryProofExpiresIn?: number;
  verificationProof?: string;
  verificationProofExpiresIn?: number;
  isNewUser?: boolean;
  raw: Record<string, unknown>;
}

export interface FirebaseProfileUpdateRequest {
  idToken?: string;
  displayName?: string;
  photoUrl?: string;
  password?: string;
  deleteAttribute?: Array<"DISPLAY_NAME" | "PHOTO_URL">;
  deleteProvider?: string[];
  returnSecureToken?: boolean;
  tenantId?: string;
  persistSession?: boolean;
}

export interface FirebaseSendOobCodeRequest {
  requestType: "VERIFY_EMAIL" | "PASSWORD_RESET" | "EMAIL_SIGNIN";
  email?: string;
  idToken?: string;
  continueUrl?: string;
  dynamicLinkDomain?: string;
  canHandleCodeInApp?: boolean;
  languageCode?: string;
  tenantId?: string;
  captchaResponse?: string;
}

export interface TsoAuthorizationCodeRequest {
  code: string;
  codeVerifier: string;
  redirectUri?: string;
  clientId?: string;
  clientSecret?: string;
}

export interface TsoRefreshTokenRequest {
  refreshToken: string;
  clientId?: string;
  clientSecret?: string;
}

export interface TsoOAuthTokenResponse {
  tokenType?: string;
  expiresIn: number;
  accessToken: string;
  refreshToken?: string;
  scope?: string;
  raw: Record<string, unknown>;
}

export interface UserDisplayNameChangeRequest {
  userId: string;
  displayName: string;
}

export interface UserAnotherNameChangeRequest {
  userId: string;
  anotherName: string;
}

export interface UserIconSourceChangeRequest {
  userId: string;
  iconSource: string;
}

export interface OwnerUserIdChangeRequest {
  userId: string;
}

export interface SceneLoadRequest {}

export interface SequencePlayStartRequest {
  jsonPath: string;
}

export interface SequenceRecordingStartRequest {
  sequenceName: string;
}

export enum NameplateDisplayPositionType {
  Left = 0,
  Right = 1,
  Center = 2,
}

export interface NameplateNormalDisplayedMessage {
  id: string;
  positionType: NameplateDisplayPositionType;
}

export interface NameplateSpecialDisplayedMessage {
  id: string;
  nameplateTemplateId: string;
}

export interface TsoFileFetchOptions {
  clientId?: string;
  isModifierEnabled?: boolean;
}

export interface TsoFileStatusOptions {
  clientId?: string;
}
