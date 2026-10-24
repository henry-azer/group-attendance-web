// #/a/settings — group name/timezone, share link, admin code reveal + "remember on this device",
// and the one-way "forget on this device" that signs this browser out of admin.
import { useMemo, useState } from 'react'
import { adminRenameGroup } from '../../api/rpc.ts'
import type { AdminGroup } from '../../domain/types.ts'
import { navigate } from '../../lib/router.ts'
import { clearAdminCode, getAdminCode, isAdminCodeRemembered, setAdminCode } from '../../lib/storage.ts'
import { Button, Card, Field, TextInput, useToast } from '../../ui/index.ts'
import { handleMutationNotFound } from './adminErrors.ts'

export interface SettingsTabProps {
  adminCode: string
  group: AdminGroup
  onReload: () => Promise<void>
}

function timezoneOptions(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    return [Intl.DateTimeFormat().resolvedOptions().timeZone]
  }
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function SettingsTab({ adminCode, group, onReload }: SettingsTabProps) {
  const { showToast } = useToast()
  const timezones = useMemo(timezoneOptions, [])

  const [name, setName] = useState(group.name)
  const [timezone, setTimezone] = useState(group.timezone)
  const [nameError, setNameError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [codeRevealed, setCodeRevealed] = useState(false)
  const [remember, setRemember] = useState(() => isAdminCodeRemembered())
  const [confirmingForget, setConfirmingForget] = useState(false)
  // The reveal reads straight from storage, per spec — it's what the device actually has saved,
  // not just the value this screen was handed.
  const storedAdminCode = getAdminCode() ?? adminCode

  const shareLink = `${location.origin}${import.meta.env.BASE_URL}#/g/${group.share_code}`
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator

  async function handleSaveDetails() {
    const trimmed = name.trim()
    if (!trimmed || trimmed.length > 80) {
      setNameError('Enter a name up to 80 characters.')
      return
    }
    setNameError(null)
    setSaving(true)
    const result = await adminRenameGroup({ admin: adminCode, name: trimmed, timezone })
    setSaving(false)
    if (!result.ok) {
      if (handleMutationNotFound(result.error, showToast, onReload)) return
      showToast("Couldn't save those changes. Try again.", 'error')
      return
    }
    showToast('Saved', 'success')
    await onReload()
  }

  async function handleCopy(text: string, label: string) {
    const copied = await copyToClipboard(text)
    showToast(copied ? `${label} copied` : "Couldn't copy — select and copy it manually", copied ? 'success' : 'error')
  }

  async function handleShare() {
    if (!canShare) return
    try {
      await navigator.share({ title: group.name, text: `Are you coming? ${group.name}`, url: shareLink })
    } catch {
      // Cancelled or unsupported mid-call — nothing to do.
    }
  }

  function handleRememberChange(checked: boolean) {
    setRemember(checked)
    setAdminCode(storedAdminCode, checked)
  }

  function handleForget() {
    clearAdminCode()
    navigate('/')
  }

  return (
    <div className="settings-tab">
      <Card className="settings-card">
        <h2 className="settings-card__heading">Group details</h2>
        <Field label="Group name" htmlFor="settings-name" error={nameError ?? undefined}>
          <TextInput
            id="settings-name"
            maxLength={80}
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (nameError) setNameError(null)
            }}
          />
        </Field>
        <Field label="Timezone" htmlFor="settings-timezone">
          <select
            id="settings-timezone"
            className="input"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          >
            {timezones.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </Field>
        <Button fullWidth disabled={saving} onClick={handleSaveDetails}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </Card>

      <Card className="settings-card">
        <h2 className="settings-card__heading">Share link</h2>
        <p className="code-card__value code-card__value--link">
          <code>{shareLink}</code>
        </p>
        <div className="code-card__actions">
          <Button variant="secondary" fullWidth onClick={() => handleCopy(shareLink, 'Share link')}>
            Copy link
          </Button>
          {canShare && (
            <Button variant="ghost" fullWidth onClick={handleShare}>
              Share…
            </Button>
          )}
        </div>
      </Card>

      <Card className="settings-card">
        <h2 className="settings-card__heading">Admin code</h2>
        <p className="code-card__value">
          <code>{codeRevealed ? storedAdminCode : '•'.repeat(storedAdminCode.length)}</code>
        </p>
        <div className="code-card__actions">
          <Button variant="secondary" fullWidth onClick={() => setCodeRevealed((v) => !v)}>
            {codeRevealed ? 'Hide' : 'Show'} admin code
          </Button>
          <Button variant="ghost" fullWidth onClick={() => handleCopy(storedAdminCode, 'Admin code')}>
            Copy admin code
          </Button>
        </div>

        <label className="settings-remember">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => handleRememberChange(e.target.checked)}
          />
          Remember on this device
        </label>
      </Card>

      <Card className="settings-card">
        <h2 className="settings-card__heading">This device</h2>
        <p className="muted">Removes the saved admin code from this browser. You'll need the code again to get back in.</p>
        {confirmingForget ? (
          <div className="settings-card__confirm">
            <Button variant="secondary" fullWidth onClick={handleForget}>
              Confirm forget
            </Button>
            <Button variant="ghost" fullWidth onClick={() => setConfirmingForget(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button variant="ghost" fullWidth onClick={() => setConfirmingForget(true)}>
            Forget on this device
          </Button>
        )}
      </Card>
    </div>
  )
}
