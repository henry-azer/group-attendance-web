import { navigate } from '../lib/router.ts'
import { Button, Card, EmptyState, useToast } from '../ui/index.ts'
import { getCreatedGroup } from './createdGroupStore.ts'

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function CreatedPage() {
  const { showToast } = useToast()
  const info = getCreatedGroup()

  if (!info) {
    return (
      <div className="container screen">
        <EmptyState
          title="Nothing to show here"
          description="This page only works right after creating a group. If you already made one, use your admin code from the home page instead."
          action={
            <Button onClick={() => navigate('/')}>Go home</Button>
          }
        />
      </div>
    )
  }

  const { name, shareCode, adminCode } = info
  const shareLink = `${location.origin}${import.meta.env.BASE_URL}#/g/${shareCode}`
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator

  async function handleCopy(text: string, label: string) {
    const copied = await copyToClipboard(text)
    showToast(copied ? `${label} copied` : `Couldn't copy — select and copy it manually`, copied ? 'success' : 'error')
  }

  async function handleShare() {
    if (!canShare) return
    try {
      await navigator.share({ title: name, text: `Are you coming? ${name}`, url: shareLink })
    } catch {
      // Cancelled or unsupported mid-call — nothing to do.
    }
  }

  return (
    <div className="container screen">
      <h1>{name} is ready</h1>
      <p className="muted">Save your admin code now — you'll need it to manage this group.</p>

      <Card className="code-card">
        <h2 className="code-card__heading">Admin code</h2>
        <p className="code-card__value">
          <code>{adminCode}</code>
        </p>
        <Button variant="secondary" fullWidth onClick={() => handleCopy(adminCode, 'Admin code')}>
          Copy admin code
        </Button>
        <p className="code-card__warning">
          Save this code. It's the only way to manage the group and can't be recovered.
        </p>
      </Card>

      <Card className="code-card">
        <h2 className="code-card__heading">Share link</h2>
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

      <Button fullWidth onClick={() => navigate('/a')}>
        Go to admin
      </Button>
    </div>
  )
}
