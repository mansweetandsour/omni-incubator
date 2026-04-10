import { describe, it, expect, vi } from 'vitest'

// Mock the adminClient so it doesn't require env vars at import time
vi.mock('@/lib/supabase/admin', () => ({
  adminClient: {},
}))

import { calculateEntries, computeLeadCaptureEntries } from '../sweepstakes'

describe('calculateEntries', () => {
  it('case 1: custom_entry_amount, no multiplier, no coupon', () => {
    const result = calculateEntries({
      product: { price_cents: 2000, member_price_cents: null, custom_entry_amount: 50 },
      listPriceCents: 2000,
      pricePaidCents: 2000,
      sweepstakeId: 'test-sweep',
      activeMultiplierMax: null,
      coupon: null,
    })
    expect(result.baseEntries).toBe(50)
    expect(result.multiplier).toBe(1.0)
    expect(result.couponMultiplier).toBe(1.0)
    expect(result.bonusEntries).toBe(0)
    expect(result.totalEntries).toBe(50)
  })

  it('case 2: dollar-based entries (no custom_entry_amount), member price paid', () => {
    const result = calculateEntries({
      product: { price_cents: 2000, member_price_cents: null, custom_entry_amount: null },
      listPriceCents: 2000,
      pricePaidCents: 1000,
      sweepstakeId: 'test-sweep',
      activeMultiplierMax: null,
      coupon: null,
    })
    expect(result.baseEntries).toBe(20)
    expect(result.totalEntries).toBe(20)
    expect(result.amountCents).toBe(1000)
  })

  it('case 3: custom_entry_amount with active multiplier 2x', () => {
    const result = calculateEntries({
      product: { price_cents: 2000, member_price_cents: null, custom_entry_amount: 50 },
      listPriceCents: 2000,
      pricePaidCents: 2000,
      sweepstakeId: 'test-sweep',
      activeMultiplierMax: 2.0,
      coupon: null,
    })
    expect(result.totalEntries).toBe(100)
    expect(result.multiplier).toBe(2.0)
  })

  it('case 4: multiplier coupon stacks with global multiplier', () => {
    // floor(50 * 2.0 * 1.5) = floor(150) = 150
    const result = calculateEntries({
      product: { price_cents: 2000, member_price_cents: null, custom_entry_amount: 50 },
      listPriceCents: 2000,
      pricePaidCents: 2000,
      sweepstakeId: 'test-sweep',
      activeMultiplierMax: 2.0,
      coupon: { entry_type: 'multiplier', entry_value: 1.5 },
    })
    expect(result.couponMultiplier).toBe(1.5)
    expect(result.bonusEntries).toBe(0)
    expect(result.totalEntries).toBe(150)
  })

  it('case 5: fixed_bonus coupon adds flat entries on top of multiplied base', () => {
    // floor(50 * 2.0 * 1.0) + 25 = 100 + 25 = 125
    const result = calculateEntries({
      product: { price_cents: 2000, member_price_cents: null, custom_entry_amount: 50 },
      listPriceCents: 2000,
      pricePaidCents: 2000,
      sweepstakeId: 'test-sweep',
      activeMultiplierMax: 2.0,
      coupon: { entry_type: 'fixed_bonus', entry_value: 25 },
    })
    expect(result.couponMultiplier).toBe(1.0)
    expect(result.bonusEntries).toBe(25)
    expect(result.totalEntries).toBe(125)
  })
})

describe('computeLeadCaptureEntries', () => {
  it('returns nonPurchaseEntryAmount when sampleCustomAmount is null', () => {
    expect(computeLeadCaptureEntries(3, null)).toBe(3)
  })

  it('returns sampleCustomAmount when provided (takes priority)', () => {
    expect(computeLeadCaptureEntries(3, 10)).toBe(10)
  })
})
