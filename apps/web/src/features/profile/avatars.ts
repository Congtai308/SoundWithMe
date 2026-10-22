import { avatarPresetUrl, type AvatarPreset } from "@soundwithme/validation";

/** The funny singer avatars (public/avatars), in the order they're offered. */
export const AVATARS: { id: AvatarPreset; name: string; url: string }[] = (
  [
    ["rocker", "Jack 5 Củ"],
    ["diva", "MissThy"],
    ["rapper", "MCK-araoke"],
    ["bolero", "Đạt Villa House"],
    ["idol", "Sơn Tùng M-TPBank"],
    ["pompadour", "Ông Hoàng Mái Bằng"],
    ["disco", "BigDaddy Bé Xíu"],
    ["shower", "Soobin Hoàng Hôn"],
    ["cat", "Mèo Karaoke"],
    ["frog", "Ếch Opera"],
    ["dino", "Khủng Long Hát Rock"],
    ["offkey", "Erik Sợ Yêu"],
  ] as const
).map(([id, name]) => ({ id, name, url: avatarPresetUrl(id) }));
