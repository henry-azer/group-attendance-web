// #/a/members — add, rename and remove (deactivate) members. Removing keeps history: it sets
// active=false rather than deleting the row, so past answers and attendance still resolve to a
// name. Removed members are listed read-only, for transparency, under a collapsed section.
import { useState, type FormEvent } from 'react'
import { adminDeactivateMember, adminUpsertMember } from '../../api/rpc.ts'
import type { AdminGroup } from '../../domain/types.ts'
import { Button, Card, EmptyState, Field, TextInput, useToast } from '../../ui/index.ts'
import { handleMutationNotFound } from './adminErrors.ts'

export interface MembersTabProps {
  adminCode: string
  group: AdminGroup
  onReload: () => Promise<void>
}

function AddMemberForm({ adminCode, onReload }: { adminCode: string; onReload: () => Promise<void> }) {
  const { showToast } = useToast()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || trimmed.length > 60) {
      setError('Enter a name up to 60 characters.')
      return
    }
    setError(null)
    setSubmitting(true)
    const result = await adminUpsertMember({ admin: adminCode, id: null, name: trimmed })
    setSubmitting(false)
    if (!result.ok) {
      if (handleMutationNotFound(result.error, showToast, onReload)) return
      setError(result.error === 'duplicate_name' ? 'That name is already in the group.' : "Couldn't add that member. Try again.")
      return
    }
    setName('')
    showToast('Member added', 'success')
    await onReload()
  }

  return (
    <Card className="members-add-card">
      <form onSubmit={handleSubmit} noValidate>
        <Field label="Add a member" htmlFor="new-member-name" error={error ?? undefined}>
          <div className="members-add-card__row">
            <TextInput
              id="new-member-name"
              placeholder="e.g. Sara"
              maxLength={60}
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (error) setError(null)
              }}
            />
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Adding…' : 'Add'}
            </Button>
          </div>
        </Field>
      </form>
    </Card>
  )
}

interface MemberRowProps {
  adminCode: string
  member: AdminGroup['members'][number]
  onReload: () => Promise<void>
}

function MemberRow({ adminCode, member, onReload }: MemberRowProps) {
  const { showToast } = useToast()
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(member.name)
  const [error, setError] = useState<string | null>(null)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleRename() {
    const trimmed = name.trim()
    if (!trimmed || trimmed.length > 60) {
      setError('Enter a name up to 60 characters.')
      return
    }
    setError(null)
    setSubmitting(true)
    const result = await adminUpsertMember({ admin: adminCode, id: member.id, name: trimmed })
    setSubmitting(false)
    if (!result.ok) {
      if (handleMutationNotFound(result.error, showToast, onReload)) return
      setError(result.error === 'duplicate_name' ? 'That name is already in the group.' : "Couldn't rename. Try again.")
      return
    }
    setRenaming(false)
    showToast('Member renamed', 'success')
    await onReload()
  }

  async function handleRemove() {
    setSubmitting(true)
    const result = await adminDeactivateMember({ admin: adminCode, id: member.id })
    setSubmitting(false)
    if (!result.ok) {
      if (handleMutationNotFound(result.error, showToast, onReload)) return
      showToast("Couldn't remove that member. Try again.", 'error')
      return
    }
    showToast('Member removed', 'success')
    await onReload()
  }

  if (renaming) {
    return (
      <Card className="member-row">
        <Field label="Name" htmlFor={`rename-${member.id}`} error={error ?? undefined}>
          <TextInput
            id={`rename-${member.id}`}
            maxLength={60}
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (error) setError(null)
            }}
          />
        </Field>
        <div className="member-row__actions">
          <Button disabled={submitting} onClick={handleRename}>
            {submitting ? 'Saving…' : 'Save'}
          </Button>
          <Button
            variant="ghost"
            disabled={submitting}
            onClick={() => {
              setRenaming(false)
              setName(member.name)
              setError(null)
            }}
          >
            Cancel
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <Card className="member-row">
      <span className="member-row__name">{member.name}</span>
      <div className="member-row__actions">
        {confirmingRemove ? (
          <>
            <Button variant="secondary" disabled={submitting} onClick={handleRemove}>
              {submitting ? 'Removing…' : 'Confirm remove'}
            </Button>
            <Button variant="ghost" onClick={() => setConfirmingRemove(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => setRenaming(true)}>
              Rename
            </Button>
            <Button variant="ghost" onClick={() => setConfirmingRemove(true)}>
              Remove
            </Button>
          </>
        )}
      </div>
    </Card>
  )
}

export function MembersTab({ adminCode, group, onReload }: MembersTabProps) {
  const activeMembers = group.members.filter((m) => m.active)
  const removedMembers = group.members.filter((m) => !m.active)

  return (
    <div className="members-tab">
      <AddMemberForm adminCode={adminCode} onReload={onReload} />

      {activeMembers.length === 0 ? (
        <EmptyState title="No members yet" description="Add the first one above." />
      ) : (
        <ul className="members-list">
          {activeMembers.map((member) => (
            <li key={member.id}>
              <MemberRow adminCode={adminCode} member={member} onReload={onReload} />
            </li>
          ))}
        </ul>
      )}

      {removedMembers.length > 0 && (
        <details className="members-tab__removed">
          <summary>Removed ({removedMembers.length})</summary>
          <ul className="members-list members-list--removed">
            {removedMembers.map((member) => (
              <li key={member.id} className="member-row member-row--removed">
                {member.name}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
