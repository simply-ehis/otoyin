'use client';

const PETAL_COUNT = 12;

function randomBetween(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

export function PetalOverlay() {
  const petals = Array.from({ length: PETAL_COUNT }, (_, i) => ({
    id: i,
    left: `${randomBetween(0, 100)}%`,
    size: randomBetween(8, 16),
    duration: randomBetween(8, 16),
    delay: randomBetween(0, 10),
    drift: randomBetween(-40, 80),
  }));

  return (
    <div className="petal-layer" aria-hidden="true">
      {petals.map((p) => (
        <span
          key={p.id}
          className="petal"
          style={{
            left: p.left,
            width: p.size,
            height: p.size,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
            ['--drift' as string]: `${p.drift}px`,
          }}
        />
      ))}
    </div>
  );
}
