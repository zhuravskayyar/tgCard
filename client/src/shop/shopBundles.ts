export type ShopBundleTheme = "elemental" | "goblins";

export interface ShopBundle {
  id: string;
  title: string;
  description: string;
  theme: ShopBundleTheme;
  art: string;
  thumbnail: string;
}

export const SHOP_BUNDLES: readonly ShopBundle[] = [
  {
    id: "elemental-spirits",
    title: "Духи стихій",
    description: "4 епічні карти • нова колекція",
    theme: "elemental",
    art: "/assets/ui/shop/bundles/shop-bundle-element-spirits.png",
    thumbnail: "/card-art/element_spirits_01.png",
  },
  {
    id: "goblin-brotherhood",
    title: "Гоблінська братва",
    description: "4 епічні карти • нова колекція",
    theme: "goblins",
    art: "/assets/ui/shop/bundles/shop-bundle-goblin-brotherhood.png",
    thumbnail: "/card-art/goblin_brotherhood_01.png",
  },
];
