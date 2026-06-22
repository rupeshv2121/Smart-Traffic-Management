import { AshokaChakra } from "./Emblem";

// A consistent, self-contained "logo lockup" for partner ministries and
// national programmes. Official ministry emblems are regulated artwork, so we
// render a recognisable government-style crest (Ashoka Chakra in a tricolour
// ring) paired with the body's name — appropriate for a civic pilot dashboard.
export function MinistryCrest({
  name,
  hindi,
  tag,
}: {
  name: string;
  hindi?: string;
  tag?: string;
}) {
  return (
    <div className="ministry">
      <div className="ministry-mark">
        <AshokaChakra size={30} />
      </div>
      <div className="ministry-text">
        <span className="ministry-name">{name}</span>
        {hindi && <span className="ministry-hi hi">{hindi}</span>}
        {tag && <span className="ministry-tag">{tag}</span>}
      </div>
    </div>
  );
}
