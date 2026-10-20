---
name: Obsidian Audio Atmosphere
colors:
  surface: '#121318'
  surface-dim: '#121318'
  surface-bright: '#38393f'
  surface-container-lowest: '#0d0e13'
  surface-container-low: '#1a1b21'
  surface-container: '#1e1f25'
  surface-container-high: '#292a2f'
  surface-container-highest: '#34343a'
  on-surface: '#e3e1e9'
  on-surface-variant: '#cbc3d7'
  inverse-surface: '#e3e1e9'
  inverse-on-surface: '#2f3036'
  outline: '#958ea0'
  outline-variant: '#494454'
  surface-tint: '#d0bcff'
  primary: '#d0bcff'
  on-primary: '#3c0091'
  primary-container: '#a078ff'
  on-primary-container: '#340080'
  inverse-primary: '#6d3bd7'
  secondary: '#4cd7f6'
  on-secondary: '#003640'
  secondary-container: '#03b5d3'
  on-secondary-container: '#00424e'
  tertiary: '#ffb2b7'
  on-tertiary: '#67001b'
  tertiary-container: '#ff516a'
  on-tertiary-container: '#5b0017'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e9ddff'
  primary-fixed-dim: '#d0bcff'
  on-primary-fixed: '#23005c'
  on-primary-fixed-variant: '#5516be'
  secondary-fixed: '#acedff'
  secondary-fixed-dim: '#4cd7f6'
  on-secondary-fixed: '#001f26'
  on-secondary-fixed-variant: '#004e5c'
  tertiary-fixed: '#ffdadb'
  tertiary-fixed-dim: '#ffb2b7'
  on-tertiary-fixed: '#40000d'
  on-tertiary-fixed-variant: '#92002a'
  background: '#121318'
  on-background: '#e3e1e9'
  surface-variant: '#34343a'
typography:
  display-hero:
    fontFamily: Plus Jakarta Sans
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.03em
  display-hero-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.025em
  headline-xl-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 34px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: 0em
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: -0.005em
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-mono-md:
    fontFamily: Space Grotesk
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: 0.03em
  label-mono-sm:
    fontFamily: Space Grotesk
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.06em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  space-2xs: 0.25rem
  space-xs: 0.5rem
  space-sm: 0.75rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
  space-2xl: 3rem
  space-3xl: 4rem
  gutter-mobile: 1rem
  gutter-desktop: 1.5rem
  margin-mobile: 1rem
  margin-tablet: 2rem
  margin-desktop: 2.5rem
---

## Brand & Style
The design system crafts an intimate, cinematic sanctuary for shared auditory experiences. It merges the technical fidelity of a world-class audio workstation with the ambient warmth of late-night living room listening sessions. The aesthetic balances deep immersive darkness with luminous atmospheric highlights, evoking a feeling of late-night discovery, shared vulnerability, and synchronous sonic connection.

The core visual style is an evolution of **Atmospheric Glassmorphism and Deep Void Layering**:
- **Void Depth:** Deep obsidian black canvases provide unbounded visual contrast, ensuring cover art and music metadata act as the primary luminaires of the interface.
- **Dynamic Spectral Glow:** Ambient lighting extracted dynamically from active album art refracts through frosted glass sheets, bathing the environment in subtle, living hues.
- **Cinematic Intimacy:** Micro-social cues—such as co-listening pulses, shared seekhead needles, and floating emotive ripples—deliver a persistent sense of presence without cluttering the audio playback hierarchy.

## Colors
The palette is rooted in an abyss of deep obsidian blacks and dark navy hues, punctuated by vibrant, luminous emitters that represent music activity, live presence, and emotional response.

### Core Role Definitions
- **Primary (`#8B5CF6` / `#7C3AED`):** Electric Violet represents platform identity, shared playback sync states, primary actions, and focused track waveforms.
- **Secondary (`#06B6D4` / `#38BDF8`):** Celestial Cyan defines synchronized streams, guest listeners, audio quality indicators (Hi-Res Lossless, Spatial), and active frequency visualizers.
- **Tertiary (`#F43F5E` / `#EC4899`):** Luminous Rose drives emotional resonance, hearts, live listener reactions, and intimate audio room badges.
- **Neutral Surface Hierarchy:**
  - `canvas`: `#07080D` (Deep void floor)
  - `surface-base`: `#0B0E17` (Obsidian navy structural containers)
  - `surface-glass`: `rgba(18, 24, 38, 0.75)` (Translucent panels with backdrop blur)
  - `surface-elevated`: `rgba(30, 41, 59, 0.65)` (Floating controls, drawers, modals)
  - `border-hairline`: `rgba(255, 255, 255, 0.08)` (Structural definition)
  - `border-highlight`: `rgba(255, 255, 255, 0.18)` (Hovered interactive borders)

### Text & Tone Scales
- **Text High-Contrast:** `#F8FAFC` (98% lightness for track titles and essential UI labels)
- **Text Balanced:** `#94A3B8` (Subtitles, artist credits, inactive tabs)
- **Text Low-Contrast:** `#475569` (Timestamps, track duration, secondary counters)

## Typography
The system employs **Plus Jakarta Sans** as the foundational voice for editorial and navigational elegance. Its balanced, modern humanist curves feel warm and conversational for social moments yet remain crisp and legible against obsidian backgrounds. 

To introduce precision audio-engineering cues, **Space Grotesk** is utilized selectively for technical labels, timecodes, bitrates, audio formats (e.g., `24-bit / 96kHz Lossless`), and co-listener position counters.

### Hierarchy & Treatment Rules
- **Track & Album Headlines:** Rendered in `headline-xl` and `headline-lg` with tight tracking (`-0.02em`) to produce an album-cover editorial aesthetic.
- **Collaborative Contexts:** Artist names paired with co-listener annotations use `body-md` in balanced neutral tones (`#94A3B8`), keeping primary emphasis on the composition.
- **Meters & Technical Metrics:** All time indicators (`02:41 / 04:15`) and sync counters strictly require `label-mono-sm` or `label-mono-md` to avoid layout jitter during live real-time ticking.

## Layout & Spacing
The layout follows an asymmetrical fluid grid, providing an expansive music-first stage while keeping the persistent social dock easily accessible.

### Structure Breakdown
- **Desktop (1024px+):** 
  - 3-column architecture:
    1. *Left Navigation Dock (Fixed 240px)*: Library, channels, friends list.
    2. *Central Audio Arena (Fluid)*: Dynamic artwork canvas, collaborative playlist feed, lyrics scroll.
    3. *Right Presence Wing (Fixed 320px)*: "Listening Room", synchronized audio peers, voice stage, and reaction stream.
  - 12-column internal grid with `1.5rem` gutters and `2.5rem` outer margins.
- **Tablet (768px – 1023px):**
  - Left navigation collapses to an icon rail (`72px`).
  - Right Presence Wing converts into an overlay drawer toggleable from the master player bar.
  - 8-column internal grid with `1.25rem` gutters and `2rem` margins.
- **Mobile (<768px):**
  - Single fluid column layout with a fixed bottom "Now Playing" mini-bar and persistent tab bar.
  - Full-screen swipeable "Listening Room" modal with gesture-driven swipe-to-react.
  - 4-column layout with `1rem` gutters and `1rem` edge margins.

## Elevation & Depth
Depth is built not through opaque surface lift, but through atmospheric lighting and varying optical densities. The design system rejects generic drop shadows in favor of translucent, tinted glow fields that mimic the physical dispersal of light in a dark room.

### Surface Tiers
1. **Level 0 (Abyss):** Base background `#07080D`. Flat, absorbing all light.
2. **Level 1 (Submerged Containers):** Solid `#0B0E17` with `border: 1px solid rgba(255, 255, 255, 0.04)`. Used for track lists, library shelves, and secondary modules.
3. **Level 2 (Obsidian Frosted Glass):** `background: rgba(18, 24, 38, 0.75)`, `backdrop-filter: blur(24px)`, `border: 1px solid rgba(255, 255, 255, 0.08)`. Applied to floating player decks, dynamic room panels, and navigation shells.
4. **Level 3 (Interactive Floating Elements):** `background: rgba(30, 41, 59, 0.85)`, `backdrop-filter: blur(32px)`, `border: 1px solid rgba(255, 255, 255, 0.16)`. Accompanied by an ambient shadow: `box-shadow: 0 12px 36px -4px rgba(0, 0, 0, 0.65), 0 0 24px -2px rgba(139, 92, 246, 0.12)`. Used for menus, tooltips, and active avatar action popovers.

### Artwork Aurora Effect
Behind the primary playback view, a dynamic ambient underglow is projected by sampling the dominant palette of the active album cover, blurred at `120px` radius with `35%` opacity. This visually connects UI glass containers to the playing track.

## Shapes
The system utilizes geometric refinement with soft, tactile curvature. Interactive components feel organic and comfortable to the touch, referencing the curved edges of modern audio hardware and portable hi-fi players.

### Corner Radius Allocation
- **Base Components (`0.5rem` / `8px`):** Checkboxes, tags, track item rows, tooltips.
- **Containers & Cards (`1rem` / `16px`):** Track preview tiles, playlist cards, floating glass toolbars, chat modules.
- **Display Canvases & Player Shells (`1.5rem` / `24px`):** Now-Playing views, modal viewports, artwork frames.
- **Pill Formats (Fully Rounded / `9999px`):** Play/pause buttons, synced co-listener pills, audio format badges, and live floating reaction bubbles.

## Components

### Buttons
- **Primary Audio Action (Play/Sync):** Pill-shaped (`rounded-full`). Filled with electric violet gradient (`linear-gradient(135deg, #8B5CF6, #7C3AED)`), text and icons in pure white (`#FFFFFF`). Glows on hover: `box-shadow: 0 0 20px rgba(139, 92, 246, 0.4)`. Active state triggers scale down to `0.96`.
- **Secondary Ghost Controls:** Pill-shaped glass container (`rgba(255, 255, 255, 0.06)`), hairline border (`rgba(255, 255, 255, 0.12)`), text `#F8FAFC`. Subtle violet shift on hover.
- **Icon Buttons (Skip, Shuffle, Repeat):** Transparent circle hit areas (`40x40px`). Neutral icon `#94A3B8` transitioning to `#F8FAFC` on hover. Active toggle states illuminate with secondary cyan glow.

### Presence & Synchronized Playback Badges
- **Co-Listening Pill:** A compact pill combining the primary user avatar and synced friend avatars with a shared pulse border. Displays an animated mini-equalizer graphic (3 bars jumping in sequence) and a label in `label-mono-sm` reading `"IN SYNC · 00:00"`.
- **Latency / Drift Indicator:** A micro-dot rendered in Celestial Cyan (`#06B6D4`) pulsing when audio drift is below `15ms`, transitioning to subtle amber if network desynchronization occurs.

### Input Fields & Search
- **Ambient Search Field:** Input fields use `surface-glass` with a delicate hairline outline (`rgba(255, 255, 255, 0.08)`). Focus transitions smoothly to an electric violet outline (`#8B5CF6`) with an internal subtle glow (`box-shadow: inset 0 0 12px rgba(139, 92, 246, 0.15)`). Placeholder text set in `#475569`.

### Track List & Collaborative Rows
- **List Item:** Row container with `rounded-md`, transparent background. On hover, reveals obsidian glass highlight (`rgba(255, 255, 255, 0.04)`).
- **Track State Markers:**
  - *Currently Playing:* Track name shifts to `#8B5CF6`; index number swaps to an active 3-bar audio wave animation.
  - *Added By Friend Badge:* Inline miniature avatar (`18x18px`) aligned next to the duration timestamp showing who added the song to the session.

### Floating Reaction States
- **Reaction Bubbles:** Spatially detached, buoyant pills (`rgba(18, 24, 38, 0.85)` + `border: 1px solid rgba(244, 63, 94, 0.3)`) holding emoji bursts (🔥, 💜, 😭, ⚡) with tiny user avatars attached. They rise vertically alongside the album artwork on key beat drops and fade out over `2.4s` with ease-out physics.

### Seekbar & Scrubber
- **Dual Needle Track:** The progress rail is a 4px high track with background `rgba(255, 255, 255, 0.12)`. The active track progress renders in `#8B5CF6`. Synced friends' listening heads appear as miniature colored halo rings directly on the timeline, showing mutual position in real-time.