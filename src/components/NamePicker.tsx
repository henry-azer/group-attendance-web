// Who-am-I picker for the member page. Presentational only — MemberPage owns the remembered
// selection (localStorage) and passes the resolved id down, and renders the visible "Who are you?"
// label this radiogroup is associated with via aria-labelledby.
import { useRef } from 'react'
import { Avatar } from '../ui/index.ts'

export interface NamePickerMember {
  id: string
  name: string
}

export interface NamePickerProps {
  members: NamePickerMember[]
  selectedId: string | null
  onSelect: (id: string) => void
  labelId: string
}

export function NamePicker({ members, selectedId, onSelect, labelId }: NamePickerProps) {
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Roving tabindex: only one chip is ever Tab-reachable (the selected one, or the first when
  // nothing is picked yet) — arrow keys move both focus and the stop within the group, per the
  // WAI-ARIA radiogroup pattern.
  const activeIndex = Math.max(
    0,
    selectedId ? members.findIndex((m) => m.id === selectedId) : 0,
  )

  function focusAndSelect(index: number) {
    const wrapped = (index + members.length) % members.length
    onSelect(members[wrapped].id)
    chipRefs.current[wrapped]?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault()
        focusAndSelect(index + 1)
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault()
        focusAndSelect(index - 1)
        break
      case 'Home':
        e.preventDefault()
        focusAndSelect(0)
        break
      case 'End':
        e.preventDefault()
        focusAndSelect(members.length - 1)
        break
      default:
        break
    }
  }

  return (
    <div className="name-picker" role="radiogroup" aria-labelledby={labelId}>
      {members.map((member, index) => (
        <button
          key={member.id}
          ref={(el) => {
            chipRefs.current[index] = el
          }}
          type="button"
          role="radio"
          aria-checked={member.id === selectedId}
          tabIndex={index === activeIndex ? 0 : -1}
          className={['name-picker__chip', member.id === selectedId && 'is-active']
            .filter(Boolean)
            .join(' ')}
          onClick={() => onSelect(member.id)}
          onKeyDown={(e) => handleKeyDown(e, index)}
        >
          <Avatar name={member.name} size="sm" />
          <span className="name-picker__name">{member.name}</span>
        </button>
      ))}
    </div>
  )
}
