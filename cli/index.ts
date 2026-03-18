#!/usr/bin/env bun

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_FIREBASE_AUTH_BASE_URL,
  DEFAULT_FIREBASE_SECURE_TOKEN_BASE_URL,
  DEFAULT_POPOPO_API_BASE_URL,
  DEFAULT_POPOPO_BASE_URL,
  PopopoApiError,
  PopopoClient,
  type AccountProfilePatch,
  type AuthState,
  type RequestQuery,
} from "../index.ts";

type GlobalOptions = {
  json: boolean;
  stringsPath: string;
  sessionFile: string;
  baseUrl?: string;
  apiBaseUrl?: string;
  apiKey?: string;
  authBaseUrl?: string;
  secureTokenBaseUrl?: string;
  tsoOauthBaseUrl?: string;
  tsoFileApiBaseUrl?: string;
  tsoClientId?: string;
  tsoClientSecret?: string;
  tsoRedirectUri?: string;
};

type ParsedArgs = {
  command: string[];
  options: Map<string, string[]>;
};

type ResourceStrings = Record<string, string>;

const cliDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(cliDir, "../..");
const legacyStringsPath = resolve(repoRoot, "jadx_out/resources/res/values/strings.xml");
const extractedStringsPath = resolve(
  repoRoot,
  "extracted/jadx_out/resources/res/values/strings.xml",
);
const defaultStringsPath = existsSync(legacyStringsPath)
  ? legacyStringsPath
  : extractedStringsPath;
const defaultSessionFile = resolve(repoRoot, ".uset-session.json");

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.command.length === 0 || hasFlag(parsed.options, "help")) {
    printHelp();
    return;
  }

  const globalOptions = parseGlobalOptions(parsed.options);
  const resources = await loadResourceStrings(globalOptions.stringsPath);
  const session = await loadSession(globalOptions.sessionFile);
  const client = createClient(globalOptions, resources, session);

  const result = await dispatchCommand(parsed.command, parsed.options, client, {
    globalOptions,
    session,
  });

  await persistSession(globalOptions.sessionFile, client.getSession());
  printResult(result, globalOptions.json);
}

async function dispatchCommand(
  command: string[],
  options: Map<string, string[]>,
  client: PopopoClient,
  context: {
    globalOptions: GlobalOptions;
    session: AuthState;
  },
): Promise<unknown> {
  const [head, second, third, fourth] = command;

  switch (head) {
    case "anonymous":
      return runAnonymousSignIn(client, options);
    case "signup":
      return runSignUp(client, options, context.globalOptions);
    case "signin":
      return runSignIn(client, options);
    case "verify-phone-number":
      return client.auth.verifyPhoneNumber(buildVerifyPhoneNumberRequest(options));
    case "signout":
      client.clearSession();
      return { ok: true, sessionCleared: true };
    case "lookup":
      return client.auth.lookup(requireOption(options, "id-token", {
        fallback: client.getSession().firebaseIdToken ?? client.getSession().bearerToken,
      }));
    case "me":
      return client.accounts.getMe();
    case "auth":
      return runAuthSubcommand(
        second,
        third,
        fourth,
        client,
        options,
        context.globalOptions,
      );
    case "user":
    case "users":
      return runUserSubcommand(second, third, client, options);
    case "coins":
    case "coin":
      return runCoinsSubcommand(second, client, options);
    case "lives":
      return runLivesSubcommand(second, client, options);
    case "spaces":
      return runSpacesSubcommand(second, client, options);
    case "invites":
      return runInvitesSubcommand(second, client, options);
    case "notifications":
      return runNotificationsSubcommand(second, client, options);
    case "tso":
      return runTsoSubcommand(second, client, options);
    default:
      throw new Error(`Unknown command: ${command.join(" ")}`);
  }
}

async function runAuthSubcommand(
  command: string | undefined,
  nested: string | undefined,
  extra: string | undefined,
  client: PopopoClient,
  options: Map<string, string[]>,
  globalOptions: GlobalOptions,
): Promise<unknown> {
  switch (command) {
    case "anonymous":
      return runAnonymousSignIn(client, options);
    case "signup":
      return runSignUp(client, options, globalOptions);
    case "signin":
      return runSignIn(client, options);
    case "sign-in-with-credential":
      return client.auth.signInWithCredential(buildFlutterCredentialRequest(options));
    case "lookup":
      return client.auth.lookup(requireOption(options, "id-token", {
        fallback: client.getSession().firebaseIdToken ?? client.getSession().bearerToken,
      }));
    case "upgrade":
      return runAuthUpgradeSubcommand(nested, client, options);
    case "verify-phone-number":
      return client.auth.verifyPhoneNumber(buildVerifyPhoneNumberRequest(options));
    case "phone":
      return runAuthPhoneSubcommand(nested, extra, client, options);
    case "signout":
      client.clearSession();
      return { ok: true, sessionCleared: true };
    default:
      throw new Error("Unknown auth subcommand.");
  }
}

async function runAuthUpgradeSubcommand(
  command: string | undefined,
  client: PopopoClient,
  options: Map<string, string[]>,
): Promise<unknown> {
  switch (command) {
    case "google":
      return client.auth.linkWithIdp(buildIdpUpgradeRequest("google.com", options));
    case "apple":
      return client.auth.linkWithIdp(buildIdpUpgradeRequest("apple.com", options));
    case "phone":
      return client.auth.linkWithPhoneNumber({
        idToken: getSingleOption(options, "id-token"),
        sessionInfo: getSingleOption(options, "session-info"),
        code: getSingleOption(options, "code"),
        phoneNumber: getSingleOption(options, "phone-number"),
        temporaryProof: getSingleOption(options, "temporary-proof"),
        operation: parseOptionalNumberOption(options, "operation"),
        tenantId: getSingleOption(options, "tenant-id"),
        persistSession: !hasFlag(options, "no-persist"),
      });
    default:
      throw new Error("Unknown auth upgrade subcommand.");
  }
}

async function runAuthPhoneSubcommand(
  command: string | undefined,
  nested: string | undefined,
  client: PopopoClient,
  options: Map<string, string[]>,
): Promise<unknown> {
  if (command === "send-code") {
    return client.auth.verifyPhoneNumber(buildVerifyPhoneNumberRequest(options));
  }

  if (command === "upgrade" && nested === "phone") {
    return runAuthUpgradeSubcommand("phone", client, options);
  }

  throw new Error("Unknown auth phone subcommand.");
}

async function runUserSubcommand(
  command: string | undefined,
  nested: string | undefined,
  client: PopopoClient,
  options: Map<string, string[]>,
): Promise<unknown> {
  if (command === "get") {
    const userId = requireOption(options, "user-id");
    return client.accounts.getById(userId);
  }

  if (command === "update") {
    const patch = buildUserPatch(options);

    if (Object.keys(patch).length === 0) {
      throw new Error("No user patch fields were provided.");
    }

    return client.accounts.updateMe(patch);
  }

  if (command === "link-with-credential") {
    return client.auth.linkWithCredential(buildFlutterCredentialRequest(options));
  }

  if (command === "register") {
    return client.accounts.register();
  }

  if (command === "update-phone-number") {
    return client.auth.updatePhoneNumber({
      verificationId: requireOption(options, "verification-id", {
        fallback: getSingleOption(options, "session-info"),
      }),
      verificationCode: requireOption(options, "verification-code", {
        fallback: getSingleOption(options, "sms-code") ?? getSingleOption(options, "code"),
      }),
      idToken: getSingleOption(options, "id-token"),
      persistSession: !hasFlag(options, "no-persist"),
    });
  }

  if (command === "change" && nested === "display-name") {
    return client.accounts.changeDisplayName(requireOption(options, "display-name"));
  }

  if (command === "change" && nested === "another-name") {
    return client.accounts.changeAnotherName(requireOption(options, "another-name"));
  }

  if (command === "change" && nested === "icon-source") {
    return client.accounts.changeIconSource(requireOption(options, "icon-source"));
  }

  if (command === "change" && nested === "owner-user-id") {
    const userId = getSingleOption(options, "user-id");
    return userId
      ? client.accounts.changeOwnerUserId(userId)
      : client.accounts.changeOwnerUserId();
  }

  if (command === "me" || command === undefined) {
    return client.accounts.getMe();
  }

  throw new Error("Unknown user subcommand.");
}

async function runSpacesSubcommand(
  command: string | undefined,
  client: PopopoClient,
  options: Map<string, string[]>,
): Promise<unknown> {
  switch (command) {
    case "get":
      return client.spaces.getByKey(
        requireOption(options, "space-key"),
        buildHomeDisplaySpacesRequest(options),
        parseQueryOptions(options),
      );
    case "list":
    case undefined:
      return client.spaces.list(
        buildHomeDisplaySpacesRequest(options),
        parseQueryOptions(options),
      );
    case "current":
      return client.spaces.current(
        buildHomeDisplaySpacesRequest(options),
        parseQueryOptions(options),
      );
    case "connection-info":
      return client.spaces.connectionInfo(
        requireOption(options, "space-key"),
        buildRequestBody(options),
        parseQueryOptions(options),
      );
    default:
      throw new Error("Unknown spaces subcommand.");
  }
}

async function runLivesSubcommand(
  command: string | undefined,
  client: PopopoClient,
  options: Map<string, string[]>,
): Promise<unknown> {
  switch (command) {
    case "current":
      return client.lives.current(
        buildHomeDisplaySpacesRequest(options),
        parseQueryOptions(options),
      );
    case "get":
      return client.lives.getCurrentBySpaceKey(
        requireOption(options, "space-key"),
        buildHomeDisplaySpacesRequest(options),
        parseQueryOptions(options),
      );
    case "list":
    case undefined: {
      const spaceKey = getSingleOption(options, "space-key");

      if (spaceKey) {
        return client.lives.getBySpaceKey(
          spaceKey,
          buildHomeDisplaySpacesRequest(options),
          parseQueryOptions(options),
        );
      }

      return client.lives.list(
        buildHomeDisplaySpacesRequest(options),
        parseQueryOptions(options),
      );
    }
    default:
      throw new Error("Unknown lives subcommand.");
  }
}

async function runCoinsSubcommand(
  command: string | undefined,
  client: PopopoClient,
  options: Map<string, string[]>,
): Promise<unknown> {
  switch (command) {
    case "balance":
      return client.coins.getBalance(
        getSingleOption(options, "user-id") ?? client.getSession().userId,
      );
    case "user-private-data":
      return client.coins.getUserPrivateData(
        getSingleOption(options, "user-id") ?? client.getSession().userId,
      );
    default:
      throw new Error("Unknown coins subcommand.");
  }
}

async function runInvitesSubcommand(
  command: string | undefined,
  client: PopopoClient,
  options: Map<string, string[]>,
): Promise<unknown> {
  switch (command) {
    case "list":
      return client.invites.list(parseQueryOptions(options));
    case "get":
      return client.invites.getByCode(requireOption(options, "code"));
    case "accept":
      return client.invites.accept(requireOption(options, "code"));
    default:
      throw new Error("Unknown invites subcommand.");
  }
}

async function runNotificationsSubcommand(
  command: string | undefined,
  client: PopopoClient,
  options: Map<string, string[]>,
): Promise<unknown> {
  switch (command) {
    case "list":
      return client.notifications.list(parseQueryOptions(options));
    case "get":
      return client.notifications.getById(requireOption(options, "notification-id"));
    case "mark-read":
      return client.notifications.markRead(requireOption(options, "notification-id"));
    default:
      throw new Error("Unknown notifications subcommand.");
  }
}

async function runTsoSubcommand(
  command: string | undefined,
  client: PopopoClient,
  options: Map<string, string[]>,
): Promise<unknown> {
  switch (command) {
    case "exchange-code":
      return client.tso.exchangeAuthorizationCode({
        code: requireOption(options, "code"),
        codeVerifier: requireOption(options, "code-verifier"),
        redirectUri: getSingleOption(options, "redirect-uri"),
        clientId: getSingleOption(options, "client-id"),
        clientSecret: getSingleOption(options, "client-secret"),
      });
    case "refresh-token":
      return client.tso.refreshAccessToken({
        refreshToken: requireOption(options, "refresh-token"),
        clientId: getSingleOption(options, "client-id"),
        clientSecret: getSingleOption(options, "client-secret"),
      });
    case "status":
      return client.tso.fetchFileStatus(requireOption(options, "file-id"), {
        clientId: getSingleOption(options, "client-id"),
      });
    case "build-file-url":
      return {
        url: client.tso.buildFileFetchUrl(requireOption(options, "file-id"), {
          clientId: getSingleOption(options, "client-id"),
          isModifierEnabled: hasFlag(options, "modifier-enabled"),
        }),
      };
    default:
      throw new Error("Unknown tso subcommand.");
  }
}

async function runSignUp(
  client: PopopoClient,
  options: Map<string, string[]>,
  globalOptions: GlobalOptions,
): Promise<unknown> {
  const session = await client.auth.signUpWithEmailPassword({
    email: requireOption(options, "email"),
    password: requireOption(options, "password"),
    displayName: getSingleOption(options, "display-name"),
    captchaResponse: getSingleOption(options, "captcha-response"),
    clientType: getSingleOption(options, "client-type"),
    recaptchaVersion: getSingleOption(options, "recaptcha-version"),
  });
  const patch = buildUserPatch(options);
  const profile = Object.keys(patch).length > 0
    ? await client.accounts.updateMe(patch)
    : undefined;

  return {
    action: "signup",
    baseUrl: resolveBaseUrl(globalOptions, await loadResourceStrings(globalOptions.stringsPath)),
    session,
    profile,
  };
}

async function runSignIn(
  client: PopopoClient,
  options: Map<string, string[]>,
): Promise<unknown> {
  return client.auth.signInWithEmailPassword({
    email: requireOption(options, "email"),
    password: requireOption(options, "password"),
    captchaResponse: getSingleOption(options, "captcha-response"),
    clientType: getSingleOption(options, "client-type"),
    recaptchaVersion: getSingleOption(options, "recaptcha-version"),
  });
}

async function runAnonymousSignIn(
  client: PopopoClient,
  options: Map<string, string[]>,
): Promise<unknown> {
  const session = await client.auth.signInAnonymously();

  if (hasFlag(options, "firebase-only")) {
    return session;
  }

  const registration = await client.accounts.register();
  return {
    session,
    registration,
  };
}

function buildIdpUpgradeRequest(
  providerId: string,
  options: Map<string, string[]>,
): {
  providerId: string;
  oauthIdToken?: string;
  oauthAccessToken?: string;
  oauthTokenSecret?: string;
  authCode?: string;
  nonce?: string;
  identifier?: string;
  idToken?: string;
  requestUri?: string;
  returnIdpCredential?: boolean;
  autoCreate?: boolean;
  pendingToken?: string;
  sessionId?: string;
  tenantId?: string;
  persistSession: boolean;
} {
  const providerPrefix = providerId === "google.com"
    ? "google"
    : providerId === "apple.com"
      ? "apple"
      : undefined;

  return {
    providerId,
    oauthIdToken: getFirstDefinedOption(options, [
      providerPrefix ? `${providerPrefix}-id-token` : "",
      "oauth-id-token",
    ]),
    oauthAccessToken: getFirstDefinedOption(options, [
      providerPrefix ? `${providerPrefix}-access-token` : "",
      "oauth-access-token",
    ]),
    oauthTokenSecret: getSingleOption(options, "oauth-token-secret"),
    authCode: getFirstDefinedOption(options, [
      providerPrefix ? `${providerPrefix}-auth-code` : "",
      "auth-code",
    ]),
    nonce: getSingleOption(options, "nonce"),
    identifier: getSingleOption(options, "identifier"),
    idToken: getSingleOption(options, "id-token"),
    requestUri: getSingleOption(options, "request-uri"),
    returnIdpCredential: hasFlag(options, "return-idp-credential")
      ? true
      : undefined,
    autoCreate: hasFlag(options, "no-auto-create") ? false : undefined,
    pendingToken: getSingleOption(options, "pending-token"),
    sessionId: getSingleOption(options, "session-id"),
    tenantId: getSingleOption(options, "tenant-id"),
    persistSession: !hasFlag(options, "no-persist"),
  };
}

function buildFlutterCredentialRequest(
  options: Map<string, string[]>,
): {
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
  persistSession: boolean;
} {
  const signInMethod = requireOption(options, "sign-in-method") as
    | "twitter.com"
    | "playgames.google.com"
    | "google.com"
    | "facebook.com"
    | "oauth"
    | "phone"
    | "password"
    | "github.com"
    | "emailLink";

  return {
    token: parseOptionalNumberOption(options, "token"),
    signInMethod,
    providerId: getSingleOption(options, "provider-id"),
    secret: getSingleOption(options, "secret"),
    idToken: getSingleOption(options, "id-token"),
    accessToken: getSingleOption(options, "access-token"),
    rawNonce: getSingleOption(options, "raw-nonce") ?? getSingleOption(options, "nonce"),
    verificationId: getSingleOption(options, "verification-id") ??
      getSingleOption(options, "session-info"),
    smsCode: getSingleOption(options, "sms-code") ??
      getSingleOption(options, "verification-code") ??
      getSingleOption(options, "code"),
    email: getSingleOption(options, "email"),
    emailLink: getSingleOption(options, "email-link"),
    serverAuthCode: getSingleOption(options, "server-auth-code"),
    captchaResponse: getSingleOption(options, "captcha-response"),
    clientType: getSingleOption(options, "client-type"),
    recaptchaVersion: getSingleOption(options, "recaptcha-version"),
    persistSession: !hasFlag(options, "no-persist"),
  };
}

function buildVerifyPhoneNumberRequest(
  options: Map<string, string[]>,
): {
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
} {
  return {
    phoneNumber: getSingleOption(options, "phone-number"),
    timeoutMs: parseOptionalNumberOption(options, "timeout-ms") ?? 30000,
    forceResendingToken: parseOptionalNumberOption(options, "force-resending-token"),
    autoRetrievedSmsCodeForTesting:
      getSingleOption(options, "auto-retrieved-sms-code-for-testing"),
    multiFactorSessionId: getSingleOption(options, "multi-factor-session-id"),
    multiFactorInfoUid: getSingleOption(options, "multi-factor-info-uid"),
    recaptchaToken: getSingleOption(options, "recaptcha-token"),
    playIntegrityToken: getSingleOption(options, "play-integrity-token"),
    captchaResponse: getSingleOption(options, "captcha-response"),
    clientType: getSingleOption(options, "client-type"),
    recaptchaVersion: getSingleOption(options, "recaptcha-version"),
    appSignatureHash: getSingleOption(options, "app-signature-hash"),
    tenantId: getSingleOption(options, "tenant-id"),
  };
}

function buildUserPatch(options: Map<string, string[]>): AccountProfilePatch {
  return compactObject({
    alias: getSingleOption(options, "alias"),
    displayName: getSingleOption(options, "display-name"),
    anotherName: getSingleOption(options, "another-name"),
    iconSource: getSingleOption(options, "icon-source"),
    ownerUserId: getSingleOption(options, "owner-user-id"),
    photoUrl: getSingleOption(options, "photo-url"),
  }) as AccountProfilePatch;
}

function buildHomeDisplaySpacesRequest(
  options: Map<string, string[]>,
): Record<string, unknown> {
  return compactObject({
    kind: getSingleOption(options, "kind"),
    category: getSingleOption(options, "category"),
  });
}

function buildRequestBody(options: Map<string, string[]>): Record<string, unknown> {
  const rawBody = getSingleOption(options, "body-json");

  if (!rawBody) {
    return {};
  }

  return parseJsonOption<Record<string, unknown>>(rawBody, "--body-json");
}

function createClient(
  globalOptions: GlobalOptions,
  resources: ResourceStrings,
  session: AuthState,
): PopopoClient {
  return new PopopoClient({
    baseUrl: resolveBaseUrl(globalOptions, resources),
    apiBaseUrl: resolveApiBaseUrl(globalOptions, resources),
    session,
    firebase: {
      apiKey: globalOptions.apiKey ?? requireString(resources, "google_api_key"),
      authBaseUrl: globalOptions.authBaseUrl ?? DEFAULT_FIREBASE_AUTH_BASE_URL,
      secureTokenBaseUrl:
        globalOptions.secureTokenBaseUrl ?? DEFAULT_FIREBASE_SECURE_TOKEN_BASE_URL,
      authDomain: resources.firebase_mail_link_domain ?? "popopo.firebaseapp.com",
      appId: resources.google_app_id ?? "",
      projectId: resources.project_id ?? "",
      storageBucket: resources.google_storage_bucket ?? "",
      webClientId: resources.default_web_client_id ?? "",
    },
    tso: {
      oauthBaseUrl: globalOptions.tsoOauthBaseUrl,
      fileApiBaseUrl: globalOptions.tsoFileApiBaseUrl,
      clientId: globalOptions.tsoClientId,
      clientSecret: globalOptions.tsoClientSecret,
      redirectUri: globalOptions.tsoRedirectUri,
    },
  });
}

function resolveBaseUrl(
  globalOptions: GlobalOptions,
  resources: ResourceStrings,
): string {
  if (globalOptions.baseUrl) {
    return globalOptions.baseUrl;
  }

  const envHostName = resources.env_host_name;

  if (!envHostName) {
    return DEFAULT_POPOPO_BASE_URL;
  }

  if (/^https?:\/\//i.test(envHostName)) {
    return envHostName;
  }

  if (envHostName.includes(".")) {
    return `https://${envHostName}`;
  }

  return `https://www.${envHostName}.com`;
}

function resolveApiBaseUrl(
  globalOptions: GlobalOptions,
  resources: ResourceStrings,
): string {
  if (globalOptions.apiBaseUrl) {
    return globalOptions.apiBaseUrl;
  }

  const envHostName = resources.env_host_name;

  if (!envHostName) {
    return DEFAULT_POPOPO_API_BASE_URL;
  }

  if (/^https?:\/\//i.test(envHostName)) {
    const url = new URL(envHostName);

    if (url.hostname.startsWith("api.")) {
      return envHostName;
    }

    url.hostname = `api.${url.hostname.replace(/^www\./, "")}`;
    return url.toString().replace(/\/$/, "");
  }

  if (envHostName.includes(".")) {
    return `https://api.${envHostName.replace(/^www\./, "")}`;
  }

  return `https://api.${envHostName}.com`;
}

function parseGlobalOptions(options: Map<string, string[]>): GlobalOptions {
  return {
    json: hasFlag(options, "json"),
    stringsPath: resolve(getSingleOption(options, "strings") ?? defaultStringsPath),
    sessionFile: resolve(getSingleOption(options, "session-file") ?? defaultSessionFile),
    baseUrl: getSingleOption(options, "base-url"),
    apiBaseUrl: getSingleOption(options, "api-base-url"),
    apiKey: getSingleOption(options, "api-key"),
    authBaseUrl: getSingleOption(options, "auth-base-url"),
    secureTokenBaseUrl: getSingleOption(options, "secure-token-base-url"),
    tsoOauthBaseUrl: getSingleOption(options, "tso-oauth-base-url"),
    tsoFileApiBaseUrl: getSingleOption(options, "tso-file-api-base-url"),
    tsoClientId: getSingleOption(options, "tso-client-id"),
    tsoClientSecret: getSingleOption(options, "tso-client-secret"),
    tsoRedirectUri: getSingleOption(options, "tso-redirect-uri"),
  };
}

function parseArgs(argv: string[]): ParsedArgs {
  const command: string[] = [];
  const options = new Map<string, string[]>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === undefined) {
      continue;
    }

    if (!token.startsWith("--")) {
      command.push(token);
      continue;
    }

    const trimmed = token.slice(2);
    const equalIndex = trimmed.indexOf("=");

    if (equalIndex >= 0) {
      appendOption(options, trimmed.slice(0, equalIndex), trimmed.slice(equalIndex + 1));
      continue;
    }

    const next = argv[index + 1];

    if (next === undefined || next.startsWith("--")) {
      appendOption(options, trimmed, "true");
      continue;
    }

    appendOption(options, trimmed, next);
    index += 1;
  }

  return { command, options };
}

function appendOption(
  options: Map<string, string[]>,
  key: string,
  value: string,
): void {
  const existing = options.get(key);

  if (existing) {
    existing.push(value);
    return;
  }

  options.set(key, [value]);
}

function hasFlag(options: Map<string, string[]>, key: string): boolean {
  const values = options.get(key);
  return values?.[values.length - 1] === "true";
}

function getSingleOption(
  options: Map<string, string[]>,
  key: string,
): string | undefined {
  const values = options.get(key);
  return values?.[values.length - 1];
}

function getFirstDefinedOption(
  options: Map<string, string[]>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    if (!key) {
      continue;
    }

    const value = getSingleOption(options, key);

    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function parseOptionalNumberOption(
  options: Map<string, string[]>,
  key: string,
): number | undefined {
  const value = getSingleOption(options, key);

  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric option: --${key}=${value}`);
  }

  return parsed;
}

function parseOptionalBooleanOption(
  options: Map<string, string[]>,
  key: string,
): boolean | undefined {
  const value = getSingleOption(options, key);

  if (value === undefined) {
    return undefined;
  }

  if (value === "true" || value === "1") {
    return true;
  }

  if (value === "false" || value === "0") {
    return false;
  }

  throw new Error(`Invalid boolean option: --${key}=${value}`);
}

function parseJsonOption<TValue>(value: string, optionName: string): TValue {
  try {
    return JSON.parse(value) as TValue;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON for ${optionName}: ${message}`);
  }
}

function requireOption(
  options: Map<string, string[]>,
  key: string,
  config: { fallback?: string } = {},
): string {
  const value = getSingleOption(options, key) ?? config.fallback;

  if (!value) {
    throw new Error(`Missing required option: --${key}`);
  }

  return value;
}

function parseQueryOptions(options: Map<string, string[]>): RequestQuery | undefined {
  const values = options.get("query");

  if (!values || values.length === 0) {
    return undefined;
  }

  const query: RequestQuery = {};

  for (const entry of values) {
    const separatorIndex = entry.indexOf("=");

    if (separatorIndex <= 0) {
      throw new Error(`Invalid --query value: ${entry}`);
    }

    const key = entry.slice(0, separatorIndex);
    const value = entry.slice(separatorIndex + 1);
    const existing = query[key];

    if (Array.isArray(existing)) {
      existing.push(value);
      continue;
    }

    if (existing !== undefined) {
      query[key] = [existing, value];
      continue;
    }

    query[key] = value;
  }

  return query;
}

async function loadResourceStrings(stringsPath: string): Promise<ResourceStrings> {
  const xml = await readFile(stringsPath, "utf8");
  const strings: ResourceStrings = {};
  const pattern =
    /<string\s+name="([^"]+)">([\s\S]*?)<\/string>|<string\s+name="([^"]+)"\s*\/>/g;

  for (const match of xml.matchAll(pattern)) {
    const name = match[1] ?? match[3];

    if (!name) {
      continue;
    }

    strings[name] = decodeXmlEntities((match[2] ?? "").trim());
  }

  return strings;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

async function loadSession(sessionFile: string): Promise<AuthState> {
  if (!existsSync(sessionFile)) {
    return {};
  }

  const raw = await readFile(sessionFile, "utf8");
  const parsed = JSON.parse(raw) as AuthState;
  return parsed ?? {};
}

async function persistSession(
  sessionFile: string,
  session: Readonly<AuthState>,
): Promise<void> {
  await writeFile(sessionFile, `${JSON.stringify(session, null, 2)}\n`, "utf8");
}

function compactObject(record: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) {
      next[key] = value;
    }
  }

  return next;
}

function requireString(strings: ResourceStrings, key: string): string {
  const value = strings[key];

  if (!value) {
    throw new Error(`Required string "${key}" was not found in ${defaultStringsPath}.`);
  }

  return value;
}

function printResult(result: unknown, json: boolean): void {
  if (json || typeof result === "object") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(String(result));
}

function printHelp(): void {
  console.log(
    [
      "Usage:",
      "  uset <command> [options]",
      "",
      "Core commands:",
      "  uset anonymous [--firebase-only]",
      "  uset signup --email <email> --password <password> [--display-name <name>] [--alias <handle>]",
      "  uset signin --email <email> --password <password>",
      "  uset auth sign-in-with-credential --sign-in-method <method> [credential fields]",
      "  uset signout",
      "  uset lookup [--id-token <token>]",
      "  uset auth verify-phone-number --phone-number <E164> [--timeout-ms <ms>]",
      "  uset auth phone send-code --phone-number <E164>",
      "  uset auth upgrade google [--google-id-token <jwt> | --google-access-token <token> | --google-auth-code <code>]",
      "  uset auth upgrade apple [--apple-id-token <jwt> | --apple-access-token <token> | --apple-auth-code <code>] [--nonce <nonce>]",
      "  uset auth upgrade phone --session-info <session> --code <sms-code>",
      "  uset me",
      "",
      "User commands:",
      "  uset user get --user-id <id>",
      "  uset user register",
      "  uset user link-with-credential --sign-in-method <method> [credential fields]",
      "  uset user update-phone-number --verification-id <id> --verification-code <code>",
      "  uset user update [--display-name <name>] [--alias <handle>] [--another-name <name>] [--icon-source <url>]",
      "  uset user change display-name --display-name <name>",
      "  uset user change another-name --another-name <name>",
      "  uset user change icon-source --icon-source <value>",
      "  uset user change owner-user-id [--user-id <id>]",
      "",
      "Other commands:",
      "  uset coins balance [--user-id <id>]",
      "  uset coins user-private-data [--user-id <id>]",
      "  uset lives list [--kind <value>] [--category <value>] [--query key=value]",
      "  uset lives current [--kind <value>] [--category <value>] [--query key=value]",
      "  uset lives get --space-key <space-key> [--kind <value>] [--category <value>] [--query key=value]",
      "  uset lives list --space-key <space-key> [--kind <value>] [--category <value>] [--query key=value]",
      "  uset spaces list [--kind <value>] [--category <value>] [--query key=value]",
      "  uset spaces current [--kind <value>] [--category <value>] [--query key=value]",
      "  uset spaces get --space-key <space-key> [--kind <value>] [--category <value>] [--query key=value]",
      "  uset spaces connection-info --space-key <space-key> [--body-json <json>]",
      "  uset invites list [--query key=value]",
      "  uset invites get --code <invite-code>",
      "  uset invites accept --code <invite-code>",
      "  uset notifications list [--query key=value]",
      "  uset notifications get --notification-id <id>",
      "  uset notifications mark-read --notification-id <id>",
      "  uset tso exchange-code --code <code> --code-verifier <verifier>",
      "  uset tso refresh-token --refresh-token <token>",
      "  uset tso status --file-id <id>",
      "  uset tso build-file-url --file-id <id> [--modifier-enabled]",
      "",
      "Global options:",
      `  --strings <path>              default: ${defaultStringsPath}`,
      `  --session-file <path>         default: ${defaultSessionFile}`,
      "  --base-url <url>",
      "  --api-base-url <url>",
      "  --api-key <key>",
      "  --auth-base-url <url>",
      "  --secure-token-base-url <url>",
      "  --captcha-response <value>",
      "  --recaptcha-token <value>",
      "  --play-integrity-token <value>",
      "  --client-type <value>",
      "  --recaptcha-version <value>",
      "  --sign-in-method <method>",
      "  --provider-id <id>",
      "  --secret <value>",
      "  --id-token <jwt>",
      "  --access-token <token>",
      "  --raw-nonce <value>",
      "  --verification-id <value>",
      "  --verification-code <value>",
      "  --sms-code <value>",
      "  --email-link <url>",
      "  --server-auth-code <code>",
      "  --timeout-ms <ms>             default: 30000",
      "  --force-resending-token <n>",
      "  --auto-retrieved-sms-code-for-testing <code>",
      "  --multi-factor-session-id <id>",
      "  --multi-factor-info-uid <uid>",
      "  --google-id-token <jwt>",
      "  --google-access-token <token>",
      "  --google-auth-code <code>",
      "  --apple-id-token <jwt>",
      "  --apple-access-token <token>",
      "  --apple-auth-code <code>",
      "  --oauth-id-token <jwt>",
      "  --oauth-access-token <token>",
      "  --oauth-token-secret <token>",
      "  --auth-code <code>",
      "  --kind <value>",
      "  --category <value>",
      "  --nonce <value>",
      "  --request-uri <url>            default: http://localhost",
      "  --session-info <value>",
      "  --phone-number <E164>",
      "  --space-key <value>",
      "  --temporary-proof <value>",
      "  --tenant-id <value>",
      "  --no-auto-create",
      "  --no-persist",
      "  --query key=value             repeatable",
      "  --json",
      "",
      "Install command name:",
      "  cd client_lib && bun link",
      "  then: uset ...",
    ].join("\n"),
  );
}

main().catch((error: unknown) => {
  if (error instanceof PopopoApiError) {
    console.error(`API error: ${error.status} ${error.statusText}`);
    console.error(`url: ${error.url}`);

    if (error.body !== undefined) {
      console.error(JSON.stringify(error.body, null, 2));
    }

    process.exit(1);
  }

  if (error instanceof Error) {
    console.error(error.message);
    process.exit(1);
  }

  console.error(String(error));
  process.exit(1);
});
