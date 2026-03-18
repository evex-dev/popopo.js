import type { DeepPartial } from "./types.ts";

export interface PopopoEndpointSet {
  users: {
    collection: string;
    me: string;
    byId: (userId: string) => string;
    updateDisplayName: string;
    updateAnotherName: string;
    updateIconSource: string;
    changeOwnerUserId: string;
  };
  spaces: {
    collection: string;
    byId: (spaceId: string) => string;
  };
  invites: {
    collection: string;
    byCode: (code: string) => string;
    accept: (code: string) => string;
  };
  notifications: {
    collection: string;
    byId: (notificationId: string) => string;
    markRead: (notificationId: string) => string;
  };
  ipc: {
    sceneLoad: string;
    sceneExit: string;
    cancelCurrentSceneRequests: string;
    sequencePlayStart: string;
    sequencePlayStop: string;
    sequenceRecordingStart: string;
    sequenceRecordingStop: string;
    nameplateNormal: string;
    nameplateSpecial: string;
    nameplateClear: string;
  };
}

export function createDefaultEndpoints(apiBasePath = ""): PopopoEndpointSet {
  const basePath = normalizeBasePath(apiBasePath);

  return {
    users: {
      collection: buildPath(basePath, "users"),
      me: buildPath(basePath, "users/me"),
      byId: (userId) => buildPath(basePath, `users/${encodeURIComponent(userId)}`),
      updateDisplayName: buildPath(basePath, "ipc/user/change-display-name"),
      updateAnotherName: buildPath(basePath, "ipc/user/change-another-name"),
      updateIconSource: buildPath(basePath, "ipc/user/change-icon-source"),
      changeOwnerUserId: buildPath(basePath, "ipc/user/change-owner-user-id"),
    },
    spaces: {
      collection: buildPath(basePath, "spaces"),
      byId: (spaceId) => buildPath(basePath, `spaces/${encodeURIComponent(spaceId)}`),
    },
    invites: {
      collection: buildPath(basePath, "invites"),
      byCode: (code) => buildPath(basePath, `invites/${encodeURIComponent(code)}`),
      accept: (code) => buildPath(basePath, `invites/${encodeURIComponent(code)}/accept`),
    },
    notifications: {
      collection: buildPath(basePath, "notifications"),
      byId: (notificationId) =>
        buildPath(basePath, `notifications/${encodeURIComponent(notificationId)}`),
      markRead: (notificationId) =>
        buildPath(basePath, `notifications/${encodeURIComponent(notificationId)}/read`),
    },
    ipc: {
      sceneLoad: buildPath(basePath, "ipc/scene/load"),
      sceneExit: buildPath(basePath, "ipc/scene/exit"),
      cancelCurrentSceneRequests: buildPath(basePath, "ipc/scene/cancel-current"),
      sequencePlayStart: buildPath(basePath, "ipc/sequence/play/start"),
      sequencePlayStop: buildPath(basePath, "ipc/sequence/play/stop"),
      sequenceRecordingStart: buildPath(basePath, "ipc/sequence/recording/start"),
      sequenceRecordingStop: buildPath(basePath, "ipc/sequence/recording/stop"),
      nameplateNormal: buildPath(basePath, "ipc/nameplate/normal"),
      nameplateSpecial: buildPath(basePath, "ipc/nameplate/special"),
      nameplateClear: buildPath(basePath, "ipc/nameplate/clear"),
    },
  };
}

export function mergeEndpoints(
  defaults: PopopoEndpointSet,
  overrides?: DeepPartial<PopopoEndpointSet>,
): PopopoEndpointSet {
  if (!overrides) {
    return defaults;
  }

  return {
    users: {
      collection: overrides.users?.collection ?? defaults.users.collection,
      me: overrides.users?.me ?? defaults.users.me,
      byId: overrides.users?.byId ?? defaults.users.byId,
      updateDisplayName:
        overrides.users?.updateDisplayName ?? defaults.users.updateDisplayName,
      updateAnotherName:
        overrides.users?.updateAnotherName ?? defaults.users.updateAnotherName,
      updateIconSource:
        overrides.users?.updateIconSource ?? defaults.users.updateIconSource,
      changeOwnerUserId:
        overrides.users?.changeOwnerUserId ?? defaults.users.changeOwnerUserId,
    },
    spaces: {
      collection: overrides.spaces?.collection ?? defaults.spaces.collection,
      byId: overrides.spaces?.byId ?? defaults.spaces.byId,
    },
    invites: {
      collection: overrides.invites?.collection ?? defaults.invites.collection,
      byCode: overrides.invites?.byCode ?? defaults.invites.byCode,
      accept: overrides.invites?.accept ?? defaults.invites.accept,
    },
    notifications: {
      collection:
        overrides.notifications?.collection ?? defaults.notifications.collection,
      byId: overrides.notifications?.byId ?? defaults.notifications.byId,
      markRead:
        overrides.notifications?.markRead ?? defaults.notifications.markRead,
    },
    ipc: {
      sceneLoad: overrides.ipc?.sceneLoad ?? defaults.ipc.sceneLoad,
      sceneExit: overrides.ipc?.sceneExit ?? defaults.ipc.sceneExit,
      cancelCurrentSceneRequests:
        overrides.ipc?.cancelCurrentSceneRequests ??
        defaults.ipc.cancelCurrentSceneRequests,
      sequencePlayStart:
        overrides.ipc?.sequencePlayStart ?? defaults.ipc.sequencePlayStart,
      sequencePlayStop:
        overrides.ipc?.sequencePlayStop ?? defaults.ipc.sequencePlayStop,
      sequenceRecordingStart:
        overrides.ipc?.sequenceRecordingStart ??
        defaults.ipc.sequenceRecordingStart,
      sequenceRecordingStop:
        overrides.ipc?.sequenceRecordingStop ??
        defaults.ipc.sequenceRecordingStop,
      nameplateNormal:
        overrides.ipc?.nameplateNormal ?? defaults.ipc.nameplateNormal,
      nameplateSpecial:
        overrides.ipc?.nameplateSpecial ?? defaults.ipc.nameplateSpecial,
      nameplateClear: overrides.ipc?.nameplateClear ?? defaults.ipc.nameplateClear,
    },
  };
}

function normalizeBasePath(path: string): string {
  const trimmed = path.trim();

  if (!trimmed || trimmed === "/") {
    return "";
  }

  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}

function buildPath(basePath: string, suffix: string): string {
  const normalizedSuffix = suffix.replace(/^\/+/, "");
  const joined = `${basePath}/${normalizedSuffix}`.replace(/\/{2,}/g, "/");
  return joined.startsWith("/") ? joined : `/${joined}`;
}
