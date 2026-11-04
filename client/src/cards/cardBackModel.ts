const safeId = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, "-");

export const CARD_BACK_MATERIAL_ID = "wood";
export const CARD_BACK_TEXTURE_KEY = "card-back:shader-v1";

/** A shared vector plate. The WebGL wood material shades it wherever a card back is shown. */
export function renderCardBackSvg(id: string) {
  const key = safeId(id);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 312" preserveAspectRatio="none" aria-hidden="true">
  <defs>
    <linearGradient id="${key}-ground" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#21140d"/><stop offset=".48" stop-color="#4b321d"/><stop offset="1" stop-color="#160d08"/></linearGradient>
    <linearGradient id="${key}-gold" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#f0d49a"/><stop offset=".48" stop-color="#a8753b"/><stop offset="1" stop-color="#e6c27d"/></linearGradient>
    <radialGradient id="${key}-seal" cx=".42" cy=".34" r=".72"><stop stop-color="#82613a"/><stop offset=".66" stop-color="#352216"/><stop offset="1" stop-color="#180e08"/></radialGradient>
    <pattern id="${key}-weave" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M14 1 27 14 14 27 1 14Z" fill="none" stroke="#d4ad6e" stroke-opacity=".28" stroke-width="1.2"/><path d="M14 6 22 14 14 22 6 14Z" fill="none" stroke="#0d0805" stroke-opacity=".7" stroke-width="1"/></pattern>
    <clipPath id="${key}-clip"><rect x="5" y="5" width="230" height="302" rx="16"/></clipPath>
  </defs>
  <g clip-path="url(#${key}-clip)">
    <rect x="5" y="5" width="230" height="302" fill="url(#${key}-ground)"/>
    <rect x="5" y="5" width="230" height="302" fill="url(#${key}-weave)" opacity=".42"/>
    <path d="M17 35 35 17H205L223 35V277L205 295H35L17 277Z" fill="none" stroke="url(#${key}-gold)" stroke-width="3"/>
    <path d="M24 42 42 24H198L216 42V270L198 288H42L24 270Z" fill="none" stroke="#e0bd7f" stroke-opacity=".72" stroke-width="1.2"/>
    <path d="M36 65 65 36H175L204 65V247L175 276H65L36 247Z" fill="none" stroke="#0c0805" stroke-opacity=".82" stroke-width="2"/>
    <g fill="none" stroke="url(#${key}-gold)" stroke-linecap="round" stroke-linejoin="round">
      <path d="M43 58Q60 42 77 58Q60 75 43 58ZM197 58Q180 42 163 58Q180 75 197 58Z" stroke-width="2.1"/>
      <path d="M43 254Q60 270 77 254Q60 237 43 254ZM197 254Q180 270 163 254Q180 237 197 254Z" stroke-width="2.1"/>
      <path d="M120 39V76M120 236V273M36 156H72M168 156H204" stroke-width="1.4"/>
      <path d="M54 82 73 101M186 82 167 101M54 230 73 211M186 230 167 211" stroke-width="1.2"/>
    </g>
    <path d="M120 77 199 156 120 235 41 156Z" fill="#20140d" fill-opacity=".82" stroke="url(#${key}-gold)" stroke-width="3"/>
    <path d="M120 89 187 156 120 223 53 156Z" fill="none" stroke="#e4c486" stroke-opacity=".7" stroke-width="1.2"/>
    <circle cx="120" cy="156" r="39" fill="url(#${key}-seal)" stroke="url(#${key}-gold)" stroke-width="3"/>
    <circle cx="120" cy="156" r="32" fill="none" stroke="#e8ca8d" stroke-opacity=".72" stroke-width="1.2"/>
    <circle cx="120" cy="156" r="26" fill="none" stroke="#120b07" stroke-width="2"/>
    <path d="M120 185V133M120 146Q103 143 100 129Q116 130 120 146ZM120 155Q136 151 140 137Q124 138 120 155ZM120 165Q105 162 101 150Q116 150 120 165ZM120 173Q134 169 138 158Q124 159 120 173Z" fill="none" stroke="url(#${key}-gold)" stroke-linecap="round" stroke-linejoin="round" stroke-width="3"/>
    <path d="M110 185H130M116 191H124" stroke="#edcf91" stroke-linecap="round" stroke-width="2"/>
    <g fill="#ecd096" stroke="#160e08" stroke-width="1.2">
      <path d="M120 103 124 112 120 121 116 112Z"/><path d="M120 191 124 200 120 209 116 200Z"/>
      <path d="M67 156 76 152 85 156 76 160Z"/><path d="M155 156 164 152 173 156 164 160Z"/>
    </g>
  </g>
  <rect x="5.5" y="5.5" width="229" height="301" rx="16" fill="none" stroke="#100904" stroke-width="4"/>
  <rect x="8" y="8" width="224" height="296" rx="13" fill="none" stroke="#d5b376" stroke-width="1.4"/>
</svg>`;
}
