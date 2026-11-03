export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size }} aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? 'brand--compact' : ''}`}>
      <BrandMark />
      <div className="brand__type">
        <strong>Shortlist</strong>
        {!compact && <span>by Company A Staffing</span>}
      </div>
    </div>
  );
}
