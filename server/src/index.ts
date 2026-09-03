import { createReadStream, existsSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { basename, extname, relative, resolve } from "node:path";
import {
  handleAuthMe,
  handleAuthConfig,
  handleGoogleAuth,
  handleLinkIdentity,
  handleLogout,
  handleTelegramAuth,
  handleTelegramWebAuth,
} from "./auth/accountAuthRoute.js";
import { PlayerAuthService } from "./auth/playerAuth.js";
import { SessionRepository } from "./auth/sessionRepository.js";
import { handleCardProgressionRequest, type CardProgressionRouteAction } from "./cards/cardProgressionRoute.js";
import { CardProgressionService } from "./cards/cardProgressionService.js";
import { handleCampaignRequest } from "./campaign/campaignRoute.js";
import { CampaignService } from "./campaign/campaignService.js";
import { CampaignBossService } from "./campaign/campaignBossService.js";
import { handleCampaignBossRequest } from "./campaign/campaignBossRoute.js";
import { getServerEnvironment } from "./config/environment.js";
import { CollectionRepository } from "./collections/collectionRepository.js";
import { handlePlayerCollections } from "./collections/collectionRoute.js";
import { createDatabasePool } from "./database/pool.js";
import { recalculateAutomaticDeckForPlayer } from "./decks/automaticDeckService.js";
import { DeckRepository } from "./decks/deckRepository.js";
import { handlePlayerDeck } from "./decks/playerDeckRoute.js";
import { handleDuelRequest } from "./duel/duelRoute.js";
import { DuelService } from "./duel/duelService.js";
import { getCorsPolicy } from "./http/cors.js";
import { sendJson } from "./http/json.js";
import { InventoryRepository } from "./inventory/inventoryRepository.js";
import { handlePlayerCards, handleWeakPlayerCards } from "./inventory/playerCardsRoute.js";
import { handleShopCatalog, handleShopPurchase } from "./shop/shopRoute.js";
import { ShopService } from "./shop/shopService.js";
import { handleMailAction, handleMailClaim, handlePlayerMail } from "./mail/mailRoute.js";
import { MailService } from "./mail/mailService.js";
import { handleLeaderboardRequest } from "./leaderboards/leaderboardRoute.js";
import { handlePlayerProfileRequest } from "./leaderboards/playerProfileRoute.js";
import { LeaderboardRepository } from "./leaderboards/leaderboardRepository.js";
import { PlayerRepository } from "./users/playerRepository.js";
import { handlePlayerNickname } from "./users/playerNicknameRoute.js";
import { handlePlayerTutorialCompletion } from "./users/playerTutorialRoute.js";
import { ReferralService } from "./referrals/referralService.js";
import { handleDungeonComplete, handleDungeonStart } from "./dungeon/dungeonRoute.js";
import { DungeonService } from "./dungeon/dungeonService.js";
import { handleCardWorkshopCatalog, handleCardWorkshopCraft } from "./shop/cardWorkshopRoute.js";
import { CardWorkshopService } from "./shop/cardWorkshopService.js";
import { handleArenaRequest } from "./arena/arenaRoute.js";
import { ArenaService } from "./arena/arenaService.js";
import { handleLimitedCardRedeem } from "./limited/limitedCardRoute.js";
import { LimitedCardService } from "./limited/limitedCardService.js";
import {
  handleEquipNicknameSkin,
  handleNicknameSkinCatalog,
  handleNicknameSkinPurchase,
  handlePlayerInventory,
} from "./cosmetics/nicknameSkinRoute.js";
import { NicknameSkinService } from "./cosmetics/nicknameSkinService.js";
import { handlePlayerEquipment } from "./equipment/equipmentRoute.js";
import { handleEquipmentManual } from "./equipment/equipmentManualRoute.js";
import { EquipmentManualService } from "./equipment/equipmentManualService.js";
import { handleGuildForumReference } from "./reference/guildForumReferenceRoute.js";
import { GuildForumReferenceService } from "./reference/guildForumReferenceService.js";
import { handleBattlePassRequest } from "./battlePassRoute.js";
import { BattlePassService } from "./battlePassService.js";
import { handleDevAuthRequest } from "./dev/devAuthRoute.js";
import { handleGuildRequest } from "./guild/guildRoute.js";
import { GuildService } from "./guild/guildService.js";
import { GuildForumService } from "./guild/guildForumService.js";
import { GuildRaidService } from "./guild/guildRaidService.js";

export const environment = getServerEnvironment();
export const pool = createDatabasePool(environment.databaseUrl);
const players = new PlayerRepository(pool);
const sessions = new SessionRepository(pool);
const auth = new PlayerAuthService(players, sessions, environment.telegramBotToken);
const guilds = new GuildService(pool);
const guildForum = new GuildForumService(pool);
const guildRaids = new GuildRaidService(pool);
const inventory = new InventoryRepository(pool);
const decks = new DeckRepository(pool);
const campaign = new CampaignService(pool);
const campaignBoss = new CampaignBossService(pool, campaign, Math.random, undefined, guilds);
const referrals = new ReferralService(pool, campaign);
const limitedCards = new LimitedCardService(pool);
const shop = new ShopService(pool, { campaign, limitedCards });
const nicknameSkins = new NicknameSkinService(pool);
const mail = new MailService(pool);
const leaderboards = new LeaderboardRepository(pool);
const cardProgression = new CardProgressionService(pool, inventory, campaign);
const collections = new CollectionRepository(pool);
const duels = new DuelService(pool, Math.random, campaign, guilds);
const dungeon = new DungeonService(pool, guilds);
const cardWorkshop = new CardWorkshopService(pool);
const arena = new ArenaService(pool, guilds);
const equipmentManual = new EquipmentManualService();
const guildForumReference = new GuildForumReferenceService();
const battlePass = new BattlePassService(pool);
const devAuthEnabled = process.env.NODE_ENV !== "production" && process.env.CARDASTIKA_DEV_AUTH === "true";
const projectDirectory = basename(process.cwd()).toLowerCase() === "server"
  ? resolve(process.cwd(), "..")
  : process.cwd();
const cardArtDirectory = resolve(projectDirectory, "client/public/card-art");
const cardArtContentTypes: Record<string, string> = {
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
};
const cardArtImageCacheControl = "public, max-age=86400, stale-while-revalidate=604800";
const cardArtManifestCacheControl = "no-cache";

function handleCardArtRequest(request: IncomingMessage, response: ServerResponse, pathname: string) {
  if (!pathname.startsWith("/card-art/")) return false;

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405);
    response.end();
    return true;
  }

  let relativePath: string;
  try {
    relativePath = decodeURIComponent(pathname.slice("/card-art/".length));
  } catch {
    response.writeHead(400);
    response.end();
    return true;
  }

  const filePath = resolve(cardArtDirectory, relativePath);
  const pathFromAssetDirectory = relative(cardArtDirectory, filePath);
  const fileStats = existsSync(filePath) ? statSync(filePath) : null;
  if (
    pathFromAssetDirectory.startsWith("..")
    || pathFromAssetDirectory.includes("..\\")
    || pathFromAssetDirectory.includes("../")
    || !fileStats
    || !fileStats.isFile()
  ) {
    response.writeHead(404);
    response.end();
    return true;
  }

  const isManifest = relativePath === "card-art-map.txt";
  const entityTag = `W/"${fileStats.size.toString(16)}-${Math.floor(fileStats.mtimeMs).toString(16)}"`;
  response.setHeader("Cache-Control", isManifest ? cardArtManifestCacheControl : cardArtImageCacheControl);
  response.setHeader("Content-Type", cardArtContentTypes[extname(filePath).toLowerCase()] ?? "application/octet-stream");
  response.setHeader("ETag", entityTag);
  response.setHeader("Last-Modified", fileStats.mtime.toUTCString());
  if (request.headers["if-none-match"] === entityTag) {
    response.writeHead(304);
    response.end();
    return true;
  }
  if (request.method === "HEAD") {
    response.writeHead(200);
    response.end();
    return true;
  }

  createReadStream(filePath)
    .on("error", () => {
      if (!response.headersSent) response.writeHead(404);
      response.end();
    })
    .pipe(response);
  return true;
}

async function handleRequestInternal(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? "/", "http://localhost");
  const rewrittenApiPath = url.searchParams.get("__cardastika_api_path");

  if (rewrittenApiPath !== null) {
    const normalizedPath = rewrittenApiPath.replace(/^\/+/, "");
    url.pathname = normalizedPath ? `/api/${normalizedPath}` : "/api";
    url.searchParams.delete("__cardastika_api_path");
  }

  const cors = getCorsPolicy(request.headers.origin, environment.clientOrigin);

  if (handleCardArtRequest(request, response, url.pathname)) return;

  if ((url.pathname === "/api" || url.pathname.startsWith("/api/")) && !cors.allowed) {
    sendJson(response, 403, { error: { code: "origin_not_allowed", message: "Origin is not allowed" } });
    return;
  }

  if ((url.pathname === "/api" || url.pathname === "/api/health") && request.method === "GET") {
    try {
      await pool.query("SELECT 1");
      sendJson(response, 200, { ok: true, service: "cardastika" }, cors.headers);
    } catch {
      sendJson(response, 503, { ok: false, service: "cardastika", error: { code: "database_unavailable" } }, cors.headers);
    }
    return;
  }

  const isTelegramAuthRoute = url.pathname === "/api/auth/telegram";
  const isTelegramWebAuthRoute = url.pathname === "/api/auth/telegram/web";
  const isGoogleAuthRoute = url.pathname === "/api/auth/google";
  const isAuthMeRoute = url.pathname === "/api/auth/me";
  const isAuthConfigRoute = url.pathname === "/api/auth/config";
  const isAuthLinkRoute = url.pathname === "/api/auth/link";
  const isAuthLogoutRoute = url.pathname === "/api/auth/logout";
  const isPlayerCardsRoute = url.pathname === "/api/player/cards";
  const isPlayerInventoryRoute = url.pathname === "/api/player/inventory";
  const isPlayerEquipmentRoute = url.pathname === "/api/player/equipment";
  const isEquipmentManualRoute = url.pathname === "/api/equipment/manual";
  const isGuildForumReferenceRoute = url.pathname === "/api/reference/guild-forum";
  const isGuildRoute = url.pathname === "/api/guilds" || url.pathname.startsWith("/api/guilds/");
  const isDevAuthRoute = url.pathname === "/api/dev/accounts" || url.pathname === "/api/dev/login";
  const isNicknameSkinCatalogRoute = url.pathname === "/api/shop/nickname-skins";
  const isNicknameSkinPurchaseRoute = url.pathname === "/api/shop/nickname-skins/purchase";
  const isNicknameSkinEquipRoute = url.pathname === "/api/player/inventory/nickname-skin/equip";
  const isWeakPlayerCardsRoute = url.pathname === "/api/player/cards/weak";
  const isPlayerDeckRoute = url.pathname === "/api/player/deck";
  const isShopCatalogRoute = url.pathname === "/api/shop/cards";
  const isShopPurchaseRoute = url.pathname === "/api/shop/cards/purchase";
  const isLimitedCardRedeemRoute = url.pathname === "/api/shop/limited/redeem";
  const isCardWorkshopCatalogRoute = url.pathname === "/api/shop/card-workshop";
  const isCardWorkshopCraftRoute = url.pathname === "/api/shop/card-workshop/craft";
  const isDungeonStartRoute = url.pathname === "/api/dungeon/start";
  const dungeonCompleteMatch = url.pathname.match(/^\/api\/dungeon\/([^/]+)\/complete$/);
  const isPlayerMailRoute = url.pathname === "/api/player/mail";
  const isPlayerNicknameRoute = url.pathname === "/api/player/nickname";
  const isPlayerTutorialCompletionRoute = url.pathname === "/api/player/tutorial/complete";
  const isLeaderboardRoute = url.pathname === "/api/player/leaderboards";
  const playerProfileMatch = url.pathname.match(/^\/api\/player\/profiles\/([^/]+)$/);
  const mailClaimMatch = url.pathname.match(/^\/api\/player\/mail\/([^/]+)\/claim$/);
  const mailActionMatch = url.pathname.match(/^\/api\/player\/mail\/([^/]+)\/action$/);
  const isDuelRoute = url.pathname.startsWith("/api/duel/");
  const isArenaRoute = url.pathname.startsWith("/api/arena/");
  const isCampaignRoute = url.pathname.startsWith("/api/player/campaign");
  const isCampaignBossRoute = url.pathname.startsWith("/api/player/campaign/boss");
  const isBattlePassRoute = url.pathname.startsWith("/api/player/battle-pass");
  const cardProgressionMatch = url.pathname.match(
    /^\/api\/player\/cards\/([^/]+?)(?:\/(absorption-candidates|absorption-preview|absorb|level-up|protection))?$/,
  );
  const collectionMatch = url.pathname.match(
    /^\/api\/player\/collections(?:\/([^/]+?)(?:\/cards\/([^/]+?))?)?$/,
  );

  if (
    request.method === "OPTIONS" &&
    (isTelegramAuthRoute || isTelegramWebAuthRoute || isGoogleAuthRoute || isAuthConfigRoute || isAuthMeRoute || isAuthLinkRoute || isAuthLogoutRoute || isDevAuthRoute || isPlayerCardsRoute || isPlayerInventoryRoute || isPlayerEquipmentRoute || isEquipmentManualRoute || isGuildForumReferenceRoute || isGuildRoute || isNicknameSkinCatalogRoute || isNicknameSkinPurchaseRoute || isNicknameSkinEquipRoute || isWeakPlayerCardsRoute || isPlayerDeckRoute || isShopCatalogRoute || isShopPurchaseRoute || isLimitedCardRedeemRoute || isCardWorkshopCatalogRoute || isCardWorkshopCraftRoute || isDungeonStartRoute || dungeonCompleteMatch || isPlayerMailRoute || isPlayerNicknameRoute || isPlayerTutorialCompletionRoute || isLeaderboardRoute || playerProfileMatch || mailClaimMatch || mailActionMatch || isDuelRoute || isArenaRoute || isCampaignRoute || isBattlePassRoute || cardProgressionMatch || collectionMatch)
  ) {
    response.writeHead(204, cors.headers);
    response.end();
    return;
  }

  if (request.method === "GET" && isAuthConfigRoute) {
    await handleAuthConfig(request, response, {
      auth,
      botToken: environment.telegramBotToken,
      googleClientId: environment.googleClientId,
      players,
      telegramBotUsername: environment.telegramBotUsername,
      responseHeaders: cors.headers,
    });
    return;
  }

  if (isDevAuthRoute) {
    await handleDevAuthRequest(request, response, {
      auth,
      enabled: devAuthEnabled,
      players,
      responseHeaders: cors.headers,
    });
    return;
  }

  if (request.method === "POST" && isTelegramAuthRoute) {
    await handleTelegramAuth(request, response, {
      auth,
      botToken: environment.telegramBotToken,
      googleClientId: environment.googleClientId,
      players,
      referrals,
      responseHeaders: cors.headers,
    });
    return;
  }

  if (request.method === "POST" && isTelegramWebAuthRoute) {
    await handleTelegramWebAuth(request, response, {
      auth,
      botToken: environment.telegramBotToken,
      googleClientId: environment.googleClientId,
      players,
      responseHeaders: cors.headers,
    });
    return;
  }

  if (request.method === "POST" && isGoogleAuthRoute) {
    await handleGoogleAuth(request, response, {
      auth,
      botToken: environment.telegramBotToken,
      googleClientId: environment.googleClientId,
      players,
      responseHeaders: cors.headers,
    });
    return;
  }

  if (request.method === "GET" && isAuthMeRoute) {
    await handleAuthMe(request, response, {
      auth,
      botToken: environment.telegramBotToken,
      googleClientId: environment.googleClientId,
      players,
      responseHeaders: cors.headers,
    });
    return;
  }

  if (request.method === "POST" && isAuthLinkRoute) {
    await handleLinkIdentity(request, response, {
      auth,
      botToken: environment.telegramBotToken,
      googleClientId: environment.googleClientId,
      players,
      responseHeaders: cors.headers,
    });
    return;
  }

  if (request.method === "POST" && isAuthLogoutRoute) {
    await handleLogout(request, response, {
      auth,
      botToken: environment.telegramBotToken,
      googleClientId: environment.googleClientId,
      players,
      responseHeaders: cors.headers,
    });
    return;
  }

  if (request.method === "GET" && isPlayerCardsRoute) {
    await handlePlayerCards(request, response, {
      auth,
      botToken: environment.telegramBotToken,
      inventory,
      players,
      responseHeaders: cors.headers,
    });
    return;
  }

  if (isNicknameSkinCatalogRoute) {
    await handleNicknameSkinCatalog(request, response, {
      auth,
      botToken: environment.telegramBotToken,
      players,
      responseHeaders: cors.headers,
      skins: nicknameSkins,
    });
    return;
  }

  if (isNicknameSkinPurchaseRoute) {
    await handleNicknameSkinPurchase(request, response, {
      auth,
      botToken: environment.telegramBotToken,
      players,
      responseHeaders: cors.headers,
      skins: nicknameSkins,
    });
    return;
  }

  if (isPlayerInventoryRoute) {
    await handlePlayerInventory(request, response, {
      auth,
      botToken: environment.telegramBotToken,
      players,
      responseHeaders: cors.headers,
      skins: nicknameSkins,
    });
    return;
  }

  if (isPlayerEquipmentRoute) {
    await handlePlayerEquipment(request, response, {
      auth,
      botToken: environment.telegramBotToken,
      players,
      responseHeaders: cors.headers,
    });
    return;
  }

  if (isEquipmentManualRoute) {
    await handleEquipmentManual(request, response, {
      manual: equipmentManual,
      responseHeaders: cors.headers,
    });
    return;
  }

  if (isGuildForumReferenceRoute) {
    await handleGuildForumReference(request, response, {
      reference: guildForumReference,
      responseHeaders: cors.headers,
    });
    return;
  }

  if (isGuildRoute) {
    await handleGuildRequest(request, response, {
      auth,
      botToken: environment.telegramBotToken,
      forum: guildForum,
      guilds,
      raids: guildRaids,
      players,
      responseHeaders: cors.headers,
    });
    return;
  }

  if (isNicknameSkinEquipRoute) {
    await handleEquipNicknameSkin(request, response, {
      auth,
      botToken: environment.telegramBotToken,
      players,
      responseHeaders: cors.headers,
      skins: nicknameSkins,
    });
    return;
  }

  if (request.method === "GET" && isWeakPlayerCardsRoute) {
    await handleWeakPlayerCards(request, response, {
      auth,
      botToken: environment.telegramBotToken,
      inventory,
      players,
      responseHeaders: cors.headers,
    });
    return;
  }

  if (cardProgressionMatch) {
    const instanceId = decodeURIComponent(cardProgressionMatch[1]!);
    const action = (cardProgressionMatch[2] ?? "detail") as CardProgressionRouteAction;
    await handleCardProgressionRequest(request, response, {
      auth,
      botToken: environment.telegramBotToken,
      players,
      progression: cardProgression,
      campaign,
      responseHeaders: cors.headers,
    }, instanceId, action);
    return;
  }

  if (collectionMatch) {
    await handlePlayerCollections(request, response, {
      auth,
      botToken: environment.telegramBotToken,
      collections,
      campaign,
      players,
      responseHeaders: cors.headers,
    }, collectionMatch[1] ? decodeURIComponent(collectionMatch[1]) : undefined,
    collectionMatch[2] ? decodeURIComponent(collectionMatch[2]) : undefined);
    return;
  }

  if (isPlayerDeckRoute) {
    await handlePlayerDeck(request, response, {
      auth,
      automaticDeck: { recalculateForPlayer: (playerId) => recalculateAutomaticDeckForPlayer(pool, playerId) },
      botToken: environment.telegramBotToken,
      decks,
      campaign,
      players,
      responseHeaders: cors.headers,
    });
    return;
  }

  if (isShopCatalogRoute) {
    await handleShopCatalog(request, response, {
      auth,
      botToken: environment.telegramBotToken,
      players,
      shop,
      responseHeaders: cors.headers,
    });
    return;
  }

  if (isShopPurchaseRoute) {
    await handleShopPurchase(request, response, {
      auth,
      botToken: environment.telegramBotToken,
      players,
      shop,
      responseHeaders: cors.headers,
    });
    return;
  }

  if (isLimitedCardRedeemRoute) {
    await handleLimitedCardRedeem(request, response, {
      auth,
      botToken: environment.telegramBotToken,
      limitedCards,
      players,
      responseHeaders: cors.headers,
    });
    return;
  }

  if (isCardWorkshopCatalogRoute) {
    await handleCardWorkshopCatalog(request, response, {
      auth,
      botToken: environment.telegramBotToken,
      players,
      workshop: cardWorkshop,
      responseHeaders: cors.headers,
    });
    return;
  }

  if (isCardWorkshopCraftRoute) {
    await handleCardWorkshopCraft(request, response, {
      auth,
      botToken: environment.telegramBotToken,
      players,
      workshop: cardWorkshop,
      responseHeaders: cors.headers,
    });
    return;
  }

  if (isDungeonStartRoute) {
    await handleDungeonStart(request, response, {
      auth,
      botToken: environment.telegramBotToken,
      dungeon,
      players,
      responseHeaders: cors.headers,
    });
    return;
  }

  if (dungeonCompleteMatch) {
    await handleDungeonComplete(request, response, {
      auth,
      botToken: environment.telegramBotToken,
      dungeon,
      players,
      responseHeaders: cors.headers,
    }, decodeURIComponent(dungeonCompleteMatch[1]!));
    return;
  }

  if (isPlayerMailRoute) {
    await handlePlayerMail(request, response, {
      auth,
      botToken: environment.telegramBotToken,
      mail,
      players,
      responseHeaders: cors.headers,
    });
    return;
  }

  if (isPlayerNicknameRoute) {
    await handlePlayerNickname(request, response, {
      auth,
      botToken: environment.telegramBotToken,
      players,
      responseHeaders: cors.headers,
    });
    return;
  }

  if (isPlayerTutorialCompletionRoute) {
    await handlePlayerTutorialCompletion(request, response, {
      auth,
      botToken: environment.telegramBotToken,
      players,
      responseHeaders: cors.headers,
    });
    return;
  }

  if (isLeaderboardRoute) {
    await handleLeaderboardRequest(request, response, {
      auth,
      botToken: environment.telegramBotToken,
      leaderboards,
      players,
      responseHeaders: cors.headers,
    });
    return;
  }

  if (playerProfileMatch) {
    await handlePlayerProfileRequest(request, response, {
      auth,
      botToken: environment.telegramBotToken,
      players,
      profiles: leaderboards,
      responseHeaders: cors.headers,
    }, decodeURIComponent(playerProfileMatch[1]!));
    return;
  }

  if (mailClaimMatch) {
    await handleMailClaim(request, response, {
      auth,
      botToken: environment.telegramBotToken,
      mail,
      players,
      responseHeaders: cors.headers,
    }, decodeURIComponent(mailClaimMatch[1]!));
    return;
  }

  if (mailActionMatch) {
    await handleMailAction(request, response, {
      auth,
      botToken: environment.telegramBotToken,
      mail,
      players,
      responseHeaders: cors.headers,
    }, decodeURIComponent(mailActionMatch[1]!));
    return;
  }

  if (isDuelRoute) {
    await handleDuelRequest(request, response, {
      auth,
      botToken: environment.telegramBotToken,
      duels,
      players,
      responseHeaders: cors.headers,
    });
    return;
  }

  if (isArenaRoute) {
    await handleArenaRequest(request, response, {
      arena,
      auth,
      botToken: environment.telegramBotToken,
      players,
      responseHeaders: cors.headers,
    });
    return;
  }

  if (isCampaignBossRoute) {
    await handleCampaignBossRequest(request, response, {
      auth,
      botToken: environment.telegramBotToken,
      boss: campaignBoss,
      players,
      responseHeaders: cors.headers,
    });
    return;
  }

  if (isCampaignRoute) {
    await handleCampaignRequest(request, response, {
      auth,
      botToken: environment.telegramBotToken,
      campaign,
      players,
      responseHeaders: cors.headers,
    });
    return;
  }

  if (isBattlePassRoute) {
    await handleBattlePassRequest(request, response, {
      auth,
      battlePass,
      botToken: environment.telegramBotToken,
      players,
      responseHeaders: cors.headers,
    });
    return;
  }

  sendJson(response, 404, { error: { code: "not_found", message: "Route not found" } }, cors.headers);
}

export async function handleRequest(request: IncomingMessage, response: ServerResponse) {
  try {
    await handleRequestInternal(request, response);
  } catch (error) {
    console.error("Cardastika request failed", error);
    if (!response.headersSent) {
      const cors = getCorsPolicy(request.headers.origin, environment.clientOrigin);
      sendJson(response, 500, { error: { code: "internal_server_error", message: "Internal server error" } }, cors.headers);
    } else if (!response.writableEnded) {
      response.end();
    }
  }
}
