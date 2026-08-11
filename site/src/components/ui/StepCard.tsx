import './StepCard.css';

interface StepCardProps {
  number: string;
  title: string;
  body: string;
}

export function StepCard({ number, title, body }: StepCardProps) {
  return (
    <div className="step-card">
      <span className="step-card-number">{number}</span>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}
