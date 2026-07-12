interface Props {
  steps: string[]
  current: number
}

export default function StepIndicator({ steps, current }: Props) {
  return (
    <div className="flex items-start">
      {steps.map((label, i) => {
        const num = i + 1
        const done = num < current
        const active = num === current
        return (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`w-7 h-7 flex items-center justify-center text-[11px] font-sans font-medium border transition-colors duration-200 ${
                  done
                    ? 'bg-forest border-forest text-cream'
                    : active
                    ? 'border-forest text-forest'
                    : 'border-stroke-dark text-muted'
                }`}
              >
                {done ? (
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                    <path
                      d="M1.5 5.5L4.5 8.5L9.5 2.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  num
                )}
              </div>
              <span
                className={`text-[9px] tracking-[0.12em] font-sans mt-1.5 hidden sm:block whitespace-nowrap ${
                  active ? 'text-cream' : done ? 'text-forest' : 'text-muted'
                }`}
              >
                {label.toUpperCase()}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`w-10 lg:w-16 h-px mx-1.5 mb-4 transition-colors duration-200 ${
                  done ? 'bg-forest' : 'bg-stroke-dark'
                }`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
