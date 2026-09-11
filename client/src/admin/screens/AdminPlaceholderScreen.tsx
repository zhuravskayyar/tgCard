const copy: Record<string, { title: string; description: string }> = {
  events: { title: "Події", description: "Керування подіями буде підключене після винесення їх конфігурації з коду в БД." },
  promos: { title: "Промокоди", description: "Промокоди потребують окремої моделі строків дії, лімітів і історії використання." },
  settings: { title: "Налаштування", description: "Тут з’являться тільки безпечні серверні параметри. Секрети та whitelist ніколи не віддаватимуться в браузер." },
  shop: { title: "Магазин", description: "Конфіг магазину зараз живе в коді. Редактор увімкнемо після міграції правил у керовану конфігурацію." },
};

export function AdminPlaceholderScreen({ section }: { section: string }) {
  const content = copy[section] ?? { title: "Розділ", description: "Цей модуль запланований на наступний етап." };
  return (
    <div className="admin-page">
      <div className="admin-page__heading"><div><p className="admin-eyebrow">НАСТУПНИЙ ЕТАП</p><h1>{content.title}</h1><p>{content.description}</p></div></div>
      <section className="admin-state admin-state--placeholder"><span>◇</span><strong>Основа вже готова</strong><p>Навігація, авторизація та журнал аудиту працюють. Цей екран навмисно не імітує дані, яких сервер поки не зберігає.</p></section>
    </div>
  );
}
