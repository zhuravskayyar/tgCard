import { useEffect, useState } from "react";
import type { GuildDragonRaidListView, GuildProfileResponse, GuildRaidView } from "@cardastika/shared";
import { formatUiNumber } from "../../i18n";
import { loadGuildDragonLairs, loadGuildRaid } from "../../telegram/guild";
import { GuildState, guildErrorMessage } from "./GuildUi";

const WITCH_ART = "/assets/guild/guild-row-event.webp";
const DRAGON_ART = "/assets/guild/medal-raid-v1.webp";

/** «Рейди гільдії»: one entry for both raid kinds, like the reference guild page. */
export function GuildRaidsHub({ profile, onWitches, onDragons }: { profile: GuildProfileResponse; onWitches: () => void; onDragons: () => void }) {
  const guildId = profile.guild.id;
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; witches?: GuildRaidView; dragons?: GuildDragonRaidListView; message?: string }>({ status: "loading" });

  async function load() {
    try {
      const [witches, dragons] = await Promise.all([loadGuildRaid(guildId), loadGuildDragonLairs(guildId)]);
      setState({ status: "ready", witches, dragons });
    } catch (error) {
      setState({ status: "error", message: guildErrorMessage(error) });
    }
  }

  useEffect(() => { void load(); }, [guildId]);

  return <section className="guild-raid" aria-labelledby="guild-raids-title">
    <div className="guild-section-bar guild-raid__title"><h2 id="guild-raids-title">Рейди гільдії</h2></div>
    {state.status === "loading" ? <GuildState>Завантаження рейдів…</GuildState> : state.status === "error" || !state.witches || !state.dragons ? <GuildState error onRetry={() => void load()}>{state.message ?? "Рейди тимчасово недоступні."}</GuildState> : <div className="guild-altar guild-altar__upgrades" aria-label="Рейди гільдії">
      <article className="guild-altar-upgrade">
        <span className="guild-altar-upgrade__art"><img alt="" src={WITCH_ART} /></span>
        <div className="guild-altar-upgrade__body">
          <div className="guild-altar-upgrade__heading"><h4>Битви з відьмами</h4></div>
          <p>{`Записалося магів: ${formatUiNumber(state.witches.enrollment.participantCount)}`}</p>
          <p>{state.witches.unlocked ? `Рівень наступних відьом: ${state.witches.level}` : `З ${state.witches.unlockLevel} рівня гільдії`}</p>
          <button className="guild-altar__buy" onClick={onWitches} type="button">Відкрити</button>
        </div>
      </article>
      <article className="guild-altar-upgrade">
        <span className="guild-altar-upgrade__art"><img alt="" src={DRAGON_ART} /></span>
        <div className="guild-altar-upgrade__body">
          <div className="guild-altar-upgrade__heading"><h4>Рейди на зміїв</h4></div>
          <p>{`Записалося магів: ${formatUiNumber(state.dragons.enrolledCount)}`}</p>
          <p>{`Успішних рейдів: ${formatUiNumber(state.dragons.successfulRaids)}`}</p>
          <button className="guild-altar__buy" onClick={onDragons} type="button">Відкрити</button>
        </div>
      </article>
    </div>}
  </section>;
}
