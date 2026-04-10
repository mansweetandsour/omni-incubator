// server-only — do not import in client components

export async function subscribeToBeehiiv(email: string): Promise<void> {
  if (!process.env.BEEHIIV_API_KEY || !process.env.BEEHIIV_PUBLICATION_ID) {
    console.warn('[beehiiv] BEEHIIV_API_KEY or BEEHIIV_PUBLICATION_ID not set — skipping subscribe')
    return
  }

  try {
    const pubId = process.env.BEEHIIV_PUBLICATION_ID
    const res = await fetch(
      `https://api.beehiiv.com/v2/publications/${pubId}/subscriptions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.BEEHIIV_API_KEY}`,
        },
        body: JSON.stringify({ email, reactivate_existing: true }),
      }
    )
    if (!res.ok) {
      console.error('[beehiiv] subscribe failed', res.status, await res.text())
    }
  } catch (err) {
    console.error('[beehiiv] subscribe error', err)
  }
}

export async function unsubscribeFromBeehiiv(email: string): Promise<void> {
  if (!process.env.BEEHIIV_API_KEY || !process.env.BEEHIIV_PUBLICATION_ID) {
    console.warn('[beehiiv] BEEHIIV_API_KEY or BEEHIIV_PUBLICATION_ID not set — skipping unsubscribe')
    return
  }

  try {
    const pubId = process.env.BEEHIIV_PUBLICATION_ID
    const encodedEmail = encodeURIComponent(email)
    const res = await fetch(
      `https://api.beehiiv.com/v2/publications/${pubId}/subscriptions/by_email/${encodedEmail}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${process.env.BEEHIIV_API_KEY}`,
        },
      }
    )
    // 404 treated as success — subscriber may not exist
    if (!res.ok && res.status !== 404) {
      console.error('[beehiiv] unsubscribe failed', res.status, await res.text())
    }
  } catch (err) {
    console.error('[beehiiv] unsubscribe error', err)
  }
}
