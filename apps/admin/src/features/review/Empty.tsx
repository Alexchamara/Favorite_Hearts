import { Heart } from 'lucide-react';

/** The demo's empty state (.m-empty), in the staff screens' English. */
export function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="m-empty">
      <Heart size={28} aria-hidden="true" />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
