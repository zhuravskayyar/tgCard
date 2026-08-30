import { useEffect, useState } from "react";

interface FirstVisitHintProps {
  id: string;
  items: readonly string[];
  title: string;
}

const STORAGE_PREFIX = "cardastika:first-visit-hint:";

export function FirstVisitHint({ id, items, title }: FirstVisitHintProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(window.localStorage.getItem(`${STORAGE_PREFIX}${id}`) !== "1");
    } catch {
      setVisible(true);
    }
  }, [id]);

  if (!visible) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(`${STORAGE_PREFIX}${id}`, "1");
    } catch {
      // Restricted webviews can deny storage; dismiss in memory anyway.
    }
    setVisible(false);
  }

  return (
    <aside className="first-visit-hint" aria-label={`Підказка: ${title}`}>
      <div className="first-visit-hint__heading"><span>ПЕРШИЙ ВІЗИТ</span><strong>{title}</strong></div>
      <ol>{items.map((item, index) => <li key={item}><b>{index + 1}</b><span>{item}</span></li>)}</ol>
      <button onClick={dismiss} type="button">ЗРОЗУМІЛО</button>
    </aside>
  );
}
