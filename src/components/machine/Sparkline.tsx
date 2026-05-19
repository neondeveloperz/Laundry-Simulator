// Path: src/components/machine/Sparkline.tsx
interface SparklineProps {
  data: number[]
  color?: string
  height?: number
  width?: number
  min?: number
  max?: number
}

export function Sparkline({
  data,
  color = "#6366f1",
  height = 32,
  width = 80,
  min = 0,
  max = 100,
}: SparklineProps) {
  if (data.length < 2) return <svg width={width} height={height} />

  const range = max - min || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / range) * height
    return `${x},${y}`
  })

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.85}
      />
      {/* Gradient fill */}
      <defs>
        <linearGradient id={`sg-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon
        points={`0,${height} ${pts.join(" ")} ${width},${height}`}
        fill={`url(#sg-${color.replace("#", "")})`}
      />
    </svg>
  )
}
