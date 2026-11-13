import { getDragonLair } from "@cardastika/game-core";
import type { GuildRaidStatusView } from "@cardastika/shared";
import type { Pool } from "pg";

/** How long a finished raid stays in the banner (reference: a message after the raid ends). */
const FINISHED_NOTICE_MINUTES = 10;

/**
 * Reference: while a player takes part in a raid, other pages show a message linking back to it;
 * after the raid ends they show its outcome. This is that message for the viewer.
 */
export class GuildRaidStatusService {
  constructor(private readonly pool: Pick<Pool, "query">) {}

  async forPlayer(playerId: string): Promise<GuildRaidStatusView> {
    const dragon = await this.pool.query<{ lair_code: string; status: "open" | "active"; participant_status: string }>(
      `SELECT raids.lair_code, raids.status, participants.status AS participant_status
       FROM guild_dragon_raid_participants participants
       INNER JOIN guild_dragon_raids raids ON raids.id = participants.raid_id
       WHERE participants.player_id = $1
       LIMIT 1`,
      [playerId],
    );
    const enrolledDragon = dragon.rows[0];
    if (enrolledDragon) {
      return {
        kind: "dragon",
        lairCode: enrolledDragon.lair_code,
        name: getDragonLair(enrolledDragon.lair_code)?.lairName ?? enrolledDragon.lair_code,
        state: enrolledDragon.status === "active" ? enrolledDragon.participant_status === "defeated" ? "fallen" : "fighting" : "enrolled",
      };
    }

    const witch = await this.pool.query<{ status: "open" | "active"; level: number; participant_status: string }>(
      `SELECT raids.status, raids.level, participants.status AS participant_status
       FROM guild_witch_raid_participants participants
       INNER JOIN guild_witch_raids raids ON raids.id = participants.raid_id
       INNER JOIN guild_members members ON members.guild_id = raids.guild_id AND members.player_id = participants.player_id
       WHERE participants.player_id = $1
       LIMIT 1`,
      [playerId],
    );
    const enrolledWitch = witch.rows[0];
    if (enrolledWitch) {
      return {
        kind: "witches",
        lairCode: null,
        level: enrolledWitch.level,
        name: "Відьми",
        state: enrolledWitch.status === "active" ? enrolledWitch.participant_status === "defeated" ? "fallen" : "fighting" : "enrolled",
      };
    }

    const finished = await this.pool.query<{ lair_code: string; outcome: "won" | "lost" }>(
      `SELECT lair_code, outcome FROM guild_dragon_raid_results
       WHERE completed_at > NOW() - make_interval(mins => $2)
         AND participants @> jsonb_build_array(jsonb_build_object('playerId', $1::text))
       ORDER BY completed_at DESC LIMIT 1`,
      [playerId, FINISHED_NOTICE_MINUTES],
    );
    const result = finished.rows[0];
    if (result) {
      return {
        kind: "dragon",
        lairCode: result.lair_code,
        name: getDragonLair(result.lair_code)?.lairName ?? result.lair_code,
        state: result.outcome,
      };
    }
    return null;
  }
}
