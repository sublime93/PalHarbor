import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('serves the production dashboard and supports client-side navigation', async ({
  page,
}) => {
  await page.goto('/')

  await expect(
    page.getByRole('heading', { name: 'Server overview' }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Players' }).click()
  await expect(page).toHaveURL(/\/players$/)
  await expect(page.getByRole('heading', { name: /players/i })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { name: /players/i })).toBeVisible()
})

test('has no automatically detectable WCAG A or AA violations', async ({
  page,
}) => {
  await page.goto('/overview')
  await expect(
    page.getByRole('heading', { name: 'Server overview' }),
  ).toBeVisible()

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()

  expect(results.violations).toEqual([])
})
