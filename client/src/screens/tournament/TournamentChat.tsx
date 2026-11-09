import { GameChat } from "../../components/GameChat";
import { loadTournamentChat, sendTournamentChatMessage } from "../../telegram/tournament";

export function TournamentChat() {
  return <GameChat
    inputLabel="Повідомлення в чат турніру"
    load={loadTournamentChat}
    send={sendTournamentChatMessage}
    signInNotice="Увійди в гру, щоб переглянути чат турніру."
    title="Чат турніру"
    unavailableNotice="Чат турніру тимчасово недоступний."
  />;
}
