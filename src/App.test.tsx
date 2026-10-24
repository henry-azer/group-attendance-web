import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./pages/HomePage.tsx', () => ({
  HomePage: () => {
    throw new Error('render failure')
  },
}))

import App from './App.tsx'

describe('App', () => {
  it('catches a render error in a screen and shows the fallback', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    window.location.hash = '#/'
    render(<App />)
    expect(screen.getByText('Something went wrong')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy()
  })
})
