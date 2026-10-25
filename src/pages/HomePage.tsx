import { useState, type FormEvent } from 'react'
import { adminGetGroup } from '../api/rpc.ts'
import { navigate } from '../lib/router.ts'
import { setAdminCode } from '../lib/storage.ts'
import { Avatar, Button, Card, Field, Icon, TextInput } from '../ui/index.ts'

const PREVIEW_GOING = ['Omar', 'Sara', 'Ali', 'Layla', 'Karim', 'Mariam', 'Nour']
const PREVIEW_TOTAL = 10

// A working miniature of the member screen: tap Going and watch the headcount move. It's the
// product's own interface, so the home page shows what the link does instead of describing it.
function HomePreview() {
  const [joined, setJoined] = useState(false)
  const going = joined ? [...PREVIEW_GOING, 'You'] : PREVIEW_GOING
  const pct = (going.length / PREVIEW_TOTAL) * 100

  return (
    <div className="home-preview" aria-label="Example of what members see">
      <p className="home-preview__question">Are you coming this Friday?</p>
      <p className="home-preview__meta">5-a-side · 8:00 PM</p>
      <div className="home-preview__count">
        <span className="home-preview__number tabular" aria-live="polite">
          {going.length}
        </span>
        <span className="home-preview__label">
          going <span className="home-preview__of tabular">of {PREVIEW_TOTAL}</span>
        </span>
        <span className="avatar-stack home-preview__stack" aria-hidden="true">
          {going.slice(-4).map((name) => (
            <Avatar key={name} name={name} />
          ))}
        </span>
      </div>
      <div className="headcount__bar" aria-hidden="true">
        <span className="headcount__seg headcount__seg--going" style={{ width: `${pct}%` }} />
      </div>
      <button
        type="button"
        className={['answer', 'answer--going', 'home-preview__answer', joined && 'is-selected']
          .filter(Boolean)
          .join(' ')}
        aria-pressed={joined}
        onClick={() => setJoined((j) => !j)}
      >
        <Icon name="check" />
        {joined ? "You're going" : 'Try it: Going'}
      </button>
    </div>
  )
}

export function HomePage() {
  const [adminCodeInput, setAdminCodeInput] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleOpenWithCode(event: FormEvent) {
    event.preventDefault()
    const code = adminCodeInput.trim().toUpperCase()
    if (!code) {
      setError('Enter your admin code.')
      return
    }
    setChecking(true)
    setError(null)
    const result = await adminGetGroup(code)
    setChecking(false)
    if (!result.ok) {
      setError(
        result.error === 'not_found'
          ? "That code doesn't match a group."
          : "Couldn't check that code. Try again.",
      )
      return
    }
    setAdminCode(code, false)
    navigate('/a')
  }

  return (
    <div className="container screen">
      <section className="hero">
        <h1 className="hero__title">Who's coming?</h1>
        <p className="hero__lede">
          Set up a group, drop one link in the chat, and know who's showing up. No accounts, no
          app to install.
        </p>
        <Button fullWidth onClick={() => navigate('/new')}>
          Create a group
          <Icon name="arrow" />
        </Button>
      </section>

      <HomePreview />

      <Card className="home-admin-card" aria-labelledby="open-with-code-heading">
        <h2 id="open-with-code-heading" className="home-admin-card__heading">
          Already run a group?
        </h2>
        <form onSubmit={handleOpenWithCode} noValidate>
          <Field label="Admin code" htmlFor="admin-code-input" error={error ?? undefined}>
            <TextInput
              id="admin-code-input"
              name="adminCode"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="e.g. 7K3P9QZM2XVB4N6R"
              value={adminCodeInput}
              onChange={(e) => {
                setAdminCodeInput(e.target.value)
                if (error) setError(null)
              }}
            />
          </Field>
          <Button type="submit" variant="secondary" fullWidth disabled={checking}>
            {checking ? 'Checking…' : 'Open with admin code'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
