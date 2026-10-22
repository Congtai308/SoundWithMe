import { avatarPresetUrl, type AvatarPreset } from "@soundwithme/validation";

/** The funny singer avatars (public/avatars), in the order they're offered. */
export const AVATARS: { id: AvatarPreset; name: string; url: string }[] = (
  [
    ["rocker", "Rocker Tóc Dựng"],
    ["diva", "Diva Nốt Cao"],
    ["rapper", "Rapper Kính Đen"],
    ["bolero", "Chú Bolero"],
    ["idol", "Idol Tóc Hồng"],
    ["pompadour", "Ông Hoàng Mái Bằng"],
    ["disco", "Disco Tóc Xù"],
    ["shower", "Ca Sĩ Nhà Tắm"],
    ["cat", "Mèo Karaoke"],
    ["frog", "Ếch Opera"],
    ["dino", "Khủng Long Hát Rock"],
    ["offkey", "Bé Hát Lạc Tông"],
  ] as const
).map(([id, name]) => ({ id, name, url: avatarPresetUrl(id) }));
