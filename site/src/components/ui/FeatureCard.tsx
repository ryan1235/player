import type { ReactNode } from 'react';
import './FeatureCard.css';

interface FeatureCardProps {
  icon: ReactNode;
  title: string;
  body: string;
}

export function FeatureCard({ icon, title, body }: FeatureCardProps) {
  return (
    <div className="feature-card">
      <div className="feature-card-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{body}</p>
      <div className="feature-card-glow" aria-hidden="true" />
    </div>
  );
}
