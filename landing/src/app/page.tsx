import './globals.css';
import { WaveformStrip } from '@/components/WaveformStrip';
import { FeatureSection } from '@/components/FeatureSection';

export default function Home() {
  return (
    <>
      <section className="hero-section">
        <div className="hero-content">
          <span className="hero-label">Open Source</span>
          <h1 className="hero-title">The voice studio that runs on your machine</h1>
          <p className="hero-subtitle">
            TTS, voice cloning, editing, mixing, and AI-powered production.
            Open-source app. Models you own forever. No subscription.
          </p>
          <div className="hero-cta-group">
            <a href="#download" className="btn btn-primary">
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
        <WaveformStrip />
      </section>

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

      <FeatureSection
        title="Voice"
        screenshot={
          <div className="screenshot-placeholder">
            <div className="screenshot-placeholder__label">Generate tab</div>
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
            <div className="screenshot-placeholder__label">Effects chain</div>
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
            <div className="screenshot-placeholder__label">Mixer view</div>
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
            <div className="screenshot-placeholder__label">Assistant panel</div>
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

      <section className="promise-section">
        <p>
          Your voice data stays on your machine. No cloud account to create. No
          telemetry unless you turn it on. No data leaves unless you configure a
          provider yourself. The offline-first design isn&apos;t a privacy feature
          — it&apos;s how the architecture works.
        </p>
      </section>

      <section className="opensource-section">
        <p>
          The app is free and open-source. React, Python, Tauri.
        </p>
        <a
          href="https://github.com/Otoyin/voice-studio"
          className="btn btn-secondary"
          target="_blank"
          rel="noopener noreferrer"
        >
          <GitHubIcon /> View on GitHub
        </a>
      </section>

      <section className="cta-section" id="download">
        <h2 className="cta-title">Start producing</h2>
        <p className="cta-desc">
          Download the app. The starter models are included. Premium voices
          start at $7.
        </p>
        <div className="cta-buttons">
          <a
            href="https://github.com/Otoyin/voice-studio/releases"
            className="btn btn-primary"
            target="_blank"
            rel="noopener noreferrer"
          >
            <DownloadIcon /> Download v0.1
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
      </section>

      <footer className="footer">
        Otoyin &middot; React &middot; Python &middot; Tauri
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
