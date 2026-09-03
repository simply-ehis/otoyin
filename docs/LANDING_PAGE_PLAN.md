# Otoyin Landing Page Plan

## Vision
A cinematic, immersive landing page that showcases Otoyin as the **#1 AI audio production studio** — the "Figma of audio." Dark theme, glowing accents, animated waveforms, and interactive demos that make visitors feel the power before they even download.

## Architecture
- **Standalone HTML** — single file, no build step, CDN dependencies only
- **Tailwind CSS v4** via CDN — matches the app's design system
- **Framer Motion** via CDN — smooth scroll animations
- **Canvas API** — real-time waveform visualization in hero
- **Responsive** — mobile-first, works on all devices

## Page Sections

### 1. Hero Section (Above the fold)
**Headline**: "AI Audio Studio. One App. Every Voice."
**Subheadline**: "Generate, edit, mix, and master audio with 200+ AI tools. Local-first. No cloud required."
**CTA**: "Download Free" + "Watch Demo"
**Visual**: Animated waveform that responds to mouse movement, with glowing particles

### 2. Feature Showcase (Interactive cards)
**6 flagship features** with hover animations:
1. **TTS Generation** — "50+ voices, 100+ languages" → animated waveform
2. **Voice Cloning** — "Upload 30s. Clone any voice." → voice morphing animation
3. **Audio Studio** — "Multi-track DAW with AI assists" → track timeline animation
4. **Video Dubbing** — "Translate any video. Keep every voice." → language flags animation
5. **Voice Chat** — "Real-time AI voice agent" → conversation bubbles animation
6. **Marketplace** — "200+ models. Quality-rated." → star rating animation

### 3. Stats Bar (Social proof)
- "200+ AI Tools"
- "50+ Languages"
- "100% Local"
- "Zero Latency"

### 4. How It Works (3-step flow)
1. **Describe** → Type what you want
2. **Generate** → AI creates it instantly
3. **Refine** → Edit with professional tools

### 5. Comparison Table
| Feature | Otoyin | ElevenLabs | Descript | Adobe Podcast |
|---------|--------|------------|----------|---------------|
| Local processing | ✅ | ❌ | ❌ | ❌ |
| Voice cloning | ✅ | ✅ | ❌ | ❌ |
| Multi-track DAW | ✅ | ❌ | ✅ | ❌ |
| Video dubbing | ✅ | ❌ | ✅ | ❌ |
| MCP/Agent tools | ✅ | ❌ | ❌ | ❌ |
| Free tier | ✅ | Limited | Limited | Limited |

### 6. Pricing Tiers
| Tier | Price | Features |
|------|-------|----------|
| **Free** | $0 | All tools, local models, community presets |
| **Pro** | $20/mo | Premium models, priority support, commercial license |
| **Studio** | $50/mo | Everything + API access, team features, custom voices |

### 7. Testimonials (Rotating)
3 fictional but realistic testimonials from:
- Podcaster
- Audiobook narrator
- Game developer

### 8. CTA Section
**Headline**: "Ready to create?"
**CTA**: "Download Otoyin" + "Join Discord"
**Subtext**: "Free forever. No credit card required."

### 9. Footer
- Links: Download, Documentation, GitHub, Discord, Twitter
- Copyright: © 2026 Otoyin. All rights reserved.

## Design System

### Colors (Matching app dark theme)
```css
:root {
  --bg-primary: #0a0a0f;
  --bg-secondary: #12121a;
  --bg-card: #1a1a2e;
  --accent-primary: #6366f1; /* Indigo */
  --accent-secondary: #8b5cf6; /* Violet */
  --accent-glow: #6366f180;
  --text-primary: #f8fafc;
  --text-secondary: #94a3b8;
  --border: #1e293b;
}
```

### Typography
- **Headlines**: Inter, 700 weight
- **Body**: Inter, 400 weight
- **Code**: JetBrains Mono

### Animations
- **Hero waveform**: Canvas 2D, 60fps, mouse-reactive
- **Scroll reveals**: Framer Motion, stagger children
- **Hover effects**: Scale 1.02, glow shadow
- **Particle system**: Floating dots in hero background

## File Structure
```
docs/landing/
├── index.html          # Single-file landing page
├── styles.css          # Custom styles (minimal, mostly Tailwind)
└── animations.js       # Canvas waveform + particle system
```

## Implementation Priority
1. ✅ Hero section with waveform (highest impact)
2. ✅ Feature showcase cards
3. ✅ Stats bar
4. ✅ Comparison table
5. ✅ Pricing tiers
6. ✅ CTA + Footer
7. ⬜ Interactive demos (defer)
8. ⬜ Testimonials (defer)

## Performance Budget
| Resource | Budget |
|----------|--------|
| Total HTML | < 50 KB |
| CSS (inline) | < 10 KB |
| JS (inline) | < 20 KB |
| Images | 0 (all CSS/Canvas) |
| Fonts | CDN (Inter) |
| **Total** | **< 100 KB** |

## SEO
- `<title>`: "Otoyin — AI Audio Studio | Generate, Edit, Mix, Master"
- `<meta description>`: "The #1 AI audio production studio. 200+ tools, 50+ languages, 100% local. Generate speech, clone voices, dub videos, and master audio — all in one app."
- Open Graph tags for social sharing
- Structured data for software application
