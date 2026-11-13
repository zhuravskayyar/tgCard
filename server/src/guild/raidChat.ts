import type { Pool } from "pg";
import { ChatChannel, ChatError } from "../chat/chatChannel.js";
import { getDragonLair } from "@cardastika/game-core";

/** Raid chats: «witches» for the witch raid, a lair code for each dragon lair. Guild members only. */
export class GuildRaidChats {
  constructor(private readonly pool: Pick<Pool, "connect" | "query">) {}

  private async channel(guildId: string, playerId: string, channel: string) {
    if (channel !== "witches" && !getDragonLair(channel)) throw new ChatError(404, "chat_not_found", "Raid chat does not exist");
    const member = await this.pool.query("SELECT 1 FROM guild_members WHERE guild_id = $1 AND player_id = $2", [guildId, playerId]);
    if (!member.rows.length) throw new ChatError(404, "chat_not_found", "Raid chat is for guild members");
    return new ChatChannel(this.pool, "guild_raid_chat_messages", { channel, guildId });
  }

  async read(guildId: string, playerId: string, channel: string) {
    return (await this.channel(guildId, playerId, channel)).read();
  }

  async send(guildId: string, playerId: string, channel: string, body: string) {
    return (await this.channel(guildId, playerId, channel)).send(playerId, body);
  }
}
