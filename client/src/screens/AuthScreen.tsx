import { useCallback, useState } from "react";
import { GoogleSignInButton } from "../components/GoogleSignInButton";
import { TelegramLoginButton } from "../components/TelegramLoginButton";
import { AppIcon } from "../components/AppIcon";

interface AuthScreenProps {
  error: string | null;
  loading: boolean;
  onGoogle: (credential: string) => Promise<void>;
  onTelegram: (authData: Record<string, string>) => Promise<void>;
}

export function AuthScreen({ error, loading, onGoogle, onTelegram }: AuthScreenProps) {
  const [pending, setPending] = useState(false);
  const handleGoogle = useCallback(async (credential: string) => {
    setPending(true);
    try { await onGoogle(credential); } finally { setPending(false); }
  }, [onGoogle]);
  const handleTelegram = useCallback(async (authData: Record<string, string>) => {
    setPending(true);
    try { await onTelegram(authData); } finally { setPending(false); }
  }, [onTelegram]);

  return (
    <main className="auth-screen">
      <div className="auth-screen__element-glow auth-screen__element-glow--fire" aria-hidden="true" />
      <div className="auth-screen__element-glow auth-screen__element-glow--water" aria-hidden="true" />
      <div className="auth-screen__element-glow auth-screen__element-glow--air" aria-hidden="true" />
      <div className="auth-screen__element-glow auth-screen__element-glow--earth" aria-hidden="true" />
      <div className="auth-screen__roots" aria-hidden="true" />
      <div className="auth-screen__layout">
        <section className="auth-screen__hero" aria-labelledby="auth-screen-title">
          <div className="auth-screen__crest" aria-hidden="true">
            <img alt="" src="/assets/ui/auth/cardastika-logo.webp" />
          </div>
          <p className="auth-screen__eyebrow">СВІТОВЕ ДЕРЕВО</p>
          <h1 id="auth-screen-title">КАРДАСТІКА</h1>
          <p className="auth-screen__subtitle">Збери свою силу, відкрий чотири стихії та вступи у світ, де кожна карта має значення.</p>
          <div className="auth-screen__features" aria-label="Можливості гри">
            <div className="auth-screen__feature">
              <span><AppIcon name="deck" size={22} /></span>
              <strong>Збирай колоду</strong>
              <small>9 карт · 4 стихії</small>
            </div>
            <div className="auth-screen__feature">
              <span><AppIcon name="duel" size={22} /></span>
              <strong>Виходь на дуель</strong>
              <small>Бийся за рейтинг</small>
            </div>
            <div className="auth-screen__feature">
              <span><AppIcon name="collection" size={22} /></span>
              <strong>Відкривай світ</strong>
              <small>Знаходь рідкісні карти</small>
            </div>
          </div>
        </section>

        <section className="auth-screen__login-panel" aria-labelledby="auth-login-title">
          <div className="auth-screen__login-heading">
            <span>ПОВЕРНЕННЯ ДО ГРИ</span>
            <h2 id="auth-login-title">Продовжити подорож</h2>
            <p>Увійди зручним способом — прогрес збережеться на всіх пристроях.</p>
          </div>
          <div className="auth-screen__providers" aria-busy={loading || pending}>
            <TelegramLoginButton appearance="landing" disabled={loading || pending} onAuth={handleTelegram} />
            <GoogleSignInButton appearance="landing" disabled={loading || pending} onCredential={handleGoogle} />
          </div>
          {loading || pending ? <p className="auth-screen__status">Перевіряємо авторизацію…</p> : null}
          {error ? <p className="auth-screen__error" role="alert">{error}</p> : null}
          <p className="auth-screen__note">Telegram і Google можна прив’язати пізніше в налаштуваннях.</p>
        </section>
      </div>
      <p className="auth-screen__footer">Cardastika · Світ чотирьох стихій</p>
    </main>
  );
}
