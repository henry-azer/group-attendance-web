export interface SegmentedOption<T extends string> {
  value: T
  label: string
}

export interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[]
  value: T | null
  onChange: (value: T) => void
  'aria-label': string
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ...rest
}: SegmentedProps<T>) {
  return (
    <div className="segmented" role="radiogroup" {...rest}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className={['segmented__option', option.value === value && 'is-active']
            .filter(Boolean)
            .join(' ')}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
