// Who-am-I picker for the member page. Presentational only — MemberPage owns the remembered
// selection (localStorage) and passes the resolved id down.

export interface NamePickerMember {
  id: string
  name: string
}

export interface NamePickerProps {
  members: NamePickerMember[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export function NamePicker({ members, selectedId, onSelect }: NamePickerProps) {
  return (
    <div className="name-picker" role="radiogroup" aria-label="Who are you?">
      {members.map((member) => (
        <button
          key={member.id}
          type="button"
          role="radio"
          aria-checked={member.id === selectedId}
          className={['name-picker__chip', member.id === selectedId && 'is-active']
            .filter(Boolean)
            .join(' ')}
          onClick={() => onSelect(member.id)}
        >
          {member.name}
        </button>
      ))}
    </div>
  )
}
