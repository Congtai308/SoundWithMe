/**
 * Every Material Symbols icon the app shows. The page loads only these
 * glyphs (~19 KB instead of the full 4 MB font), so an icon missing here
 * renders as its name in plain text. `pnpm lint` checks the code against
 * this list (scripts/check-icons.mjs). Alphabetical: Google Fonts wants it so.
 */
export const ICON_NAMES = [
  "2d", "add", "add_circle", "add_reaction", "admin_panel_settings", "ads_click", "album", "arrow_back",
  "arrow_forward", "auto_awesome", "autorenew", "badge", "block", "bolt", "casino", "chat", "chat_bubble",
  "check", "check_circle", "chevron_right", "close", "close_fullscreen", "coffee", "content_copy", "delete",
  "description", "directions_car", "diversity_3", "dns", "done", "done_all", "duo", "email", "energy",
  "equalizer", "error", "expand_less", "expand_more", "explore", "fast_forward", "fast_rewind", "favorite",
  "forum", "forward_to_inbox", "genres", "graphic_eq", "grid_view", "group", "group_add", "groups",
  "headphones", "headset_off", "hide", "history", "host", "hourglass_top", "how_to_reg", "how_to_vote",
  "http", "info", "key", "keyboard_double_arrow_left", "keyboard_double_arrow_right", "label",
  "left_panel_close", "left_panel_open", "library_music", "link", "link_off", "list", "lock", "lock_reset",
  "login", "logout", "looks_one", "lyrics", "mail", "mark_email_read", "mark_email_unread", "meeting_room",
  "menu", "mic", "mic_off", "music_note", "music_off", "notifications", "open_in_full", "password", "pause",
  "people", "person_add", "person_remove", "person_search", "play_arrow", "play_circle", "playlist_add",
  "playlist_add_check", "playlist_play", "podcasts", "progress_activity", "psychology", "public", "queue",
  "queue_music", "radio", "record_voice_over", "refresh", "remove_circle", "resize", "room", "schedule_send",
  "script", "search", "search_off", "send", "sensors", "sensors_off", "settings", "share", "shield_person",
  "skip_next", "skip_previous", "smart_display", "speaker_notes_off", "speed", "stadium", "start", "step",
  "stop_circle", "switch", "sync", "sync_problem", "tab", "thumb_down", "thumb_up", "timer", "title",
  "token", "topic", "touch_app", "tune", "undo", "verified", "visibility", "visibility_off", "volume_down",
  "volume_off", "volume_up", "warning", "wifi_off", "workspace_premium",
] as const;

/** Only the axes the app uses: 24 px optical size, weight 400, grade 0, outline and filled. */
export const ICON_FONT_URL = `https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0..1,0&icon_names=${ICON_NAMES.join(",")}&display=block`;
