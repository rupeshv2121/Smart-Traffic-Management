/** The orchestrator's audit trail for this cycle — why it decided what it did. */
export function ReasonChain({ reasons }: { reasons: string[] }) {
  return (
    <section className="card">
      <h2 className="card-title">Decision Chain · Audit Trail</h2>
      <ol className="reasons">
        {reasons.map((r, i) => (
          <li key={i}>
            <span className="idx">{i + 1}</span>
            <span>{r}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
