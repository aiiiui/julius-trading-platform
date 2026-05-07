/**
 * Julius Caesar monogram logo — circular medallion style.
 * Inspired by classical Roman coin / cameo:
 *   outer gold ring → laurel wreath ring → inner border → profile silhouette
 */
export function JuliusLogo({ size = 44 }: { size?: number }) {
  const cx = 25, cy = 25

  // Laurel wreath: 22 leaves arranged tangentially around the wreath ring
  const WREATH_R  = 21.2   // radius of leaf centres
  const N_LEAVES  = 22
  const leaves = Array.from({ length: N_LEAVES }, (_, i) => {
    const deg = (i * 360) / N_LEAVES
    const rad = (deg * Math.PI) / 180
    return {
      x:   cx + WREATH_R * Math.cos(rad),
      y:   cy + WREATH_R * Math.sin(rad),
      rot: deg,   // tangential rotation
    }
  })

  return (
    <svg
      viewBox="0 0 50 50"
      width={size}
      height={size}
      style={{ display: 'block', flexShrink: 0 }}
      aria-label="Julius"
    >
      {/* ── Outer disc ── */}
      <circle cx={cx} cy={cy} r={24.8} fill="var(--text, #1a1814)" />

      {/* Thin gold outer ring */}
      <circle cx={cx} cy={cy} r={23.8} fill="none" stroke="#c9a227" strokeWidth="0.7" />

      {/* ── Laurel wreath ring (between r≈17.5 and r≈24) ── */}
      {leaves.map(({ x, y, rot }, i) => (
        <ellipse
          key={i}
          cx={x} cy={y}
          rx={1.3} ry={3.6}
          transform={`rotate(${rot} ${x} ${y})`}
          fill="#b8961e"
          opacity="0.92"
        />
      ))}

      {/* Inner gold border ring — seals the wreath from the portrait */}
      <circle cx={cx} cy={cy} r={17.5} fill="none" stroke="#c9a227" strokeWidth="0.9" />

      {/* Dark fill inside inner ring — clean portrait field */}
      <circle cx={cx} cy={cy} r={17} fill="#130f0a" />

      {/* ── Caesar profile — ivory, facing right ──
          Traced clockwise from crown:
          back-of-skull → nape → toga → front-neck → jaw →
          chin → lips → nose → nose-bridge → brow → forehead → crown
      */}
      <path
        d={`
          M 22 12
          Q 14 12 12 21
          Q 11 29 14 36
          L 14 42
          L 29 42
          L 28 37
          L 27 34
          L 24 35
          L 29 31
          L 30 28
          L 34 25
          Q 36.5 22 35 19
          L 31 16
          L 28 13
          L 22 12 Z
        `}
        fill="#ede0c4"
      />

      {/* ── Laurel headband on the figure ── */}
      <path
        d="M 15 19 Q 22 14.5 31 18"
        fill="none"
        stroke="#c9a227"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {/* Three leaves on the band */}
      <ellipse cx="18.5" cy="16.5" rx="2.2" ry="0.9" transform="rotate(-22 18.5 16.5)" fill="#c9a227" />
      <ellipse cx="23.5" cy="15"   rx="2.2" ry="0.9" transform="rotate(0   23.5 15)"   fill="#c9a227" />
      <ellipse cx="28.5" cy="16.5" rx="2.2" ry="0.9" transform="rotate(22  28.5 16.5)" fill="#c9a227" />

      {/* Eye */}
      <ellipse cx="16.8" cy="21.5" rx="1.7" ry="1.1" fill="#0e0b06" />

      {/* Toga drape line */}
      <path
        d="M 14 42 Q 20 37.5 25 36 Q 30 37.5 29 42"
        fill="none"
        stroke="#c4ae84"
        strokeWidth="0.9"
        strokeLinecap="round"
      />
    </svg>
  )
}
