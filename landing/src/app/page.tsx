import './globals.css';
import { WaveformStrip } from '@/components/WaveformStrip';
import { FeatureSection } from '@/components/FeatureSection';
import { PetalOverlay } from '@/components/PetalOverlay';

export default function Home() {
  return (
    <>
      <PetalOverlay />

      {/* ══════ HERO ══════ */}
      <section className="hero-section">
        <div className="hero-bg">
          {/* SLOT: drop a sakura photo here — recommended 1920×1080+ WebP, <300KB */}
          {/* <img src="/sakura-hero.webp" alt="" /> */}
          <div style={{width:'100%',height:'100%',background:'linear-gradient(135deg,#F5C8AE 0%,#D98278 40%,#9C4457 100%)'}} />
        </div>
        <div className="hero-scrim" />
        <div className="hero-content">
          <span className="hero-label">Open Source</span>
          <h1 className="hero-title">The voice studio that runs on your machine</h1>
          <p className="hero-subtitle">
            TTS, voice cloning, editing, mixing, and AI-powered production.
            Open-source app. Models you own forever. No subscription.
          </p>
          <div className="hero-cta-group">
            <a href="#download" className="btn btn-primary btn-pulse">
              <DownloadIcon /> Download for Desktop
            </a>
            <a
              href="https://github.com/Otoyin/voice-studio"
              className="btn btn-secondary"
              target="_blank"
              rel="noopener noreferrer"
            >
              <GitHubIcon /> View on GitHub
            </a>
          </div>
        </div>
        <span className="hero-photo-credit">
          {/* SLOT: photo credit — e.g. "Photo by Name / Unsplash" */}
        </span>
      </section>

      {/* ══════ NUMBERS ══════ */}
      <section className="numbers-section">
        <div className="numbers-row">
          <div className="number-block">
            <span className="number-block__value">15</span>
            <span className="number-block__label">engines</span>
          </div>
          <div className="number-block">
            <span className="number-block__value">25+</span>
            <span className="number-block__label">effects</span>
          </div>
          <div className="number-block">
            <span className="number-block__value">110+</span>
            <span className="number-block__label">tools</span>
          </div>
        </div>
      </section>

      {/* ══════ FEATURES ══════ */}
      <FeatureSection
        title="Voice"
        screenshot={
          <div className="screenshot-placeholder">
            {/* SLOT: Generate tab screenshot */}
            <svg className="screenshot-placeholder__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 16v-8m0 0l-3 3m3-3l3 3M3 12a9 9 0 1018 0 9 9 0 00-18 0z" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="screenshot-placeholder__label">Evidence slot — Generate tab</span>
          </div>
        }
      >
        <p>
          Type text. Pick an engine. Get speech. 15 engines — from tiny and fast
          to large and expressive. Clone a voice from a reference clip. Control
          emotion with tags. The voices are yours. They run on your hardware.
        </p>
      </FeatureSection>

      <FeatureSection
        title="Edit"
        reversed
        screenshot={
          <div className="screenshot-placeholder">
            {/* SLOT: Effects chain screenshot */}
            <svg className="screenshot-placeholder__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 6h16M4 12h10M4 18h14" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="screenshot-placeholder__label">Evidence slot — Effects chain</span>
          </div>
        }
      >
        <p>
          The waveform editor does what waveforms do — trim, split, fade, reverse,
          normalize. 25+ effects in a drag-sortable chain. Pitch map with a piano
          roll. Spectrogram. Transcript editing — click a word, hear the audio.
          All non-destructive. Always undoable.
        </p>
      </FeatureSection>

      <FeatureSection
        title="Mix"
        screenshot={
          <div className="screenshot-placeholder">
            {/* SLOT: Mixer view screenshot */}
            <svg className="screenshot-placeholder__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 20v-8m4 8v-4m4 4v-12m4 12v-6m4 6V4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="screenshot-placeholder__label">Evidence slot — Mixer view</span>
          </div>
        }
      >
        <p>
          Multi-track mixer. Channel strips with VU meters. Volume, pan, mute,
          solo. Bus routing and sidechain ducking. Master to LUFS targets. Export
          presets for Spotify, YouTube, Audible, podcasts, social. Or export to
          Reaper for DAW handoff.
        </p>
      </FeatureSection>

      <FeatureSection
        title="Produce"
        reversed
        screenshot={
          <div className="screenshot-placeholder">
            {/* SLOT: Assistant panel screenshot */}
            <svg className="screenshot-placeholder__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="screenshot-placeholder__label">Evidence slot — Assistant panel</span>
          </div>
        }
      >
        <p>
          Beyond single voices — audiobooks from EPUB imports with multi-voice
          casting. Podcast conversations with auto-ducking. ADR for film dialogue.
          Video dubbing across languages. Batch processing for bulk work. A 128-tool
          AI assistant that can drive every feature from a chat window. An MCP server
          for external agents. Content recipes that chain generation, effects, and
          mastering into one pipeline.
        </p>
      </FeatureSection>

      {/* ══════ PROMISE ══════ */}
      <section className="promise-section">
        <p>
          Your voice data stays on your machine. No cloud account to create. No
          telemetry unless you turn it on. No data leaves unless you configure a
          provider yourself. The offline-first design isn&apos;t a privacy feature
          — it&apos;s how the architecture works.
        </p>
      </section>

      {/* ══════ OPEN SOURCE ══════ */}
      <section className="opensource-section">
        <p>
          The app is free and open-source. React, Python, Tauri.
        </p>
        <a
          href="https://github.com/Otoyin/voice-studio"
          className="btn btn-ghost"
          target="_blank"
          rel="noopener noreferrer"
        >
          <GitHubIcon /> View on GitHub
        </a>
      </section>

      {/* ══════ CTA ══════ */}
      <section className="cta-section" id="download">
        <h2 className="cta-title">Start producing</h2>
        <p className="cta-desc">
          Download the app. The starter models are included. Premium voices
          start at $7.
        </p>
        <div className="cta-buttons">
          <a
            href="https://github.com/Otoyin/voice-studio/releases"
            className="btn btn-primary btn-pulse"
            target="_blank"
            rel="noopener noreferrer"
          >
            <DownloadIcon /> Download v0.1
          </a>
          <a
            href="https://github.com/Otoyin/voice-studio"
            className="btn btn-secondary"
            style={{color:'var(--text-on-dark)',borderColor:'rgba(255,255,255,.3)'}}
            target="_blank"
            rel="noopener noreferrer"
          >
            <GitHubIcon /> View on GitHub
          </a>
        </div>
      </section>

      <footer className="footer">
        Otoyin · React · Python · Tauri
      </footer>
    </>
  );
}

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}
