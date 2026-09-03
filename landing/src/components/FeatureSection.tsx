interface FeatureSectionProps {
  title: string;
  children: React.ReactNode;
  screenshot?: React.ReactNode;
  reversed?: boolean;
}

export function FeatureSection({ title, children, screenshot, reversed }: FeatureSectionProps) {
  return (
    <section className={`feature-section ${reversed ? 'feature-section--reversed' : ''}`}>
      <div className="feature-section__text">
        <h3 className="feature-section__title">{title}</h3>
        <div className="feature-section__body">{children}</div>
      </div>
      {screenshot && (
        <div className="feature-section__visual">
          <div className="screenshot-frame">{screenshot}</div>
        </div>
      )}
    </section>
  );
}
