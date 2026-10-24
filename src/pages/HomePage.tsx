import { useState, type FormEvent } from 'react'
import { adminGetGroup } from '../api/rpc.ts'
import { navigate } from '../lib/router.ts'
import { setAdminCode } from '../lib/storage.ts'
import { Button, Card, Field, TextInput } from '../ui/index.ts'

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
        <h1>Who's coming?</h1>
        <p className="hero__lede">
          Set up a group, drop one link in the chat, and know who's showing up — no accounts, no
          app to install.
        </p>
        <Button fullWidth onClick={() => navigate('/new')}>
          Create a group
        </Button>
      </section>

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
