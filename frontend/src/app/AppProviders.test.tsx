import { useQueryClient } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { QueryClient } from '@tanstack/react-query'
import { useTheme } from 'styled-components'
import { expect, it, vi } from 'vitest'
import { GlobalStyles, theme } from '../design-system'
import { queryClient } from '../lib/queryClient'
import { AppProviders } from './AppProviders'

vi.mock('../design-system', () => import('../design-system/mocks'))

function Probe() {
  const client = useQueryClient()
  const current = useTheme()
  return (
    <p>
      {client === queryClient ? 'default' : 'custom'}
      {current === theme ? ' themed' : ' unthemed'}
    </p>
  )
}

it('renders children with the default query client, theme and global styles', () => {
  render(
    <AppProviders>
      <Probe />
    </AppProviders>,
  )
  expect(screen.getByText('default themed')).toBeInTheDocument()
  expect(GlobalStyles).toHaveBeenCalled()
})

it('uses a client passed in as a prop', () => {
  render(
    <AppProviders client={new QueryClient()}>
      <Probe />
    </AppProviders>,
  )
  expect(screen.getByText('custom themed')).toBeInTheDocument()
})
